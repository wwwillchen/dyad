import os
from collections import defaultdict
from dataclasses import asdict, dataclass
from typing import Literal

from pydantic import BaseModel

from dyad.agent_api.agent import get_named_agents
from dyad.storage.models.pad import get_pads
from dyad.todo_parser import TodoComment, get_todos


class SuggestionsQuery(BaseModel):
    query: str = ""
    type: Literal["#", "@"]


_suggestion_dict: dict[
    str, dict[str, float]
] = {}  # {category: {suggestion: mtime}}
_directory_dict: dict[str, set[str]] = defaultdict(
    set
)  # {directory: set(files)}


def add_suggestion(category: str, suggestion: str, mtime: float | None = None):
    if category not in _suggestion_dict:
        _suggestion_dict[category] = {}
    _suggestion_dict[category][suggestion] = mtime or 0.0

    if category == "file":
        dir_path = os.path.dirname(suggestion)
        if dir_path:
            _directory_dict[dir_path].add(suggestion)


def remove_suggestion(category: str, suggestion: str):
    if (
        category in _suggestion_dict
        and suggestion in _suggestion_dict[category]
    ):
        del _suggestion_dict[category][suggestion]

        if category == "file":
            dir_path = os.path.dirname(suggestion)
            if dir_path in _directory_dict:
                _directory_dict[dir_path].discard(suggestion)
                if not _directory_dict[dir_path]:
                    del _directory_dict[dir_path]


@dataclass
class Suggestion:
    type: str
    value: str
    name: str
    description: str
    icon: str | None = None


@dataclass
class FileSuggestion:
    modification_time: float
    filename: str
    dir_path: str
    filepath: str


@dataclass
class DirectorySuggestion:
    path: str
    name: str
    file_count: int
    latest_mtime: float


file_extenstion_to_icon_map: dict[str, str] = {
    # Programming Languages
    "ts": "typescript.svg",
    "js": "javascript.svg",
    "py": "python.svg",
    "java": "java.svg",
    "cpp": "cplusplus.svg",
    "c": "c.svg",
    "cs": "csharp.svg",
    "go": "go.svg",
    "rb": "ruby.svg",
    "php": "php.svg",
    "swift": "swift.svg",
    "kt": "kotlin.svg",
    "rs": "rust.svg",
    # Web Technologies
    "html": "html5.svg",
    "css": "css3.svg",
    "scss": "sass.svg",
    "jsx": "react.svg",
    "tsx": "react.svg",
    "vue": "vuejs.svg",
    # Data
    "md": "markdown.svg",
    "json": "nodejs.svg",
    "sql": "mysql.svg",
}


def get_directory_suggestions(
    query: str | None = None,
) -> list[DirectorySuggestion]:
    """Get suggestions for directories containing tracked files."""
    suggestions = []

    for dir_path, _ in _directory_dict.items():
        # Get all files that start with this directory path (including subdirectories)
        all_dir_files = [
            f
            for f in _suggestion_dict.get("file", {})
            if f.startswith(dir_path + os.path.sep) or f == dir_path
        ]

        # Get latest modification time from all files in directory and subdirectories
        if all_dir_files:
            latest_mtime = max(
                _suggestion_dict.get("file", {}).get(f, 0.0)
                for f in all_dir_files
            )
        else:
            # just in case all_dir_files is empty (shouldn't happen), avoid an error
            # with max() and just set latest_mtime to 0
            latest_mtime = 0.0

        suggestions.append(
            DirectorySuggestion(
                path=dir_path,
                name=os.path.basename(dir_path) or dir_path,
                file_count=len(
                    all_dir_files
                ),  # Count all files including subdirectories
                latest_mtime=latest_mtime
                * 0.9,  # Slightly reduce directory ranking
            )
        )

    # Sort by latest modification time
    suggestions.sort(key=lambda x: x.latest_mtime, reverse=True)

    if query:
        # Filter by query
        query = query.lower()
        suggestions = [
            s
            for s in suggestions
            if query in s.path.lower() or query in s.name.lower()
        ]

    return suggestions


def get_all_files() -> list[str]:
    return list(_suggestion_dict.get("file", {}).keys())


def get_recent_todos(limit: int) -> list[TodoComment]:
    # TODO: optimize this
    recent_files = get_recent_file_suggestions(limit=5)
    todos = []
    for file_suggestion in recent_files:
        todos.extend(get_todos(file_suggestion.filepath))
        if len(todos) >= limit:
            break
    return todos[:limit]


def get_recent_file_suggestions(limit: int) -> list[FileSuggestion]:
    """
    Returns the 10 most recently modified files as FileSuggestion instances.
    Files are sorted by modification time in descending order.
    """
    if "file" not in _suggestion_dict:
        return []

    # Sort files by modification time (mtime) in descending order
    recent_files = sorted(
        _suggestion_dict["file"].items(),
        key=lambda x: x[1],  # x[1] is the mtime
        reverse=True,  # Most recent first
    )[:limit]  # Take only the limit number of most recent files

    # Convert to FileSuggestion instances
    suggestions = [
        FileSuggestion(
            modification_time=mtime,
            filepath=filepath,
            filename=filepath.split("/")[-1],
            dir_path="/".join(filepath.split("/")[:-1]),
        )
        for filepath, mtime in recent_files
    ]

    return suggestions


SPECIAL_SUGGESTIONS = [
    Suggestion(
        type="codebase",
        value="codebase",
        name="codebase",
        description="Searches for relevant files in the codebase",
    ),
    Suggestion(
        type="codebase",
        value="codebase-all",
        name="codebase-all",
        description="Uses the ENTIRE codebase as context",
    ),
    Suggestion(
        type="filetree",
        value="filetree",
        name="filetree",
        description="Displays a file tree",
    ),
]


def get_suggestions(query: SuggestionsQuery | None) -> list[dict[str, str]]:
    if not query:
        return []

    if query.type == "#":
        return get_hashtag_suggestions(query.query)
    elif query.type == "@":
        return get_agent_suggestions(query.query)
    raise ValueError(f"Invalid query type: {query.type}")


def get_agent_suggestions(query: str | None = None) -> list[dict[str, str]]:
    agents = get_named_agents()

    if not query:
        # If no query, return all agents
        return [
            asdict(
                Suggestion(
                    name=agent.name,
                    value=agent.name,
                    description=agent.description,
                    type="agent",
                )
            )
            for agent in agents
        ]

    def score_agent(agent_name: str, query: str) -> float:
        from difflib import SequenceMatcher

        # Convert both to lowercase for case-insensitive matching
        agent_name = agent_name.lower()
        query = query.lower()

        # Direct match gets highest score
        if query == agent_name:
            return 1.0

        # Starts with gets high score
        if agent_name.startswith(query):
            return 0.9

        # Contains gets medium score
        if query in agent_name:
            return 0.7

        # Use sequence matcher for fuzzy matching
        return SequenceMatcher(None, agent_name, query).ratio()

    # Score and sort agents
    scored_agents = [
        (agent, score_agent(agent.name, query)) for agent in agents
    ]

    # Sort by score descending
    scored_agents.sort(key=lambda x: (-x[1], len(x[0].name)))

    # Return top 10 matches as agent suggestions
    return [
        asdict(
            Suggestion(
                name=agent.name,
                value=agent.name,
                description=agent.description,
                type="agent",
            )
        )
        for agent, score in scored_agents[:10]
        if score > 0.2  # Only include reasonably good matches
    ]


def get_hashtag_suggestions(query: str | None = None) -> list[dict[str, str]]:
    if "file" not in _suggestion_dict:
        return []

    file_suggestions = sorted(
        _suggestion_dict["file"].items(), key=lambda x: x[1], reverse=True
    )

    # Get directory suggestions
    dir_suggestions = [
        Suggestion(
            type="directory",
            value=f"dir:{d.path}",
            name=d.name,
            description=f"{d.file_count} files in {d.path}",
            icon="folder.svg",  # Add appropriate folder icon
        )
        for d in get_directory_suggestions(query)
    ]

    file_suggestions = [
        Suggestion(
            type="file",
            value=f"file:{filepath}",
            name=filepath.split("/")[-1],
            description="/".join(filepath.split("/")[:-1]),
            icon=file_extenstion_to_icon_map.get(filepath.split(".")[-1], None),
        )
        for filepath, _ in file_suggestions
    ]

    pad_suggestions = [
        Suggestion(
            type="pad",
            value=f"pad:{pad.id}",
            name=pad.title,
            description=pad.content[:40],
        )
        for pad in get_pads()
    ]

    if not query:
        # Interleave directories and files, with files having slight priority
        suggestions = []
        dir_index = 0
        file_index = 0

        while dir_index < len(dir_suggestions) or file_index < len(
            file_suggestions
        ):
            # Add 2 files for every directory to give files higher priority
            for _ in range(2):
                if file_index < len(file_suggestions):
                    suggestions.append(file_suggestions[file_index])
                    file_index += 1

            if dir_index < len(dir_suggestions):
                suggestions.append(dir_suggestions[dir_index])
                dir_index += 1

        return [
            asdict(s)
            for s in [
                *suggestions[:15],  # Limit combined suggestions
                *SPECIAL_SUGGESTIONS,
            ]
        ]

    # Rest of the function remains the same
    if query.startswith("pad:") or query.startswith("p:"):
        all_suggestions = [*pad_suggestions]
    elif query.startswith("file:") or query.startswith("f:"):
        all_suggestions = [*file_suggestions]
    elif query.startswith("dir:") or query.startswith("d:"):
        all_suggestions = [*dir_suggestions]
    else:
        all_suggestions = [
            *dir_suggestions,
            *file_suggestions,
            *pad_suggestions,
            *SPECIAL_SUGGESTIONS,
        ]

    def score_suggestion(suggestion: Suggestion, query: str) -> float:
        from difflib import SequenceMatcher

        name_score = SequenceMatcher(
            None, suggestion.name.lower(), query.lower()
        ).ratio()
        path_score = SequenceMatcher(
            None, suggestion.description.lower(), query.lower()
        ).ratio()

        # Reduce directory scores slightly
        base_score = (name_score * 0.7) + (path_score * 0.3)
        if suggestion.type == "directory":
            return base_score * 0.9  # Reduce directory scores by 10%

        return base_score

    scored_suggestions = [
        (s, score_suggestion(s, query)) for s in all_suggestions
    ]
    scored_suggestions.sort(key=lambda x: (-x[1], len(x[0].value)))

    return [asdict(s[0]) for s in scored_suggestions[:10]]

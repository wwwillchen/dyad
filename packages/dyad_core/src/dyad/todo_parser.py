import os
from dataclasses import dataclass
from pathlib import Path

from dyad.logging.logging import logger
from dyad.workspace_util import get_workspace_path


@dataclass
class TodoComment:
    """Represents a TODO comment in code."""

    text: str
    code_context: str
    line_range: tuple[int, int]
    file_path: str


def get_language_from_file_path(file_path: str) -> str:
    """Get the tree-sitter language name from file extension."""
    _, extension = os.path.splitext(file_path)
    # Remove the leading dot from the extension
    extension = extension.lstrip(".")
    # Map common file extensions to language names
    language_map = {
        "py": "python",
        "js": "javascript",
        "ts": "typescript",
        "html": "html",
        "css": "css",
        "java": "java",
        "cpp": "cpp",
        "c": "c",
        "go": "go",
        "rb": "ruby",
        "php": "php",
        "swift": "swift",
        "kt": "kotlin",
        "rs": "rust",
    }
    return language_map.get(extension, extension)


class TodoParser:
    """Parser for extracting TODO comments from code files using tree-sitter."""

    def __init__(self):
        self.parsers = {}  # Cache parsers by language
        self.languages = {}  # Cache language objects by language name

    def _get_comment_query(self, language_name: str) -> str:
        """Get the appropriate comment query for the given language."""
        # Language-specific queries
        queries = {
            "python": """
                (comment) @comment
            """,
            "javascript": """
                (comment) @comment
                (hash_bang_line) @comment
            """,
            "typescript": """
                (comment) @comment
                (hash_bang_line) @comment
            """,
            "java": """
                (line_comment) @comment
                (block_comment) @comment
            """,
            "cpp": """
                (comment) @comment
            """,
            "c": """
                (comment) @comment
            """,
            "ruby": """
                (comment) @comment
            """,
            "go": """
                (comment) @comment
            """,
            "rust": """
                (line_comment) @comment
                (block_comment) @comment
            """,
        }
        # Default query if language not found
        return queries.get(language_name, "(comment) @comment")

    def _get_parser(self, file_path: str):
        from tree_sitter_languages import get_language, get_parser

        """Get or create a parser for the given file type."""
        language_name = get_language_from_file_path(file_path)
        if language_name not in self.parsers:
            parser = get_parser(language_name)
            language = get_language(language_name)
            parser.set_language(language)
            self.parsers[language_name] = parser
            self.languages[language_name] = language
        return (
            self.parsers[language_name],
            self.languages[language_name],
            language_name,
        )

    def _extract_todo_text(self, comment_text: str) -> str:
        """Extract the actual TODO message from a comment."""
        # Remove comment symbols and 'TODO' prefix
        text = comment_text.lstrip("#/").strip()
        if "TODO" in text:
            text = text[text.find("TODO") + 4 :].strip()
        return text

    def _get_context(
        self, source_code: str, start_line: int, end_line: int
    ) -> str:
        """Get the code context around the TODO comment."""
        lines = source_code.splitlines()
        # Get a few lines after for context
        context_start = max(0, start_line)
        context_end = min(len(lines), end_line + 3)
        return "\n".join(lines[context_start:context_end])

    def parse_file(self, file_path: str) -> list[TodoComment]:
        """Parse a file and extract all TODO comments."""
        try:
            with open(get_workspace_path(file_path), encoding="utf-8") as f:
                source_code = f.read()
        except Exception as e:
            logger().debug(f"Error reading file for TODO: {file_path}: {e}")
            return []

        parser, language, language_name = self._get_parser(file_path)
        if not parser or not language:
            return []

        tree = parser.parse(bytes(source_code, "utf8"))
        todos = []

        # Get language-specific query
        query_string = self._get_comment_query(language_name)
        query = language.query(query_string)

        for match in query.captures(tree.root_node):
            comment_node = match[0]
            try:
                comment_text = comment_node.text.decode("utf8")
            except UnicodeDecodeError:
                continue

            # Check if this is a TODO comment
            if "TODO" in comment_text:
                start_point = comment_node.start_point
                end_point = comment_node.end_point

                todo = TodoComment(
                    text=self._extract_todo_text(comment_text),
                    code_context=self._get_context(
                        source_code, start_point[0], end_point[0]
                    ),
                    line_range=(start_point[0] + 1, end_point[0] + 1),
                    file_path=file_path,
                )
                todos.append(todo)

        return todos

    def parse_directory(
        self, directory_path: str, file_extensions: set[str] | None = None
    ) -> list[TodoComment]:
        """Recursively parse all files in a directory for TODO comments."""
        if file_extensions is None:
            file_extensions = {
                ".py",
                ".js",
                ".ts",
                ".java",
                ".cpp",
                ".c",
                ".go",
                ".rb",
                ".php",
            }

        todos = []
        directory = Path(directory_path)

        for file_path in directory.rglob("*"):
            if file_path.suffix in file_extensions:
                try:
                    file_todos = self.parse_file(str(file_path))
                    todos.extend(file_todos)
                except Exception as e:
                    print(f"Error parsing {file_path}: {e}")

        return todos


def get_todos(file_path: str) -> list[TodoComment]:
    """
    Convenience function to get all TODOs from a file or directory.
    Returns a list of TodoComment objects matching the structure in state.py

    Args:
        path: Path to file or directory to parse
        file_extensions: Optional set of file extensions to parse (e.g. {'.py', '.js'})
                        If None, defaults to common programming languages

    Returns:
        List of TodoComment objects
    """
    try:
        parser = TodoParser()
        path_obj = Path(get_workspace_path(file_path))

        if path_obj.is_file():
            return parser.parse_file(file_path)
        elif path_obj.is_dir():
            logger().info("Skipping parsing directory for TODOs")
            return []
        else:
            raise ValueError(f"Path {file_path} does not exist")
    except Exception as e:
        logger().error(f"Error parsing TODOs: {e}")
        return []

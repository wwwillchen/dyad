from collections.abc import Iterable

from pathspec import PathSpec


def get_matching_files(
    file_candidates: Iterable[str], glob_pattern: str
) -> list[str]:
    spec = PathSpec.from_lines("gitignore", [glob_pattern])
    matched_files = spec.match_files(file_candidates)
    res = [str(file) for file in matched_files]
    return res


def has_matching_files(
    file_candidates: Iterable[str], glob_pattern: str
) -> bool:
    return len(get_matching_files(file_candidates, glob_pattern)) > 0

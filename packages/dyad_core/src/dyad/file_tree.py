def create_file_tree(files: list[str]) -> str:
    """
    Creates a visual file tree representation from a list of file paths.

    Args:
        files (list): List of file paths (strings) using forward slashes as separators

    Returns:
        str: Formatted string showing the file tree structure
    """
    # Sort files for consistent output
    files = sorted(files)

    # Split paths into components
    paths = [path.split("/") for path in files]

    def build_tree(
        current_path: list[str], depth: int, paths: list[list[str]]
    ) -> list[str]:
        result: list[str] = []
        current_dir = current_path[depth] if depth < len(current_path) else None

        # Group all paths that share the same component at current depth
        matching_paths = [
            p for p in paths if depth < len(p) and p[depth] == current_dir
        ]

        if current_dir:
            # Add directory or file entry
            indent = "  " * depth
            if (
                depth == len(current_path) - 1 and "." in current_dir
            ):  # It's a file
                result.append(f"{indent}{current_dir}")
            else:  # It's a directory
                result.append(f"{indent}{current_dir}/")

        # Process subdirectories and files
        if depth < len(current_path) - 1 or matching_paths:
            # Get unique next-level components
            next_components = sorted(
                set(p[depth + 1] for p in matching_paths if len(p) > depth + 1)
            )

            # Recursively process each component
            for component in next_components:
                next_paths = [
                    p
                    for p in matching_paths
                    if len(p) > depth + 1 and p[depth + 1] == component
                ]
                if next_paths:
                    result.extend(
                        build_tree(next_paths[0], depth + 1, next_paths)
                    )

        return result

    # Start building the tree from root
    if not paths:
        return ""

    # Handle root-level files (files without directories)
    root_files = [path[0] for path in paths if len(path) == 1]
    root_dirs = [path[0] for path in paths if len(path) > 1]

    # Build the tree for directories
    result: list[str] = []
    for dir_name in sorted(set(root_dirs)):
        dir_paths = [path for path in paths if path[0] == dir_name]
        result.extend(build_tree(dir_paths[0], 0, dir_paths))

    # Add root-level files to the result
    for file_name in sorted(root_files):
        result.append(file_name)

    return "\n".join(result)


# Example usage
if __name__ == "__main__":
    # Test cases
    files = [
        "mkdocs.yml",
        "pyproject.toml",
        "docs/index.md",
        "docs/features/index.md",
        "docs/features/models.md",
        "docs/features/code-editing.md",
        "docs/internal/development.md",
    ]

    print(create_file_tree(files))

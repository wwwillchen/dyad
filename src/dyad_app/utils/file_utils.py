import os


def get_language_from_file_path(file_path: str):
    # Get the file extension
    _, extension = os.path.splitext(file_path)

    # Remove the leading dot from the extension
    extension = extension.lstrip(".")

    # Map common file extensions to language names
    language_map = {
        "py": "python",
        "js": "javascript",
        "jsx": "javascript",
        "ts": "typescript",
        "tsx": "typescript",
        "html": "html",
        "css": "css",
        "java": "java",
        "cpp": "cpp",
        "cc": "cpp",
        "h": "cpp",
        "c": "c",
        "go": "go",
        "rb": "ruby",
        "php": "php",
        "swift": "swift",
        "kt": "kotlin",
        "rs": "rust",
        # Add more mappings as needed
    }

    # Return the language name if found, otherwise return the extension
    return language_map.get(extension.lower(), extension.lower())

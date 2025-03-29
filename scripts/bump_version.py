"""
uv run --python=python3.11 scripts/bump_version.py -v 0.2.0
"""
#!/usr/bin/env python3

import argparse
import subprocess
import sys
from pathlib import Path

import tomllib


def format_toml_value(value):
    """Format a value for TOML output."""
    if isinstance(value, str):
        return f'"{value}"'
    elif isinstance(value, bool):
        return str(value).lower()
    return str(value)


def update_version_py(file_path: Path, target_version: str) -> bool:
    """
    Update the version in a version.py file.
    Returns True if the file was modified, False otherwise.
    """
    try:
        content = file_path.read_text()
        version_line = f'VERSION = "{target_version}"'

        if f'VERSION = "{target_version}"' in content:
            return False

        new_content = content.replace(
            f'''VERSION = "{content.split("VERSION = ")[1].split('"')[1]}"''',
            version_line,
        )

        file_path.write_text(new_content)
        print(f"Updated {file_path} to version {target_version}")
        return True

    except Exception as e:
        print(f"Error processing {file_path}: {e!s}", file=sys.stderr)
        return False


def update_version(file_path: Path, target_version: str) -> bool:
    """
    Update the version in a pyproject.toml file.
    Returns True if the file was modified, False otherwise.
    """
    try:
        # Read and parse the current content
        with open(file_path, "rb") as f:
            content = tomllib.load(f)

        # Check if project section exists
        if "project" not in content:
            print(
                f"Warning: No 'project' section in {file_path}", file=sys.stderr
            )
            return False

        # Read the file lines
        lines = file_path.read_text().splitlines()
        modified = False

        # Find and replace the version line and dependencies
        in_project_section = False
        in_dependencies = False
        for i, line in enumerate(lines):
            stripped = line.strip()

            if stripped.startswith("[project]"):
                in_project_section = True
            elif stripped.startswith("["):
                in_project_section = False
                in_dependencies = False

            # Update main version
            if in_project_section and stripped.startswith("version"):
                if content["project"].get("version") != target_version:
                    lines[i] = f'version = "{target_version}"'
                    modified = True

            # Handle dependencies section
            if in_project_section and stripped.startswith("dependencies"):
                in_dependencies = True
                continue

            if in_dependencies and stripped.startswith('"dyad-'):
                # Extract package name
                package_name = stripped.split("==")[0].strip('"[], ')
                if package_name:
                    # Update to new version
                    lines[i] = f'    "{package_name}=={target_version}",'
                    modified = True

        if modified:
            # Write back the modified content
            file_path.write_text("\n".join(lines) + "\n")
            print(f"Updated {file_path} to version {target_version}")
            return True

        return False

    except Exception as e:
        print(f"Error processing {file_path}: {e!s}", file=sys.stderr)
        return False


def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description="Update version in pyproject.toml files"
    )
    parser.add_argument(
        "--version", "-v", required=True, help="Target version to set"
    )
    parser.add_argument(
        "--cli", required=False, default=False, help="Bump CLI version"
    )
    args = parser.parse_args()

    # Get the root directory (where the script is run from)
    root_dir = Path.cwd()

    # Track if any files were modified
    files_modified = False

    # Update root pyproject.toml if not in CLI mode
    if not args.cli:
        root_pyproject = root_dir / "pyproject.toml"
        files_modified |= update_version(root_pyproject, args.version)

    # Update all pyproject.toml files in packages/*/
    packages_dir = root_dir / "packages"
    if packages_dir.exists():
        for package_dir in packages_dir.iterdir():
            if package_dir.is_dir():
                if args.cli and package_dir.name != "dyad_cli":
                    continue
                if not args.cli and package_dir.name == "dyad_cli":
                    continue
                if args.cli and package_dir.name == "dyad_cli":
                    version_py = package_dir / "src" / "dyad_cli" / "version.py"
                    files_modified |= update_version_py(
                        version_py, args.version
                    )
                pyproject = package_dir / "pyproject.toml"
                if pyproject.exists():
                    files_modified |= update_version(pyproject, args.version)
                if package_dir.name == "dyad_core":
                    version_py = package_dir / "src" / "dyad" / "version.py"
                    files_modified |= update_version_py(
                        version_py, args.version
                    )

    # Run subprocess "uv lock
    subprocess.run(["uv", "lock"], check=True)

    # Exit with status code 1 if no files were modified
    sys.exit(0 if files_modified else 1)


if __name__ == "__main__":
    main()

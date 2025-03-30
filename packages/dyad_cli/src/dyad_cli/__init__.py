import concurrent.futures
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Literal, TypedDict

# Type-checking fails because we don't depend on dyad-cli package
# since it's a special case where dyad-cli depends on everything else.
import uv  # type: ignore

from dyad_cli.user_data_dir_utils import get_user_data_dir
from dyad_cli.version import VERSION as __version__

# ANSI escape codes for colors
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
RESET = "\033[0m"
BOLD = "\033[1m"

DYAD_CLI_HOME_DIR = Path(get_user_data_dir())
CLI_JSON_PATH = DYAD_CLI_HOME_DIR / "cli.json"
EXTENSIONS_DIR = DYAD_CLI_HOME_DIR / "extensions"
EXTENSIONS_REQUIREMENTS_PATH = EXTENSIONS_DIR / "requirements.txt"

# Constants for retry mechanism
MAX_RETRIES = 1
INITIAL_RETRY_DELAY = 1  # seconds


class CliConfig(TypedDict):
    skip_updates_for_version: str


BASE_INSTALL_CMD = [
    "pip",
    "install",
    "--upgrade",
]


def get_cli_config() -> CliConfig:
    """Get stored upgrade preferences from user config file."""
    default_config: CliConfig = {
        "skip_updates_for_version": "",
    }

    if CLI_JSON_PATH.exists():
        try:
            with open(CLI_JSON_PATH) as f:
                return json.load(f)
        except OSError as e:
            print(f"{RED}Failed to load upgrade preferences: {e}{RESET}")
            return default_config
    return default_config


def save_cli_config(preferences: CliConfig) -> None:
    """Save upgrade preferences to user config file."""
    DYAD_CLI_HOME_DIR.mkdir(exist_ok=True)
    with open(CLI_JSON_PATH, "w") as f:
        json.dump(preferences, f)


def fetch_package_version(package_name: str) -> str | None:
    """
    Fetch the latest version of a package from PyPI using urllib with retry mechanism.
    Uses exponential backoff for retries.
    """
    for attempt in range(MAX_RETRIES):
        try:
            url = f"https://pypi.org/pypi/{package_name}/json"
            with urllib.request.urlopen(url, timeout=10) as response:
                if response.status == 200:
                    data = json.loads(response.read())
                    return data["info"]["version"]
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
            delay = INITIAL_RETRY_DELAY * (2**attempt)  # exponential backoff
            if (
                attempt < MAX_RETRIES - 1
            ):  # Don't print "retrying" on last attempt
                print(
                    f"{YELLOW}Failed to fetch version for {package_name}, retrying in {delay}s: {e}{RESET}"
                )
                time.sleep(delay)
            else:
                print(
                    f"{YELLOW}Failed to fetch latest version for {package_name} from PyPI: {e}{RESET}"
                )
    return None


def fetch_versions() -> tuple[str | None, str | None]:
    """Fetch both CLI and app versions concurrently using ThreadPoolExecutor."""
    cli_package = os.environ.get("DYAD_CLI_PACKAGE_NAME", "dyad")
    app_package = os.environ.get("DYAD_APP_PACKAGE_NAME", "dyad_app")

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        # Submit both fetch tasks
        future_cli = executor.submit(fetch_package_version, cli_package)
        future_app = executor.submit(fetch_package_version, app_package)

        # Wait for both to complete
        cli_version = future_cli.result()
        app_version = future_app.result()

        return cli_version, app_version


def check_package_version(
    cli_config: CliConfig,
    latest_version: str | None,
    package_name: str | None = None,
    current_version: str | None = None,
    save_prefs_fn: Callable[[CliConfig], None] = save_cli_config,
    input_fn: Callable[[str], str] = input,
    install_fn: Callable[..., int] = subprocess.check_call,
) -> Literal[
    "latest-version-already",
    "upgrade-skipped-previously",
    "upgrade-succeeded",
    "upgrade-failed",
    "user-skipped",
    "check-failed",
    "check-request-failed",
]:
    """
    Check if the current package is at the latest version.
    Returns a string indicating the status of the version check/upgrade.
    If upgrade succeeds, exits the program and prompts user to restart.
    """
    package_name = package_name or os.environ.get(
        "DYAD_CLI_PACKAGE_NAME", "dyad"
    )
    try:
        current_version = current_version or __version__

        if not latest_version:
            return "check-request-failed"

        if current_version != latest_version:
            if cli_config["skip_updates_for_version"] == latest_version:
                return "upgrade-skipped-previously"

            install_cmd = [*BASE_INSTALL_CMD, f"{package_name}"]
            print(
                f"\n{YELLOW}→ A new version of the Dyad CLI package ({package_name}) is available!{RESET}"
            )
            response = input_fn(
                f"Would you like to upgrade to version {latest_version} now? (y/n): "
            ).lower()

            if response == "y":
                try:
                    install_fn(install_cmd)
                    print(
                        f"{GREEN}Successfully upgraded to version {latest_version}!{RESET}"
                    )
                    print(
                        f"\n{YELLOW}Please run dyad again to use the latest version.{RESET}"
                    )
                    sys.exit(0)  # Exit after successful upgrade
                except subprocess.CalledProcessError:
                    print(
                        f"{RED}Failed to upgrade automatically. You can upgrade manually with:{RESET}"
                    )
                    print(f"{BOLD}{GREEN}{' '.join(install_cmd)}{RESET}\n")
                    return "upgrade-failed"
            else:
                print(f"{YELLOW}Skipping upgrade for now.{RESET}")
                cli_config["skip_updates_for_version"] = latest_version
                save_prefs_fn(cli_config)
                return "user-skipped"

        return "latest-version-already"

    except Exception as e:
        print(
            f"{YELLOW}Failed to check for Dyad CLI package updates because of error{RESET}",
            e,
        )
        print(f"{YELLOW}Continuing...{RESET}")
        return "check-failed"


def get_command_args(
    uv_bin: str,
    app_version: str | None,
    additional_args: list[str] | None = None,
    *,
    is_offline: bool = False,
    refresh_extensions: bool = False,
    allow_prerelease: bool = False,
) -> list[str]:
    """Generate command arguments for uv tool."""
    # Use the underscore version so that the CLI name matches.
    package_name = os.environ.get("DYAD_APP_PACKAGE_NAME", "dyad_app")
    base_args = [
        uv_bin,
        "tool",
        "run",
        "--python=python3.12",
    ]

    if is_offline or app_version is None:
        if is_offline:
            print(f"{YELLOW}Running in offline mode{RESET}")
            base_args.append("--offline")
        if app_version is None:
            print(
                f"{YELLOW}Failed to fetch latest version, falling back to 'latest'{RESET}"
            )

    # Allow user to override the app version if needed.
    if os.environ.get("DYAD_APP_VERSION"):
        app_version = os.environ.get("DYAD_APP_VERSION")
    if allow_prerelease:
        print(f"{YELLOW}Allowing pre-release versions{RESET}")
        base_args.append("--prerelease")
        base_args.append("allow")
    if EXTENSIONS_REQUIREMENTS_PATH.exists():
        base_args.extend(
            [
                "--with-requirements",
                f"{EXTENSIONS_REQUIREMENTS_PATH}",
            ]
        )
        if refresh_extensions:
            base_args.append("--refresh")

    base_args.append(f"{package_name}@{app_version}")
    if additional_args:
        base_args.extend(additional_args)
    return base_args


def execute_command(command: list[str]) -> None:
    """Execute a command and handle errors."""
    print(f"{YELLOW}Running command: {' '.join(command)}{RESET}")
    try:
        subprocess.check_call(command)
    except subprocess.CalledProcessError as e:
        print(f"{RED}Failed to run dyad: {e}{RESET}")
        sys.exit(1)


def run(
    uv_finder=uv.find_uv_bin,
    command_executor=execute_command,
    check_package_version=check_package_version,
    args: list[str] | None = None,
) -> None:
    """Main function with injectable dependencies for better testing."""
    try:
        uv_bin = uv_finder()

        # Fetch both versions concurrently with retry mechanism
        cli_version, app_version = fetch_versions()
        is_offline = cli_version is None and app_version is None

        check_package_version(
            cli_config=get_cli_config(), latest_version=cli_version
        )

        # Extract args and check for flags
        args_list = args or sys.argv[1:]
        refresh_extensions = "--refresh-extensions" in args_list
        allow_prerelease = "--pre" in args_list

        # Remove flags that we handle specially
        if refresh_extensions:
            args_list.remove("--refresh-extensions")
        if allow_prerelease:
            args_list.remove("--pre")

        command_args = get_command_args(
            uv_bin,
            app_version,
            args_list,
            is_offline=is_offline,
            refresh_extensions=refresh_extensions,
            allow_prerelease=allow_prerelease,
        )

        command_executor(command_args)
        command_executor([uv_bin, "tool", "update-shell"])
    except Exception as e:
        print(f"{RED}Unexpected error running dyad: {e}{RESET}")
        sys.exit(1)


if __name__ == "__main__":
    run()

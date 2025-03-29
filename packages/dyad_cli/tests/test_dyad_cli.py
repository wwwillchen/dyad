import json
import os
import subprocess
from unittest.mock import MagicMock, patch

import pytest
from dyad_cli import (
    BASE_INSTALL_CMD,
    EXTENSIONS_REQUIREMENTS_PATH,
    CliConfig,
    __version__,
    check_package_version,
    execute_command,
    flatten,
    get_cli_config,
    get_command_args,
    save_cli_config,
)


@pytest.fixture
def mock_cli_json_path(tmp_path):
    """
    A fixture to temporarily redirect CLI_JSON_PATH to a temp directory.
    This avoids writing to the actual filesystem.
    """
    test_path = tmp_path / "cli.json"

    with patch("dyad_cli.CLI_JSON_PATH", test_path):
        yield test_path

    # After yield, patch is undone, so CLI_JSON_PATH is restored.


@pytest.fixture
def mock_dyad_cli_home_dir(tmp_path):
    """
    Similar idea for DYAD_CLI_HOME_DIR and any related directories.
    """
    test_home = tmp_path

    with patch("dyad_cli.DYAD_CLI_HOME_DIR", test_home):
        yield test_home


@pytest.fixture
def mock_env():
    """
    If you want to control environment variables in tests, you can do so here.
    """
    # Copy of original environment
    original_env = os.environ.copy()
    # Modify as needed
    os.environ["DYAD_CLI_PACKAGE_NAME"] = "dyad-app"
    yield
    # Restore original environment
    os.environ.clear()
    os.environ.update(original_env)


#
# Tests for get_cli_config
#


def test_get_cli_config_file_not_exists(mock_cli_json_path):
    """If the CLI JSON file doesn't exist, return the default config."""
    # We don't create the file in mock_cli_json_path, so it doesn't exist
    config: CliConfig = get_cli_config()
    assert config["skip_updates_for_version"] == ""


def test_get_cli_config_file_exists_valid_json(mock_cli_json_path):
    """If the CLI JSON file exists with valid JSON, ensure it's parsed correctly."""
    mock_cli_json_path.write_text(
        json.dumps({"skip_updates_for_version": "1.2.3"})
    )

    config: CliConfig = get_cli_config()
    assert config["skip_updates_for_version"] == "1.2.3"


def test_get_cli_config_file_exists_os_error(mock_cli_json_path):
    """If there's an OSError while reading, ensure default config is returned."""
    # We'll mock open to raise OSError
    with patch("builtins.open", side_effect=OSError("Cannot open file")):
        config: CliConfig = get_cli_config()
        assert config["skip_updates_for_version"] == ""


#
# Tests for save_cli_config
#


def test_save_cli_config(mock_cli_json_path, mock_dyad_cli_home_dir):
    """Verify that preferences are saved to the correct file."""
    save_cli_config({"skip_updates_for_version": "2.0.0"})

    # Ensure the file is created and content matches
    assert mock_cli_json_path.exists()
    with mock_cli_json_path.open() as f:
        data = json.load(f)
    assert data["skip_updates_for_version"] == "2.0.0"


#
# Tests for check_package_version
#


@patch("dyad_cli.requests.get")
def test_check_package_version_latest_already(mock_requests, mock_env):
    """
    Test scenario where current_version == latest_version from PyPI.
    We expect 'latest-version-already' to be returned.
    """
    mock_requests.return_value.json.return_value = {
        "info": {"version": __version__}
    }

    config: CliConfig = {"skip_updates_for_version": ""}
    result = check_package_version(
        cli_config=config, current_version=__version__
    )
    assert result == "latest-version-already"


@patch("dyad_cli.requests.get")
def test_check_package_version_already_skipped(mock_requests, mock_env):
    """
    Test scenario where the user has previously skipped the latest version.
    """
    mock_requests.return_value.json.return_value = {
        "info": {"version": "1.2.3"}
    }

    config: CliConfig = {"skip_updates_for_version": "1.2.3"}
    result = check_package_version(cli_config=config, current_version="1.0.0")
    assert result == "upgrade-skipped-previously"


@patch("dyad_cli.requests.get")
def test_check_package_version_success_upgrade(mock_requests, mock_env):
    """
    Test scenario where user chooses to upgrade and it succeeds.
    """
    mock_requests.return_value.json.return_value = {
        "info": {"version": "1.2.3"}
    }
    input_fn = MagicMock(return_value="y")
    mock_subprocess = MagicMock()
    # Mock input to say "y", so user consents to upgrade

    config: CliConfig = {"skip_updates_for_version": ""}
    result = check_package_version(
        cli_config=config,
        current_version="1.0.0",
        input_fn=input_fn,
        install_fn=mock_subprocess,
    )
    assert result == "upgrade-succeeded"
    # Ensure the install command was called
    mock_subprocess.assert_called_once()
    called_args = mock_subprocess.call_args[0][0]
    assert called_args[: len(BASE_INSTALL_CMD)] == BASE_INSTALL_CMD


@patch("dyad_cli.requests.get")
def test_check_package_version_upgrade_failure(mock_requests, mock_env):
    """
    Test scenario where user chooses to upgrade but the install fails.
    """
    mock_requests.return_value.json.return_value = {
        "info": {"version": "1.2.3"}
    }
    input_fn = MagicMock(return_value="y")

    def fake_install_fn(install_cmd):
        raise subprocess.CalledProcessError(1, "cmd")

    config: CliConfig = {"skip_updates_for_version": ""}
    result = check_package_version(
        cli_config=config,
        current_version="1.0.0",
        input_fn=input_fn,
        install_fn=fake_install_fn,
    )
    assert result == "upgrade-failed"


@patch("dyad_cli.requests.get")
def test_check_package_version_user_skips(mock_requests, mock_env):
    """
    Test scenario where user chooses not to upgrade.
    """
    mock_requests.return_value.json.return_value = {
        "info": {"version": "1.2.3"}
    }
    # User inputs 'n'
    input_fn = MagicMock(return_value="n")
    config: CliConfig = {"skip_updates_for_version": ""}
    result = check_package_version(
        cli_config=config,
        current_version="1.0.0",
        input_fn=input_fn,
    )
    assert result == "user-skipped"
    # Ensure the config is updated with skip_updates_for_version == "1.2.3"
    assert config["skip_updates_for_version"] == "1.2.3"


@patch("dyad_cli.requests.get", side_effect=Exception("Network error"))
def test_check_package_version_request_failure(mock_requests, mock_env):
    """
    Test scenario where the request to PyPI fails entirely.
    """
    config: CliConfig = {"skip_updates_for_version": ""}
    result = check_package_version(cli_config=config, current_version="1.0.0")
    assert result == "check-request-failed"


@patch("dyad_cli.requests.get")
def test_check_package_version_check_failure(mock_requests, mock_env):
    """
    Test scenario where an unexpected error occurs in the version check block,
    e.g. a key error in the response JSON or something else in the try-except.
    """
    # Let the request pass but cause an error in the second try-except
    mock_requests.return_value.json.return_value = {
        # "info" key intentionally missing to trigger an error
    }
    config: CliConfig = {"skip_updates_for_version": ""}
    result = check_package_version(cli_config=config, current_version="1.0.0")
    assert result == "check-request-failed"


#
# Tests for flatten
#


def test_flatten_empty_list():
    assert flatten([]) == []


def test_flatten_basic():
    nested = [[1, 2], [3, 4], [5]]
    assert flatten(nested) == [1, 2, 3, 4, 5]


def test_flatten_strings():
    nested = [["hello", "world"], ["!"]]
    assert flatten(nested) == ["hello", "world", "!"]


#
# Tests for get_command_args
#


def test_get_command_args_no_extensions(mock_env):
    """
    If EXTENSIONS_REQUIREMENTS_PATH doesn't exist, we skip the `--with-requirements`.
    """
    with patch("pathlib.Path.exists", return_value=False):
        args = get_command_args("uv_bin", ["arg1", "arg2"], is_offline=False)
        assert "--with-requirements" not in args
        assert "arg1" in args
        assert "arg2" in args
        assert "--offline" not in args


def test_get_command_args_with_extensions(mock_env):
    """
    If EXTENSIONS_REQUIREMENTS_PATH exists, add --with-requirements ...
    """
    with patch("pathlib.Path.exists", return_value=True):
        args = get_command_args("uv_bin", ["arg1"], is_offline=False)
        assert "--with-requirements" in args
        assert str(EXTENSIONS_REQUIREMENTS_PATH) in args


def test_get_command_args_offline_mode(mock_env):
    """
    If is_offline=True, ensure we add `--offline`.
    """
    with patch("pathlib.Path.exists", return_value=False):
        args = get_command_args("uv_bin", [], is_offline=True)
        assert "--offline" in args


def test_get_command_args_with_refresh_extensions(mock_env):
    """
    Test that --refresh is added when refresh_extensions=True and requirements exist
    """
    with patch("pathlib.Path.exists", return_value=True):
        args = get_command_args(
            "uv_bin", ["arg1"], is_offline=False, refresh_extensions=True
        )
        assert "--with-requirements" in args
        assert str(EXTENSIONS_REQUIREMENTS_PATH) in args
        assert "--refresh" in args


def test_get_command_args_no_refresh_without_requirements(mock_env):
    """
    Test that --refresh is not added when requirements don't exist, even if refresh_extensions=True
    """
    with patch("pathlib.Path.exists", return_value=False):
        args = get_command_args(
            "uv_bin", ["arg1"], is_offline=False, refresh_extensions=True
        )
        assert "--with-requirements" not in args
        assert "--refresh" not in args


def test_get_command_args_no_refresh_by_default(mock_env):
    """
    Test that --refresh is not added by default even when requirements exist
    """
    with patch("pathlib.Path.exists", return_value=True):
        args = get_command_args("uv_bin", ["arg1"], is_offline=False)
        assert "--with-requirements" in args
        assert str(EXTENSIONS_REQUIREMENTS_PATH) in args
        assert "--refresh" not in args


def test_get_command_args_with_prerelease(mock_env):
    """
    Test that --prerelease allow is added when allow_prerelease=True
    """
    with patch("pathlib.Path.exists", return_value=False):
        args = get_command_args(
            "uv_bin", ["arg1"], is_offline=False, allow_prerelease=True
        )
        assert "--prerelease" in args
        assert "allow" in args
        # Check order of arguments
        prerelease_index = args.index("--prerelease")
        assert args[prerelease_index + 1] == "allow"


def test_get_command_args_without_prerelease(mock_env):
    """
    Test that --prerelease is not added by default
    """
    with patch("pathlib.Path.exists", return_value=False):
        args = get_command_args("uv_bin", ["arg1"], is_offline=False)
        assert "--prerelease" not in args
        assert "allow" not in args


#
# Tests for execute_command
#


def test_execute_command_success(capfd):
    """
    If subprocess.check_call doesn't raise, it's considered success.
    """
    with patch("subprocess.check_call") as mock_call:
        execute_command(["echo", "hello"])
        mock_call.assert_called_once()


def test_execute_command_failure():
    """
    If subprocess.check_call raises, we sys.exit(1).
    """
    with (
        patch(
            "subprocess.check_call",
            side_effect=subprocess.CalledProcessError(1, "cmd"),
        ),
        pytest.raises(SystemExit) as exc_info,
    ):
        execute_command(["some", "command"])

    assert exc_info.type is SystemExit
    assert exc_info.value.code == 1

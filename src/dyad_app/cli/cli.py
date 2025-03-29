# ruff: noqa: I001 E402

import os
import socket
import threading
import time
import shutil
import itertools
import sys

init_start_time = time.time()
RESET = "\033[0m"
BOLD = "\033[1m"


class Spinner:
    def __init__(self, message="Loading"):
        self.spinner = itertools.cycle(
            ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
        )
        self.message = message
        self.running = False
        self.spinner_thread = None

    def spin(self):
        while self.running:
            sys.stdout.write(
                f"\r{BOLD}{next(self.spinner)}{RESET} {self.message}"
            )
            sys.stdout.flush()
            time.sleep(0.1)
        clear_length = len(self.message) + 4
        sys.stdout.write("\r" + " " * clear_length + "\r")
        sys.stdout.flush()

    def start(self):
        self.running = True
        self.spinner_thread = threading.Thread(target=self.spin)
        self.spinner_thread.daemon = True
        self.spinner_thread.start()

    def stop(self):
        self.running = False
        if self.spinner_thread:
            self.spinner_thread.join()


spinner = Spinner("Loading Dyad (note: this is faster after the first time)...")
spinner.start()

# Must set env var before loading Mesop
os.environ["MESOP_WEBSOCKETS_ENABLED"] = "true"
os.environ["MESOP_APP_BASE_PATH"] = app_base_path = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)
os.environ["MESOP_STATIC_FOLDER"] = "static"
os.environ["MESOP_PROD_UNREDACTED_ERRORS"] = "true"

import logging
import webbrowser

import click

import mesop as me
from werkzeug.serving import run_simple

# KEEP THIS IN SYNC WITH
# packages/dyad_core/src/dyad/constants/__init__.py
# (note: we do not import because it causes issues where
# sqlite is imported *before* the workspace is reset)
WORKSPACE_DATA_FOLDER_NAME = ".dyad"


def post_init():
    from dyad.logging.logging import logger

    duration = time.time() - init_start_time
    logger().info(f"Dyad (browser) started in {duration:.2f} seconds")
    from dyad.logging.analytics import analytics

    analytics().record_startup()

    from dyad.extension.extension_registry import extension_registry

    extension_registry.load_extensions()

    import dyad.indexing.file_indexing as file_indexing

    time.sleep(2)
    file_indexing.activate()


def is_port_in_use(port, hostname):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            # Set socket options to allow port reuse and quick recycling
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((hostname, port))
            return False
        except OSError:
            return True


def open_browser_when_ready(url: str, hostname: str, port: int):
    """Wait for the server to start and then open the browser."""
    while True:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.connect((hostname, port))
                webbrowser.open(url)
                post_init()
                break
        except (OSError, ConnectionRefusedError):
            time.sleep(0.1)


@click.command()
@click.argument(
    "workspace_path",
    type=click.Path(exists=True, file_okay=False, dir_okay=True),
    default=os.getcwd(),
)
@click.option("--port", type=int, help="Port to run the server on")
@click.option(
    "--log-level",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
    default="WARNING",
    help="Set the logging level",
)
@click.option(
    "--hostname", default="localhost", help="Hostname to bind the server to"
)
@click.option(
    "--no-browser",
    is_flag=True,
    help="Prevent the browser from opening automatically",
)
@click.option(
    "--user-data-dir",
    type=click.Path(file_okay=False, dir_okay=True),
    help="Directory to store user data and settings",
)
@click.option(
    "--reset-workspace",
    is_flag=True,
    help="Remove the .dyad directory from the workspace before starting",
)
@click.option(
    "--reset-user-data",
    is_flag=True,
    help="Remove the user data directory before starting",
)
def main(
    workspace_path: str,
    port: int | None,
    log_level: str,
    hostname: str,
    no_browser: bool,
    user_data_dir: str | None,
    reset_workspace: bool,
    reset_user_data: bool,
):
    """
    A CLI script that takes a workspace path as an argument and optional port and hostname.
    """
    os.environ["DYAD_LOG_LEVELS"] = log_level
    if user_data_dir is not None:
        os.environ["DYAD_USER_DATA_DIR"] = user_data_dir
    os.environ["DYAD_WORKSPACE_DIR"] = workspace_path

    # Handle reset user data before any imports
    if reset_user_data and user_data_dir is not None:
        if os.path.exists(user_data_dir):
            try:
                shutil.rmtree(user_data_dir)
                click.echo(
                    click.style(
                        f"Successfully removed user data directory: {user_data_dir}",
                        fg="green",
                    )
                )
            except Exception as e:
                click.echo(
                    click.style(
                        f"Error removing user data directory: {e!s}",
                        fg="red",
                        bold=True,
                    )
                )
                return

    # Reset workspace before doing any import to avoid error where
    # sqlite is opened before the workspace is reset
    if reset_workspace:
        workspace_data_dir = os.path.join(
            workspace_path, WORKSPACE_DATA_FOLDER_NAME
        )
        if os.path.exists(workspace_data_dir):
            try:
                shutil.rmtree(workspace_data_dir)
                click.echo(
                    click.style(
                        f"Successfully removed {WORKSPACE_DATA_FOLDER_NAME} directory",
                        fg="green",
                    )
                )
            except Exception as e:
                click.echo(
                    click.style(
                        f"Error removing {WORKSPACE_DATA_FOLDER_NAME} directory: {e!s}",
                        fg="red",
                        bold=True,
                    )
                )
                return

    from dyad_app import main as dyad_main  # noqa: F401
    import dyad

    # Stop the spinner after the imports which are slow are done
    spinner.stop()

    dyad_ascii = [
        "██████╗ ██╗   ██╗ █████╗ ██████╗ ",
        "██╔══██╗╚██╗ ██╔╝██╔══██╗██╔══██╗",
        "██║  ██║ ╚████╔╝ ███████║██║  ██║",
        "██║  ██║  ╚██╔╝  ██╔══██║██║  ██║",
        "██████╔╝   ██║   ██║  ██║██████╔╝",
        "╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═════╝ ",
    ]

    colors = ["bright_red", "bright_yellow", "bright_green", "bright_cyan"]

    for _, line in enumerate(dyad_ascii):
        colored_line = ""
        for j, char in enumerate(line):
            if char != " ":
                color = colors[j // 10 % len(colors)]
                colored_line += click.style(char, fg=color, bold=True)
            else:
                colored_line += char
        click.echo(colored_line)

    click.echo(
        click.style(
            f"Welcome to Dyad (v{dyad.__version__})!",
            fg="bright_magenta",
            bold=True,
        )
    )
    click.echo(click.style("=================", fg="yellow"))
    click.echo(f"Workspace path: {click.style(workspace_path, fg='blue')}")
    if user_data_dir is not None:
        click.echo(f"User data dir: {click.style(user_data_dir, fg='blue')}")
    # Handle port selection
    if port is None:
        # Try ports in range 8605-8608 if no specific port provided
        port = 8605
        while is_port_in_use(port, hostname):
            port += 1
            if port > 8608:
                click.echo(
                    click.style(
                        "Unable to find an available port in range 8605-8608",
                        fg="red",
                        bold=True,
                    )
                )
                return
    else:
        # If specific port requested, only try that port
        if is_port_in_use(port, hostname):
            click.echo(
                click.style(
                    f"Port {port} is already in use",
                    fg="red",
                    bold=True,
                )
            )
            return

    url = f"http://{hostname}:{port}"
    click.echo(
        f"Starting server on: {click.style(url, fg='green', underline=True)}"
    )
    if not no_browser:
        click.echo("Opening browser when server is ready...")
    click.echo(click.style("=================", fg="yellow"))

    app = me.create_wsgi_app()

    logging.getLogger("werkzeug").setLevel(logging.WARN)
    logging.getLogger("mesop").setLevel(logging.WARN)
    try:
        if no_browser:
            # Do post init directly if we're not opening a browser
            post_init_thread = threading.Thread(
                target=post_init,
                daemon=True,
            )
            post_init_thread.start()
        else:
            # Start a thread to open the browser after the server is ready
            browser_thread = threading.Thread(
                target=open_browser_when_ready,
                args=(url, hostname, port),
                daemon=True,
            )
            browser_thread.start()

        run_simple(
            hostname,
            port,
            app,
            threaded=True,
        )
        click.echo(
            click.style("Server started successfully", fg="green", bold=True)
        )
    except Exception as e:
        click.echo(
            click.style(
                f"An error occurred while starting the server: {e!s}",
                fg="red",
                bold=True,
            )
        )


if __name__ == "__main__":
    main()

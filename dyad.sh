#!/bin/bash

# Check if at least one argument is provided
if [ $# -eq 0 ]; then
    echo "Error: Please provide at least one argument."
    echo "Usage: $0 <path_to_workspace> [additional_arguments...]"
    exit 1
fi

workspace_path="$1"
shift  # Remove the first argument from the list

# Function to kill any process running on port 8605
kill_port_8605() {
    echo "Killing any process on port 8605..."
    pids=$(lsof -ti :8605)
    if [ -n "$pids" ]; then
        echo "Found process IDs on :8605: $pids"
        echo "$pids" | xargs kill -9
    else
        echo "No processes found on port 8605"
    fi
}

# Function to run the uv command
run_uv() {
    echo "Running uv command..."
    uv run src/dyad_app/cli/cli.py "$workspace_path" "$@" "--log-level=INFO" "--no-browser" "--port=8605"
}

# Variable to store the PID of the background process
uv_pid=""

# Function to stop the running uv process
stop_uv() {
    if [ -n "$uv_pid" ]; then
        echo "Stopping existing uv process..."
        kill "$uv_pid" 2>/dev/null
        wait "$uv_pid" 2>/dev/null
        uv_pid=""
    fi
}

# Function to cleanup and exit
cleanup() {
    echo -e "\nReceived interrupt signal. Cleaning up..."
    stop_uv
    kill_port_8605
    exit 0
}

# Set up trap for SIGINT (Ctrl+C) and SIGTERM
trap cleanup SIGINT SIGTERM

# Kill any process on port 8605 before starting
kill_port_8605

# Run the command initially in the background
run_uv &
uv_pid=$!

# Function to get the last modification time of files in the directory
get_last_mod_time() {
    find . -type f -not -path "./.*" -not -path "*/__pycache__/*" -exec stat -f "%m" {} + | sort -n | tail -n 1
}

# Function to get the last modified file in the directory
get_last_modified_file() {
    find . -type f -not -path "./.*" -not -path "*/__pycache__/*" -exec stat -f "%m %N" {} + | sort -n | tail -n 1 | awk '{print $2}'
}

# Get the initial modification time
last_mod_time=$(get_last_mod_time)

# Monitor the current working directory for changes and re-run the command
while true; do
    sleep 0.5  # Polling interval
    current_mod_time=$(get_last_mod_time)
    if [ "$current_mod_time" != "$last_mod_time" ]; then
        changed_file=$(get_last_modified_file)
        echo "Detected file change in: $changed_file. Re-running uv command..."
        stop_uv
        kill_port_8605
        run_uv &
        uv_pid=$!
        last_mod_time=$current_mod_time
    fi
done

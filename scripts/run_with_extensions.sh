#!/bin/bash

# Default refresh flag to empty
REFRESH_FLAG=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --refresh)
            REFRESH_FLAG="--refresh"
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Run the command with optional refresh flag
uv run $REFRESH_FLAG --no-project --with-editable ./ --with-requirements "$HOME/Library/Application Support/dyad/extensions/requirements.txt" -- dyad_app . --log-level=INFO
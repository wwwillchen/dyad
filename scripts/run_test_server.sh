#!/bin/bash

# Default values
PORT=8690
SERVER_INDEX=0

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --port=*)
        PORT="${1#*=}"
        shift
        ;;
        --server-index=*)
        SERVER_INDEX="${1#*=}"
        shift
        ;;
        *)
        shift
        ;;
    esac
done

mkdir -p e2e/tempworkspaces/
rm -rf e2e/tempworkspaces/$SERVER_INDEX/
cp -r e2e/workspaces/ e2e/tempworkspaces/$SERVER_INDEX/
# Run without any outside environment variables
uv_path=$(which uv)
git_path=$(which git)
env -i bash -c "DYAD_TESTING=true GOOGLE_GENAI_OPENAI_API_BASE_URL=http://127.0.0.1:3000/v1 ANTHROPIC_API_BASE_URL=http://127.0.0.1:3000/anthropic GIT_PYTHON_GIT_EXECUTABLE=$git_path MESOP_PROD_UNREDACTED_ERRORS=true LLM_PROXY_BASE_URL=http://127.0.0.1:3000/v1 $uv_path run src/dyad_app/cli/cli.py e2e/tempworkspaces/$SERVER_INDEX/simple_workspace --reset-workspace --user-data-dir=$(mktemp -d) --port=$PORT --no-browser"
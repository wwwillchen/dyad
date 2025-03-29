# Avoid over-logging.
DYAD_LOG_LEVELS=WARNING DYAD_APP_MODE=viewer DYAD_WORKSPACE_DIR=. MESOP_STATIC_FOLDER=./src/dyad_app/static uv run gunicorn viewer:mesop
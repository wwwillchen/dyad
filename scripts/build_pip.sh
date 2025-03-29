rm -rf dist && \
yarn && \
yarn build && \
uv build --package dyad_app --wheel && \
uv build --package dyad --wheel && \
uv build --package dyad_core --wheel && \
uv build --package dyad_git --wheel && \
uv build --package dyad_github --wheel
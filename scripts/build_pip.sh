rm -rf dist && \
yarn && \
yarn build && \
uv build --all --wheel
docker run --rm -it \
  -p 8605:8605 \
  -e GEMINI_API_KEY="${GEMINI_API_KEY}" \
  python:3.10-slim bash -c "\
    apt-get update && \
    apt-get install -y git && \
    git clone https://github.com/mesop-dev/mesop.git -b main --depth 1 && \
    pip install dyad && \
    cd mesop && \
    dyad"

import os


def get_api_base_url():
    return os.getenv("DYAD_API_BASE_URL", "https://api.dyad.sh")

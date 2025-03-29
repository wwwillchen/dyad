import logging
import os
import re
from functools import lru_cache

import requests

logging.basicConfig(level=logging.INFO)


def validate_gist_id(gist_id: str) -> bool:
    """
    Validate that the gist_id contains only alphanumeric characters and hyphens.

    GitHub gist IDs typically consist of alphanumeric characters and possibly hyphens.
    This validation prevents potential injection attacks or malformed requests.
    """
    # Pattern allows alphanumeric characters and hyphens only
    pattern = r"^[a-zA-Z0-9\-]+$"
    return bool(re.match(pattern, gist_id)) and len(gist_id) > 0


@lru_cache(maxsize=16)
def fetch_gist(gist_id: str) -> str:
    if not validate_gist_id(gist_id):
        raise ValueError(f"Invalid gist ID format: {gist_id}")

    url = f"https://api.github.com/gists/{gist_id}"

    # Set up headers with authorization token if available
    headers = {"Accept": "application/vnd.github.v3+json"}
    github_token = os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN")
    if github_token:
        headers["Authorization"] = f"token {github_token}"
    else:
        logging.warning(
            "Fetching Gist without GitHub personal access token (this will hit rate limits sooner)"
        )

    try:
        response = requests.get(
            url,
            headers=headers,
            timeout=5,
        )

        if response.status_code == 200:
            files = response.json()["files"]
            gist_data = files[next(iter(files.keys()))]["content"]
            return gist_data
        else:
            raise ValueError(f"Failed to fetch gist: {response.status_code}")
    except requests.exceptions.RequestException as e:
        raise ValueError(f"Request error: {e!s}") from e

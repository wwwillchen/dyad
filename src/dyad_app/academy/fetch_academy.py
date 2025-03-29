import requests
from dyad.logging.logging import logger

from dyad_app.academy.academy_util import ACADEMY_BASE_URL
from dyad_app.ui.state import AcademyCollection, AcademyData


def fetch_academy_collections() -> AcademyData:
    """Fetches academy collections from the API endpoint.

    Returns:
        AcademyData containing a list of AcademyCollection objects
    """
    log = logger()

    try:
        log.info("Fetching academy collections from API")
        response = requests.get(
            f"{ACADEMY_BASE_URL}/api/collections", timeout=5
        )
        response.raise_for_status()

        collections_data = response.json()
        log.debug(f"Received {len(collections_data)} collections from API")

        collections = [
            AcademyCollection(
                id=collection["id"],
                title=collection["title"],
                description=collection["description"],
            )
            for collection in collections_data
        ]

        log.info(
            f"Successfully processed {len(collections)} academy collections"
        )
        return AcademyData(collections=collections)

    except requests.RequestException as e:
        log.error(f"Failed to fetch academy collections: {e!s}")
        return AcademyData(collections=[])

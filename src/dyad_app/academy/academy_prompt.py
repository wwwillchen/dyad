from dyad_app.ui.state import AcademyCollection


def create_academy_prompt(collections: list[AcademyCollection]) -> str:
    collections_str = "\n".join(
        [
            f"""<collection 
            id="{collection.id}"
            title="{collection.title}"
            description="{collection.description}"
            ></collection>"""
            for collection in collections
        ]
    )
    return f"""

These are a list of learning resource collections. 

At the very end of the response, I want you to return the most relevant collection to the user by listing:
<dyad-collection-id>id</dyad-collection-id>

Here are the collections:
{collections_str}
"""

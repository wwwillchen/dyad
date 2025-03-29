import mesop.labs as mel
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def sandpack(
    *,
    files: dict[str, dict[str, str]],
    environment: str = "vanilla",
    entry: str | None = None,
    dependencies: dict[str, str] | None = None,
    key: str | None = None,
):
    return mel.insert_web_component(
        name="dyad-sandpack",
        key=key,
        properties={
            "files": files,
            "environment": environment,
            "entry": entry,
            "dependencies": dependencies,
        },
    )

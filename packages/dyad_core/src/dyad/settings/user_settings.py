import os
from typing import Literal

from filelock import FileLock
from pydantic import BaseModel, Field

from dyad.language_model.language_model import (
    LanguageModel,
    LanguageModelProvider,
    LanguageModelType,
)
from dyad.utils.user_data_dir_utils import get_user_data_dir
from dyad.workspace_util import (
    get_workspace_root_path,
)


class EmbeddingModelConfig(BaseModel):
    embedding_model_name: str
    provider_id: str
    embedding_dim: int
    version: Literal["1"] = "1"


class AnalyticsSettings(BaseModel):
    consent_shown: bool = False
    enabled: bool = False
    uuid: str | None = None


class UserSettings(BaseModel):
    language_model_type_to_id: dict[LanguageModelType, str] = {
        "core": "dyad/auto-core",
        "editor": "dyad/auto-editor",
        "reasoner": "dyad/auto-reasoner",
        "router": "dyad/auto-router",
    }
    embedding_model_config: EmbeddingModelConfig | None = None
    sidebar_expanded: bool = True
    theme_mode: str = "system"
    workspace_path_to_name: dict[str, str] = {}
    provider_id_to_api_key: dict[str, str] = {}
    pad_mode: Literal["learning", "all"] = "learning"
    show_dyad_annotations: bool = False
    disable_llm_proxy: bool = False
    disable_anthropic_cache: bool = False
    analytics: AnalyticsSettings = Field(default_factory=AnalyticsSettings)
    custom_language_model_providers: list[LanguageModelProvider] = []
    custom_language_models: list[LanguageModel] = []
    recently_used_models: dict[str, list[str]] = {}

    def get_embedding_model_config_or_throw(self) -> EmbeddingModelConfig:
        if self.embedding_model_config is None:
            raise ValueError("Embedding model config is not set")
        return self.embedding_model_config

    def update_recently_used_model(
        self, language_model_type: str, model_id: str
    ) -> None:
        recent = self.recently_used_models.get(language_model_type, [])
        if model_id in recent:
            recent.remove(model_id)
        recent.insert(0, model_id)
        self.recently_used_models[language_model_type] = recent[:3]

    @property
    def core_language_model_id(self) -> str:
        return self.language_model_type_to_id["core"]

    @property
    def editor_language_model_id(self) -> str:
        return self.language_model_type_to_id["editor"]

    def workspace_name(self) -> str:
        if get_workspace_root_path() in self.workspace_path_to_name:
            return self.workspace_path_to_name[get_workspace_root_path()]
        return os.path.basename(os.path.abspath(get_workspace_root_path()))

    def set_workspace_name(self, name: str):
        self.workspace_path_to_name[get_workspace_root_path()] = name

    def delete_custom_language_model_provider(self, id: str) -> "UserSettings":
        self.custom_language_model_providers = [
            provider
            for provider in self.custom_language_model_providers
            if provider.id != id
        ]
        return self

    def delete_custom_language_model(self, id: str) -> "UserSettings":
        self.custom_language_models = [
            model for model in self.custom_language_models if model.id != id
        ]
        return self

    def save(self):
        settings_path = _get_settings_path()
        os.makedirs(os.path.dirname(settings_path), exist_ok=True)
        lock = FileLock(_get_lock_path())
        with lock:
            with open(settings_path, "w") as f:
                f.write(self.model_dump_json())


def _get_settings_path() -> str:
    return os.path.join(get_user_data_dir(), "user_settings.json")


def _get_lock_path() -> str:
    return _get_settings_path() + ".lock"


def get_user_settings() -> UserSettings:
    settings_path = _get_settings_path()
    lock = FileLock(_get_lock_path())
    with lock:
        if os.path.exists(settings_path):
            with open(settings_path) as f:
                return UserSettings.model_validate_json(f.read())
    return UserSettings()


def reset_user_settings():
    """Reset user settings to default values by removing the settings file.

    Returns:
        UserSettings: A new UserSettings instance with default values
    """
    settings_path = _get_settings_path()
    lock = FileLock(_get_lock_path())

    with lock:
        if os.path.exists(settings_path):
            try:
                os.remove(settings_path)
            except OSError as e:
                raise OSError("Failed to remove settings file") from e


def toggle_sidebar_settings():
    settings = get_user_settings()
    settings.sidebar_expanded = not settings.sidebar_expanded
    settings.save()

import importlib.resources
import pkgutil
import sys
import time
from queue import Queue
from threading import Thread

import toml

from dyad.agent_api.agent import Agent, register_agent
from dyad.logging.logging import logger
from dyad.status.status import Status
from dyad.status.status_tracker import status_tracker


class ExtensionRegistry:
    def __init__(self):
        self.extensions = []  # List to store package names of loaded extensions
        self._load_queue = Queue()
        self._load_thread = Thread(target=self._background_loader, daemon=True)
        self._load_thread.start()
        self.loaded_extensions = False

    def _background_loader(self):
        """Background thread worker that processes extension loading."""
        while True:
            try:
                self._load_queue.get()  # Wait for load signal
                start = time.time()
                self._load_extensions_internal()
                status_tracker().enqueue(Status("✓", type="extension"))
                logger().info(
                    f"Finished loading {len(self.extensions)} extensions in "
                    f"{time.time() - start:.2f} seconds"
                )
            except Exception as e:
                logger().error(f"Background extension loading failed: {e}")
            finally:
                self.loaded_extensions = True
                self._load_queue.task_done()

    def _load_extensions_internal(self):
        """Load extensions from packages containing dyad-extension.toml."""
        for module_info in pkgutil.iter_modules():
            if module_info.ispkg:  # Only consider packages, not modules
                package_name = module_info.name
                try:
                    with importlib.resources.path(
                        package_name, "dyad-extension.toml"
                    ) as path:
                        config = toml.load(path)
                        logger().debug(f"Loading extension {package_name}")
                        for agent in config["agents"]:
                            agent_handler = self._load_function(
                                agent["function"]
                            )
                            register_agent(
                                Agent(
                                    name=agent["name"],
                                    description=agent["description"],
                                    handler=agent_handler,
                                )
                            )
                        self.extensions.append(package_name)
                except (ModuleNotFoundError, FileNotFoundError):
                    pass  # Skip packages without the file

    def load_extensions(self):
        status_tracker().enqueue(
            Status("Loading extensions", in_progress=True, type="extension")
        )
        """Trigger extension loading in the background."""
        if not self.extensions:  # Only load if not already loaded
            self._load_queue.put(True)

    def reload_extensions(self):
        """Reload all registered extensions."""
        logger().info(
            f"Starting to reload {len(self.extensions)} extensions: {self.extensions}"
        )
        old_extensions = self.extensions.copy()
        self.extensions = []

        # Clear module cache for extensions
        for module_name in list(sys.modules.keys()):
            for ext_name in old_extensions:
                if ext_name in module_name and module_name in sys.modules:
                    del sys.modules[module_name]

        self._load_queue.put(True)  # Trigger reload
        logger().info("Reload scheduled in background")

    def get_extensions(self):
        """Return the list of loaded extensions."""
        return self.extensions

    def wait_for_extensions_to_load(self):
        """
        Wait for extensions to finish loading with a 30 second timeout.

        Returns:
            bool: True if extensions loaded successfully, False if timeout occurred
        """
        start_time = time.time()
        while not self.loaded_extensions:
            if time.time() - start_time > 30:
                logger().warning("Timed out waiting for extensions to load")
                return False
            time.sleep(0.1)
        logger().info(
            "Waited: %s for extensions to load", time.time() - start_time
        )
        return True

    @staticmethod
    def _load_function(entry_point):
        """Load a function from a module given an entry point string."""
        module_name, function_name = entry_point.split(":")
        module = __import__(module_name, fromlist=[function_name])
        return getattr(module, function_name)


extension_registry = ExtensionRegistry()

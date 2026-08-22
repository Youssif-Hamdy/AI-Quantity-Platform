from abc import ABC, abstractmethod


class BaseVisionProvider(ABC):
    """
    Base class for all Vision AI providers.
    """

    @abstractmethod
    def analyze(self, prompt: str, image_paths: list[str]) -> dict:
        """
        Analyze one or more images.

        Returns:
            dict
        """
        pass
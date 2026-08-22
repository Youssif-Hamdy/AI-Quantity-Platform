import json
from pathlib import Path

from google import genai
from google.genai import types

from config import GEMINI_API_KEY


class GeminiVisionProvider:

    def __init__(self):

        self.client = genai.Client(
            api_key=GEMINI_API_KEY
        )

    def analyze(
        self,
        prompt: str,
        image_paths: list[str | Path],
        model: str = "gemini-3.5-flash",
    ) -> dict:

        contents = [prompt]

        for image_path in image_paths:

            # Detect mime type from extension
            ext = image_path.lower().split(".")[-1]
            mime_map = {
                "png":  "image/png",
                "jpg":  "image/jpeg",
                "jpeg": "image/jpeg",
                "webp": "image/webp",
            }
            mime_type = mime_map.get(ext, "image/png")

            with open(image_path, "rb") as f:
                image_bytes = f.read()

            # Use the correct types.Part for the new SDK
            contents.append(
                types.Part.from_bytes(
                    data=image_bytes,
                    mime_type=mime_type,
                )
            )

        response = self.client.models.generate_content(
            model=model,
            contents=contents,
        )

        # Strip markdown code fences if present
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            text = text.rsplit("```", 1)[0].strip()

        try:
            return json.loads(text)

        except Exception:
            return {
                "raw_response": text
            }

    def analyze_with_schema(
        self,
        prompt: str,
        image_paths: list[str | Path],
        response_schema: dict,
        model: str = "gemini-3.5-flash",
        thinking_budget: int = 0,
    ) -> dict:
        """
        Send a prompt + images to Gemini with Structured Output (JSON Schema).

        Args:
            prompt:          Text prompt.
            image_paths:     List of image file paths.
            response_schema: JSON Schema dict for structured output.
            model:           Gemini model name.
            thinking_budget: Thinking tokens (0 = no thinking, more precise coords).

        Returns:
            Parsed JSON dict matching the schema.
        """
        contents = [prompt]

        for image_path in image_paths:
            ext = image_path.lower().split(".")[-1]
            mime_map = {
                "png":  "image/png",
                "jpg":  "image/jpeg",
                "jpeg": "image/jpeg",
                "webp": "image/webp",
            }
            mime_type = mime_map.get(ext, "image/png")

            with open(image_path, "rb") as f:
                image_bytes = f.read()

            contents.append(
                types.Part.from_bytes(
                    data=image_bytes,
                    mime_type=mime_type,
                )
            )

        # Build generation config with structured output
        gen_config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=response_schema,
        )

        # Add thinking budget config if supported
        if thinking_budget > 0:
            gen_config.thinking_config = types.ThinkingConfig(
                thinking_budget=thinking_budget,
            )

        response = self.client.models.generate_content(
            model=model,
            contents=contents,
            config=gen_config,
        )

        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            text = text.rsplit("```", 1)[0].strip()

        try:
            return json.loads(text)
        except Exception:
            return {"raw_response": text}
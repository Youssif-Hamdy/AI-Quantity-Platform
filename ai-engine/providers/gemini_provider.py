import json

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
        image_paths: list[str]
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
            model="gemini-2.5-flash",
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
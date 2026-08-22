import json
import os
import sys

from dotenv import load_dotenv
from google import genai
from PIL import Image

load_dotenv()

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

file_path = "temp/pages/26.jpg.png"
if len(sys.argv) > 1:
    file_path = sys.argv[1]

image_path = file_path
if file_path.lower().endswith(".pdf"):
    from normalizer import DocumentNormalizer
    print(f"Converting PDF to image first...")
    normalizer = DocumentNormalizer()
    pages = normalizer.normalize(file_path, dpi=200)
    image_path = pages[0]

print(f"Reading image: {image_path}")
image = Image.open(image_path)

prompt = """
You are a professional Quantity Surveyor and Civil Engineer.

Analyze this shop drawing carefully.

Extract all visible information.

Return ONLY valid JSON.

JSON Schema:

{
  "rooms": [
    {
      "name": "",
      "area": 0,
      "perimeter": 0
    }
  ],

  "doors": [
    {
      "label": "",
      "quantity": 1,
      "width": 0,
      "height": 0
    }
  ],

  "windows": [
    {
      "label": "",
      "quantity": 1,
      "width": 0,
      "height": 0
    }
  ],

  "dimensions": [],

  "notes": []
}

If a value is unknown use null.

CRITICAL INSTRUCTIONS:
1. TRANSLATE ALL TEXT TO ENGLISH. If the original text is in Arabic or any other language, you MUST translate it to pure English.
2. Do not explain anything.
3. Do not use markdown.
4. Return JSON only.
"""

response = client.models.generate_content(
    model="gemini-3.6-flash",
    contents=[
        prompt,
        image
    ]
)

print(response.text)
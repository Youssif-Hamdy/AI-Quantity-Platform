from google import genai
from config import GEMINI_API_KEY

client = genai.Client(api_key=GEMINI_API_KEY)
models = client.models.list()
for m in models:
    print(m.name)

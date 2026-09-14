import os
from groq import Groq

# Provide the Gemini API Key here or through env
gemini_key = os.getenv("GEMINI_API_KEY")

if not gemini_key:
    print("GEMINI_API_KEY not found in env")
    exit(1)

# Use Groq client to call Gemini's OpenAI-compatible API
try:
    client = Groq(
        api_key=gemini_key,
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
    )
    
    response = client.chat.completions.create(
        model="gemini-1.5-flash",
        messages=[{"role": "user", "content": "Hello, who are you?"}],
        max_tokens=50
    )
    
    print("SUCCESS!")
    print(response.choices[0].message.content)
except Exception as e:
    print("ERROR:", e)

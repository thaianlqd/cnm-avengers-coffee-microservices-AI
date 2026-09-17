import os
import requests
import json

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("Please set GEMINI_API_KEY environment variable")
    exit(1)

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={GEMINI_API_KEY}"
payload = {
    "system_instruction": {"parts": [{"text": "You are a test assistant."}]},
    "contents": [{"role": "user", "parts": [{"text": "Say hello!"}]}],
    "generationConfig": {"temperature": 0.45, "maxOutputTokens": 650},
}

print("Testing Gemini 3.6-flash...")
try:
    resp = requests.post(url, json=payload, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    
    # Try parsing exactly how main.py does
    candidates = data.get("candidates", [])
    if candidates:
        first = candidates[0]
        finish_reason = first.get("finishReason")
        parts = first.get("content", {}).get("parts", [])
        text = "\n".join([p.get("text", "") for p in parts if "text" in p])
        
        print("\n--- RAW JSON DUMP ---")
        print(json.dumps(data, indent=2))
        
        print("\n--- PARSE SUCCESS ---")
        print(f"Finish Reason: {finish_reason}")
        print(f"Reply: {text}")
        print("Schema is confirmed to be compatible with main.py parsing logic!")
    else:
        print("Failed to find candidates in response:", data)
except Exception as e:
    print(f"Error calling Gemini: {e}")
    if hasattr(e, "response") and e.response is not None:
        print(e.response.text)

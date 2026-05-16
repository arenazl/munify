"""Test directo de Gemini con un prompt cortito para verificar billing/key."""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx
from core.config import settings


async def test():
    print(f"KEY: {'OK' if settings.GEMINI_API_KEY else 'MISSING'}")
    print(f"MODEL: {settings.GEMINI_MODEL}")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
    )
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.post(
            url,
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": "Decime hola en una sola palabra."}]}],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 50},
            },
        )
    print(f"STATUS: {r.status_code}")
    print(f"BODY: {r.text[:1000]}")


if __name__ == "__main__":
    asyncio.run(test())

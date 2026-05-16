"""Diagnostico ad-hoc: prueba la llamada a Gemini con el mismo prompt del
endpoint revision-ia. Imprime status, errores y body. Borrar despues."""
import asyncio
import json
import sys

sys.path.insert(0, '.')

from core.config import settings
from services.revision_ia import _call_gemini, RECLAMOS_PROMPT_TEMPLATE


async def main() -> None:
    print(f"KEY_PRESENT={bool(settings.GEMINI_API_KEY)} LEN={len(settings.GEMINI_API_KEY or '')}")
    print(f"MODEL={settings.GEMINI_MODEL}")

    # Test 1: prompt minimo
    print("\n--- TEST 1: prompt minimo ---")
    r1 = await _call_gemini('Devolve este JSON tal cual: []')
    print("LEN:", len(r1) if r1 else 0)
    print("BODY:", repr(r1)[:500] if r1 else "None")

    # Test 2: prompt completo con data de ejemplo
    print("\n--- TEST 2: prompt real con 2 reclamos demo ---")
    sample = [
        {"id": 1, "titulo": "Bache enorme", "descripcion": "Hay un bache en Av San Martin 100", "estado": "nuevo", "direccion": "San Martin 100", "fecha": "2026-05-15", "categoria": "Bacheo", "dependencia": None},
        {"id": 2, "titulo": "Bache enorme", "descripcion": "Mismo bache en San Martin", "estado": "nuevo", "direccion": "San Martin 100", "fecha": "2026-05-15", "categoria": "Bacheo", "dependencia": None},
    ]
    prompt = RECLAMOS_PROMPT_TEMPLATE.format(reclamos_json=json.dumps(sample, ensure_ascii=False))
    r2 = await _call_gemini(prompt)
    print("LEN:", len(r2) if r2 else 0)
    print("BODY:", repr(r2)[:1500] if r2 else "None")


if __name__ == "__main__":
    asyncio.run(main())

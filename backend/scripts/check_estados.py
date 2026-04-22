"""Check estados counts."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


async def run():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        rows = (await conn.execute(
            text("SELECT estado, COUNT(*) FROM reclamos GROUP BY estado ORDER BY 2 DESC")
        )).all()
        for estado, count in rows:
            print(f"{estado}: {count}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())

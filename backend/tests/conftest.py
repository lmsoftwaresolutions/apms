import pytest
from app.core.database import engine, migrate_engine


@pytest.fixture(autouse=True)
async def cleanup_db():
    yield
    await engine.dispose()
    await migrate_engine.dispose()

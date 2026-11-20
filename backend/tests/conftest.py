import pytest
from app.core.database import engine, migrate_engine


@pytest.fixture(autouse=True)
def cleanup_db():
    yield
    engine.sync_engine.dispose()
    migrate_engine.sync_engine.dispose()

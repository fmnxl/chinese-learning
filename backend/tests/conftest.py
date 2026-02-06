"""Pytest configuration and fixtures."""
import asyncio
from collections.abc import AsyncGenerator

import pytest
from litestar import Litestar
from litestar.testing import AsyncTestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import UUIDAuditBase


@pytest.fixture(scope="session")
def event_loop():
    """Create a session-scoped event loop."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def engine():
    """Create a test database engine."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(UUIDAuditBase.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
        await session.rollback()


@pytest.fixture
async def test_app() -> Litestar:
    """Create a test Litestar app with in-memory database."""
    from advanced_alchemy.extensions.litestar import (
        SQLAlchemyAsyncConfig,
        SQLAlchemyPlugin,
        async_autocommit_before_send_handler,
    )
    from litestar import Litestar
    from litestar.config.cors import CORSConfig
    
    from app.controllers.auth import AuthController, jwt_auth
    from app.controllers.courses import CourseController
    from app.controllers.progress import ProgressController
    from app.controllers.payments import PaymentController
    from app.controllers.lessons import LessonController
    
    sqlalchemy_config = SQLAlchemyAsyncConfig(
        connection_string="sqlite+aiosqlite:///:memory:",
        before_send_handler=async_autocommit_before_send_handler,
    )
    
    cors_config = CORSConfig(
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    async def create_tables(app: Litestar) -> None:
        async with sqlalchemy_config.get_engine().begin() as conn:
            await conn.run_sync(UUIDAuditBase.metadata.create_all)
    
    app = Litestar(
        route_handlers=[
            AuthController,
            CourseController,
            ProgressController,
            PaymentController,
            LessonController,
        ],
        plugins=[SQLAlchemyPlugin(config=sqlalchemy_config)],
        cors_config=cors_config,
        on_app_init=[jwt_auth.on_app_init],
        on_startup=[create_tables],
        debug=True,
    )
    
    return app


@pytest.fixture
async def client(test_app: Litestar) -> AsyncGenerator[AsyncTestClient, None]:
    """Create an async test client."""
    async with AsyncTestClient(app=test_app) as client:
        yield client

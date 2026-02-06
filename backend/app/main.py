from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from advanced_alchemy.extensions.litestar import (
    SQLAlchemyAsyncConfig,
    SQLAlchemyPlugin,
    async_autocommit_before_send_handler,
)
from litestar import Litestar
from litestar.config.cors import CORSConfig

from app.config import get_settings
from app.models.base import UUIDAuditBase
from app.controllers.auth import AuthController
from app.controllers.courses import CourseController
from app.controllers.progress import ProgressController
from app.controllers.payments import PaymentController

settings = get_settings()

# SQLAlchemy configuration
sqlalchemy_config = SQLAlchemyAsyncConfig(
    connection_string=settings.database_url,
    before_send_handler=async_autocommit_before_send_handler,
)


@asynccontextmanager
async def db_lifespan(app: Litestar) -> AsyncGenerator[None, None]:
    """Create database tables on startup."""
    async with sqlalchemy_config.get_engine().begin() as conn:
        await conn.run_sync(UUIDAuditBase.metadata.create_all)
    yield


# CORS configuration for frontend
cors_config = CORSConfig(
    allow_origins=["http://localhost:5173", "https://chinese.fmnxl.xyz"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=True,
)


def create_app() -> Litestar:
    """Create and configure the Litestar application."""
    return Litestar(
        route_handlers=[
            AuthController,
            CourseController,
            ProgressController,
            PaymentController,
        ],
        plugins=[SQLAlchemyPlugin(config=sqlalchemy_config)],
        lifespan=[db_lifespan],
        cors_config=cors_config,
        debug=settings.debug,
    )


app = create_app()

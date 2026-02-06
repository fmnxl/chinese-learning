"""Authentication controller with JWT."""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any
from uuid import UUID

from litestar import Controller, post, get
from litestar.connection import ASGIConnection
from litestar.exceptions import HTTPException
from litestar.security.jwt import JWTAuth, Token
import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

if TYPE_CHECKING:
    from litestar import Request

from app.config import get_settings
from app.models import User

settings = get_settings()


@dataclass
class UserRegisterDTO:
    email: str
    password: str


@dataclass
class UserLoginDTO:
    email: str
    password: str


@dataclass
class UserResponseDTO:
    id: UUID
    email: str
    is_premium: bool
    created_at: datetime


@dataclass
class AuthResponseDTO:
    access_token: str
    email: str
    is_premium: bool
    token_type: str = "bearer"


@dataclass
class TokenResponseDTO:
    access_token: str
    token_type: str = "bearer"


async def retrieve_user_handler(token: Token, connection: ASGIConnection) -> User | None:
    """Retrieve user from JWT token."""
    from advanced_alchemy.extensions.litestar import SQLAlchemyPlugin
    
    # Get SQLAlchemy engine from the plugin and create a proper ORM session
    for plugin in connection.app.plugins:
        if isinstance(plugin, SQLAlchemyPlugin):
            configs = plugin._config if isinstance(plugin._config, list) else [plugin._config]
            for config in configs:
                engine = config.get_engine()
                async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
                async with async_session() as session:
                    result = await session.execute(
                        select(User).where(User.id == UUID(token.sub))
                    )
                    return result.scalar_one_or_none()
    
    return None


jwt_auth = JWTAuth[User](
    retrieve_user_handler=retrieve_user_handler,
    token_secret=settings.jwt_secret,
    default_token_expiration=timedelta(hours=settings.jwt_expiration_hours),
    exclude=["/auth/register", "/auth/login", "/courses", "/health"],
)


class AuthController(Controller):
    """Authentication endpoints."""
    
    path = "/auth"
    
    @post("/register", status_code=201)
    async def register(
        self, 
        data: UserRegisterDTO, 
        db_session: AsyncSession
    ) -> AuthResponseDTO:
        """Register a new user account and return JWT token."""
        # Check if email already exists
        result = await db_session.execute(
            select(User).where(User.email == data.email)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already registered")
        
        # Create user with hashed password
        user = User(
            email=data.email,
            hashed_password=bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
        )
        db_session.add(user)
        await db_session.flush()
        
        # Create JWT token
        token = jwt_auth.create_token(identifier=str(user.id))
        
        return AuthResponseDTO(
            access_token=token,
            email=user.email,
            is_premium=user.is_premium,
        )
    
    @post("/login", status_code=200)
    async def login(
        self, 
        data: UserLoginDTO, 
        db_session: AsyncSession
    ) -> TokenResponseDTO:
        """Login and receive JWT token."""
        result = await db_session.execute(
            select(User).where(User.email == data.email)
        )
        user = result.scalar_one_or_none()
        
        if not user or not bcrypt.checkpw(data.password.encode('utf-8'), user.hashed_password.encode('utf-8')):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        if not user.is_active:
            raise HTTPException(status_code=401, detail="Account is disabled")
        
        # Create JWT token
        token = jwt_auth.create_token(identifier=str(user.id))
        
        return TokenResponseDTO(access_token=token)
    
    @get("/me")
    async def get_current_user(
        self,
        db_session: AsyncSession,
        request: "Request[User, Token, Any]",
    ) -> UserResponseDTO:
        """Get current authenticated user."""
        user = request.user
        return UserResponseDTO(
            id=user.id,
            email=user.email,
            is_premium=user.is_premium,
            created_at=user.created_at,
        )

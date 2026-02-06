"""Authentication controller with JWT."""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any
from uuid import UUID

from litestar import Controller, post, get
from litestar.connection import ASGIConnection
from litestar.exceptions import HTTPException
from litestar.security.jwt import JWTAuth, Token
from passlib.hash import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
class TokenResponseDTO:
    access_token: str
    token_type: str = "bearer"


async def retrieve_user_handler(token: Token, connection: ASGIConnection) -> User | None:
    """Retrieve user from JWT token."""
    session: AsyncSession = connection.app.state.get("db_session")
    if session is None:
        # Get session from dependency
        async with connection.app.state.engine.begin() as conn:
            result = await conn.execute(
                select(User).where(User.id == UUID(token.sub))
            )
            return result.scalar_one_or_none()
    
    result = await session.execute(
        select(User).where(User.id == UUID(token.sub))
    )
    return result.scalar_one_or_none()


jwt_auth = JWTAuth[User](
    retrieve_user_handler=retrieve_user_handler,
    token_secret=settings.jwt_secret,
    default_token_expiration=timedelta(hours=settings.jwt_expiration_hours),
    exclude=["/auth/register", "/auth/login", "/courses", "/health"],
)


class AuthController(Controller):
    """Authentication endpoints."""
    
    path = "/auth"
    
    @post("/register")
    async def register(
        self, 
        data: UserRegisterDTO, 
        db_session: AsyncSession
    ) -> UserResponseDTO:
        """Register a new user account."""
        # Check if email already exists
        result = await db_session.execute(
            select(User).where(User.email == data.email)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Create user with hashed password
        user = User(
            email=data.email,
            hashed_password=bcrypt.hash(data.password),
        )
        db_session.add(user)
        await db_session.flush()
        
        return UserResponseDTO(
            id=user.id,
            email=user.email,
            is_premium=user.is_premium,
            created_at=user.created_at,
        )
    
    @post("/login")
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
        
        if not user or not bcrypt.verify(data.password, user.hashed_password):
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

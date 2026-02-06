"""Tests for authentication controller."""
import pytest
from litestar.testing import AsyncTestClient


class TestAuthRegister:
    """Tests for user registration."""
    
    @pytest.mark.asyncio
    async def test_register_success(self, client: AsyncTestClient):
        """Test successful user registration."""
        response = await client.post(
            "/auth/register",
            json={
                "email": "test@example.com",
                "password": "securepassword123",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert data["email"] == "test@example.com"
    
    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client: AsyncTestClient):
        """Test registration fails with duplicate email."""
        # First registration
        await client.post(
            "/auth/register",
            json={
                "email": "duplicate@example.com",
                "password": "password123",
            },
        )
        
        # Duplicate registration
        response = await client.post(
            "/auth/register",
            json={
                "email": "duplicate@example.com",
                "password": "differentpassword",
            },
        )
        assert response.status_code == 409
    
    @pytest.mark.asyncio
    async def test_register_invalid_email(self, client: AsyncTestClient):
        """Test registration fails with invalid email format."""
        response = await client.post(
            "/auth/register",
            json={
                "email": "not-an-email",
                "password": "password123",
            },
        )
        # Should fail validation
        assert response.status_code in [400, 422]


class TestAuthLogin:
    """Tests for user login."""
    
    @pytest.mark.asyncio
    async def test_login_success(self, client: AsyncTestClient):
        """Test successful login."""
        # Register first
        await client.post(
            "/auth/register",
            json={
                "email": "login@example.com",
                "password": "mypassword123",
            },
        )
        
        # Login
        response = await client.post(
            "/auth/login",
            json={
                "email": "login@example.com",
                "password": "mypassword123",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
    
    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client: AsyncTestClient):
        """Test login fails with wrong password."""
        # Register first
        await client.post(
            "/auth/register",
            json={
                "email": "wrongpass@example.com",
                "password": "correctpassword",
            },
        )
        
        # Login with wrong password
        response = await client.post(
            "/auth/login",
            json={
                "email": "wrongpass@example.com",
                "password": "wrongpassword",
            },
        )
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client: AsyncTestClient):
        """Test login fails for non-existent user."""
        response = await client.post(
            "/auth/login",
            json={
                "email": "nouser@example.com",
                "password": "anypassword",
            },
        )
        assert response.status_code == 401


class TestAuthMe:
    """Tests for /auth/me endpoint."""
    
    @pytest.mark.asyncio
    async def test_me_authenticated(self, client: AsyncTestClient):
        """Test getting current user when authenticated."""
        # Register and get token
        response = await client.post(
            "/auth/register",
            json={
                "email": "me@example.com",
                "password": "password123",
            },
        )
        token = response.json()["access_token"]
        
        # Get current user
        response = await client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "me@example.com"
    
    @pytest.mark.asyncio
    async def test_me_unauthenticated(self, client: AsyncTestClient):
        """Test getting current user fails without token."""
        response = await client.get("/auth/me")
        assert response.status_code == 401

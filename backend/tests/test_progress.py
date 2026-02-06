"""Tests for progress controller."""
import pytest
from litestar.testing import AsyncTestClient


class TestProgressEndpoints:
    """Tests for progress tracking endpoints."""
    
    @pytest.mark.asyncio
    async def test_get_progress_empty(self, client: AsyncTestClient):
        """Test getting progress for new user returns empty list."""
        # Register and get token
        response = await client.post(
            "/auth/register",
            json={
                "email": "progress@example.com",
                "password": "password123",
            },
        )
        token = response.json()["access_token"]
        
        # Get progress
        response = await client.get(
            "/progress",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
    
    @pytest.mark.asyncio
    async def test_progress_requires_auth(self, client: AsyncTestClient):
        """Progress endpoints require authentication."""
        response = await client.get("/progress")
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_get_course_progress_not_found(self, client: AsyncTestClient):
        """Test getting progress for non-existent course."""
        # Register and get token
        response = await client.post(
            "/auth/register",
            json={
                "email": "noprogress@example.com",
                "password": "password123",
            },
        )
        token = response.json()["access_token"]
        
        # Get progress for non-existent course
        response = await client.get(
            "/progress/00000000-0000-0000-0000-000000000000",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 404

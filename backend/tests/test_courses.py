"""Tests for course controller."""
import pytest
from litestar.testing import AsyncTestClient


class TestCourseList:
    """Tests for course listing."""
    
    @pytest.mark.asyncio
    async def test_list_courses_empty(self, client: AsyncTestClient):
        """Test listing courses when none exist."""
        response = await client.get("/courses")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    @pytest.mark.asyncio
    async def test_list_courses_no_auth_required(self, client: AsyncTestClient):
        """Course listing should work without authentication."""
        response = await client.get("/courses")
        # Should not require auth for browsing
        assert response.status_code == 200


class TestCourseDetail:
    """Tests for course detail."""
    
    @pytest.mark.asyncio
    async def test_course_not_found(self, client: AsyncTestClient):
        """Test getting non-existent course returns 404."""
        response = await client.get("/courses/00000000-0000-0000-0000-000000000000")
        assert response.status_code == 404

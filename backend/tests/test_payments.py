"""Tests for payment controller with alpha bypass."""
import pytest
from litestar.testing import AsyncTestClient


class TestPaymentStatus:
    """Tests for payment status endpoint."""
    
    @pytest.mark.asyncio
    async def test_status_alpha_mode(self, client: AsyncTestClient):
        """In alpha mode, all users should have premium status."""
        # Register and get token
        response = await client.post(
            "/auth/register",
            json={
                "email": "alpha@example.com",
                "password": "password123",
            },
        )
        token = response.json()["access_token"]
        
        # Check premium status
        response = await client.get(
            "/payments/status",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_alpha"] is True
        assert data["is_premium"] is True
    
    @pytest.mark.asyncio
    async def test_status_requires_auth(self, client: AsyncTestClient):
        """Payment status requires authentication."""
        response = await client.get("/payments/status")
        assert response.status_code == 401


class TestPaymentCheckout:
    """Tests for checkout endpoint."""
    
    @pytest.mark.asyncio
    async def test_checkout_alpha_grants_premium(self, client: AsyncTestClient):
        """In alpha mode, checkout grants free premium."""
        # Register and get token
        response = await client.post(
            "/auth/register",
            json={
                "email": "checkout@example.com",
                "password": "password123",
            },
        )
        token = response.json()["access_token"]
        
        # Request checkout
        response = await client.post(
            "/payments/checkout",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code in [200, 201]
        data = response.json()
        assert data["is_alpha"] is True
        assert data["checkout_url"] is None  # No Stripe redirect needed
        assert "alpha" in data["message"].lower()
    
    @pytest.mark.asyncio
    async def test_checkout_requires_auth(self, client: AsyncTestClient):
        """Checkout requires authentication."""
        response = await client.post("/payments/checkout")
        assert response.status_code == 401

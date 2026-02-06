"""Stripe payment controller with alpha bypass."""
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import UUID

import stripe
from litestar import Controller, post, get
from litestar.exceptions import HTTPException
from litestar.security.jwt import Token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import User

if TYPE_CHECKING:
    from litestar import Request

settings = get_settings()

# Initialize Stripe
if settings.stripe_secret_key:
    stripe.api_key = settings.stripe_secret_key


@dataclass
class CheckoutResponseDTO:
    checkout_url: str | None
    is_alpha: bool
    message: str


@dataclass
class PremiumStatusDTO:
    is_premium: bool
    is_alpha: bool


class PaymentController(Controller):
    """Payment and subscription management."""
    
    path = "/payments"
    
    @get("/status")
    async def get_premium_status(
        self,
        request: "Request[User, Token, Any]",
    ) -> PremiumStatusDTO:
        """Check user's premium status."""
        user = request.user
        
        # During alpha, everyone is premium
        if settings.is_alpha:
            return PremiumStatusDTO(is_premium=True, is_alpha=True)
        
        return PremiumStatusDTO(is_premium=user.is_premium, is_alpha=False)
    
    @post("/checkout")
    async def create_checkout(
        self,
        db_session: AsyncSession,
        request: "Request[User, Token, Any]",
    ) -> CheckoutResponseDTO:
        """Create Stripe checkout session for premium upgrade."""
        user = request.user
        
        # During alpha, just grant premium access directly
        if settings.is_alpha:
            if not user.is_premium:
                user.is_premium = True
                await db_session.flush()
            return CheckoutResponseDTO(
                checkout_url=None,
                is_alpha=True,
                message="Alpha access granted! All features are free during alpha.",
            )
        
        # Validate Stripe configuration
        if not settings.stripe_secret_key or not settings.stripe_price_id:
            raise HTTPException(
                status_code=503,
                detail="Payment system not configured",
            )
        
        # Already premium
        if user.is_premium:
            return CheckoutResponseDTO(
                checkout_url=None,
                is_alpha=False,
                message="You already have premium access!",
            )
        
        # Create or get Stripe customer
        if not user.stripe_customer_id:
            customer = stripe.Customer.create(email=user.email)
            user.stripe_customer_id = customer.id
            await db_session.flush()
        
        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=user.stripe_customer_id,
            line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
            mode="payment",  # One-time payment for lifetime access
            success_url=f"{settings.frontend_url}/learn/courses?payment=success",
            cancel_url=f"{settings.frontend_url}/learn/courses?payment=cancelled",
            metadata={"user_id": str(user.id)},
        )
        
        return CheckoutResponseDTO(
            checkout_url=session.url,
            is_alpha=False,
            message="Redirecting to checkout...",
        )
    
    @post("/webhook")
    async def stripe_webhook(
        self,
        request: "Request",
        db_session: AsyncSession,
    ) -> dict:
        """Handle Stripe webhook events."""
        # During alpha, webhooks are not needed
        if settings.is_alpha:
            return {"status": "skipped", "reason": "alpha mode"}
        
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature")
        
        if not sig_header or not settings.stripe_webhook_secret:
            raise HTTPException(status_code=400, detail="Missing signature")
        
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.stripe_webhook_secret
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid payload")
        except stripe.error.SignatureVerificationError:
            raise HTTPException(status_code=400, detail="Invalid signature")
        
        # Handle successful payment
        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            user_id = session.get("metadata", {}).get("user_id")
            
            if user_id:
                result = await db_session.execute(
                    select(User).where(User.id == UUID(user_id))
                )
                user = result.scalar_one_or_none()
                if user:
                    user.is_premium = True
                    await db_session.flush()
        
        return {"status": "success"}

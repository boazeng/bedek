"""Idempotent deploy-time bootstrap: create the schema, run in-place migrations
and ensure a super_admin with a known password exists.

Solves the chicken-and-egg of production login (you cannot log in to create the
first user, and you cannot create a password without logging in). Invoked by the
Lambda migrate handler after each deploy, and runnable locally:

    python -m app.bootstrap     # reads SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
"""
import os

from .auth.passwords import hash_password
from .database import Base, SessionLocal, engine, ensure_schema_migrations
from .models import User, UserRole


def create_tables() -> None:
    from . import models  # noqa: F401 — register every model on Base.metadata

    Base.metadata.create_all(bind=engine)
    ensure_schema_migrations()


def ensure_super_admin(email: str, password: str, full_name: str = "Administrator") -> int:
    """Create the super_admin if absent; always (re)set its password and reactivate.
    Returns the user id."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            user = User(
                email=email,
                full_name=full_name,
                role=UserRole.SUPER_ADMIN,
                company_id=None,
                is_active=True,
            )
            db.add(user)
        user.password_hash = hash_password(password)
        user.is_active = True
        db.commit()
        db.refresh(user)
        return user.id
    finally:
        db.close()


def run(email: str | None = None, password: str | None = None) -> dict:
    """Create tables and, if admin credentials are supplied, ensure the super_admin."""
    create_tables()
    email = email or os.environ.get("SEED_ADMIN_EMAIL")
    password = password or os.environ.get("SEED_ADMIN_PASSWORD")
    result: dict = {"tables": "ensured"}
    if email and password:
        result["super_admin_id"] = ensure_super_admin(email, password)
        result["super_admin_email"] = email
    else:
        result["super_admin"] = "skipped (no SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD)"
    return result


if __name__ == "__main__":
    print(run())

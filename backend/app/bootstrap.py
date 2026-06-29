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


# Default system-wide location catalog (restored). Seeded once if the table is
# empty so a fresh/upgraded deploy has the standard locations to start from.
DEFAULT_SYSTEM_LOCATIONS = [
    "סלון",
    "מטבח",
    "חדר שינה הורים",
    "חדר שינה 1",
    "חדר שינה 2",
    "מקלחת כללית",
    "מקלחת הורים",
    "מרפסת שמש",
    'ממ"ד',
    "גג עליון",
    "חדר מדרגות",
    "לובי ראשי",
    "לובי קומתי",
]


def ensure_system_locations() -> None:
    """Populate the system_locations catalog with the defaults if it's empty."""
    from .models import SystemLocation

    db = SessionLocal()
    try:
        if db.query(SystemLocation).first():
            return
        for i, name in enumerate(DEFAULT_SYSTEM_LOCATIONS):
            db.add(SystemLocation(name=name, sort_order=i, is_active=True))
        db.commit()
    finally:
        db.close()


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
    ensure_system_locations()
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

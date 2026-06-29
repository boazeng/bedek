"""Authentication endpoints.

  • POST /login      — email + password (production). Always available.
  • POST /dev-login  — email only, no password (dev convenience). Gated by
                       settings.enable_dev_login; returns 404 in prod.
  • GET  /dev-users  — list users for the dev-login dropdown. Same gating.
  • GET  /me         — current user from JWT.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.google import GoogleAuthError, verify_google_token
from ..auth.passwords import hash_password, verify_password
from ..auth.tokens import issue_token
from ..config import settings
from ..deps import get_current_user, get_db
from ..models import Company, User, UserRole


router = APIRouter(prefix="/api/auth", tags=["auth"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "CurrentUser"


class CurrentUser(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    company_id: int | None
    company_name: str | None
    has_all_projects: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class GoogleLoginRequest(BaseModel):
    # The Google ID token (JWT) returned by Google Identity Services in the browser.
    credential: str


class DevLoginRequest(BaseModel):
    email: EmailStr


class DevUserOption(BaseModel):
    """A user that can be picked from the dev-login dropdown."""

    id: int
    email: str
    full_name: str
    role: str
    company_name: str | None


def _serialize_user(user: User, db: Session) -> CurrentUser:
    company_name = None
    if user.company_id:
        company = db.query(Company).filter(Company.id == user.company_id).first()
        if company:
            company_name = company.name
    return CurrentUser(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        company_id=user.company_id,
        company_name=company_name,
        has_all_projects=user.has_all_projects,
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Production login: verify email + password (PBKDF2). One generic error for
    'no such user', 'inactive', and 'wrong password' — never leak which failed."""
    user = (
        db.query(User)
        .filter(User.email == body.email, User.is_active.is_(True))
        .first()
    )
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = issue_token(user.id)
    return TokenResponse(access_token=token, user=_serialize_user(user, db))


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Self-service password change for the logged-in user. Verifies the current
    password before setting the new one."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters",
        )
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


@router.post("/google", response_model=TokenResponse)
def google_login(body: GoogleLoginRequest, db: Session = Depends(get_db)):
    """Sign in with Google. Verifies the Google ID token, then logs in the user
    whose email matches an EXISTING active account. We never auto-provision: an
    unknown Google email is rejected, so an admin stays in control of access."""
    try:
        claims = verify_google_token(body.credential)
    except GoogleAuthError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    email = claims["email"].strip()
    user = (
        db.query(User)
        .filter(func.lower(User.email) == email.lower(), User.is_active.is_(True))
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="אין חשבון מורשה לכתובת זו — פנה למנהל המערכת",
        )
    token = issue_token(user.id)
    return TokenResponse(access_token=token, user=_serialize_user(user, db))


@router.post("/dev-login", response_model=TokenResponse)
def dev_login(body: DevLoginRequest, db: Session = Depends(get_db)):
    """Development-only: log in as any user by their email, no password."""
    if not settings.enable_dev_login:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found"
        )
    user = (
        db.query(User)
        .filter(User.email == body.email, User.is_active.is_(True))
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    token = issue_token(user.id)
    return TokenResponse(access_token=token, user=_serialize_user(user, db))


@router.get("/dev-users", response_model=list[DevUserOption])
def list_dev_users(db: Session = Depends(get_db)):
    """Development-only: list every active user so the UI dropdown can show them."""
    if not settings.enable_dev_login:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found"
        )
    rows = (
        db.query(User, Company)
        .outerjoin(Company, Company.id == User.company_id)
        .filter(User.is_active.is_(True))
        .order_by(User.role, User.full_name)
        .all()
    )
    return [
        DevUserOption(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            company_name=company.name if company else None,
        )
        for user, company in rows
    ]


@router.get("/me", response_model=CurrentUser)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _serialize_user(user, db)

"""Authentication endpoints. Dev-login flow only — Google OAuth will replace
the `/dev-login` endpoint and use the same `issue_token` helper."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

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

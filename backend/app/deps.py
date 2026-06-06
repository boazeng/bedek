"""Dependency injection: DB session, authenticated user, permission gates."""
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
import jwt

from .auth.tokens import decode_token
from .database import SessionLocal
from .models import Company, Project, User, UserRole, UserProjectAccess


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    """Resolve the authenticated user from the `Authorization: Bearer <jwt>` header."""
    if not authorization:
        raise _unauthorized("Missing Authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise _unauthorized("Authorization header must be 'Bearer <token>'")

    try:
        user_id = decode_token(parts[1])
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Token expired")
    except jwt.PyJWTError:
        raise _unauthorized("Invalid token")

    user = (
        db.query(User)
        .filter(User.id == user_id, User.is_active.is_(True))
        .first()
    )
    if not user:
        raise _unauthorized("User not found or inactive")
    return user


def get_current_company(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Company:
    """Get the tenant company of the authenticated user.

    Super admins must use endpoints that take an explicit company_id; calling
    a tenant-scoped endpoint as a super admin without a company context is an error.
    """
    if user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super admin must specify a company explicitly",
        )
    if user.company_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User has no company assigned",
        )
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company or not company.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found or inactive",
        )
    return company


def require_super_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin only",
        )
    return user


def require_company_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company admin only",
        )
    return user


def user_can_access_project(
    user: User, project: Project, db: Session
) -> bool:
    """Check whether `user` is allowed to see `project`. Used by the API layer."""
    if user.role == UserRole.SUPER_ADMIN:
        return True
    if project.company_id != user.company_id:
        return False
    # company_admin → all projects of own company
    if user.role == UserRole.COMPANY_ADMIN:
        return True
    if user.role == UserRole.COMPANY_USER:
        if user.has_all_projects:
            return True
        granted = (
            db.query(UserProjectAccess.id)
            .filter(
                UserProjectAccess.user_id == user.id,
                UserProjectAccess.project_id == project.id,
            )
            .first()
        )
        return granted is not None
    # end_customer: project visibility is derived from their units (handled
    # at the malfunction-list layer, not here).
    return False


def allowed_project_ids_for(user: User, db: Session) -> list[int] | None:
    """List of project IDs the user can see, or None to mean "no restriction".

    None = super_admin or company_admin (they see everything in scope).
    [] = the user has no project access.
    """
    if user.role in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN):
        return None
    if user.role == UserRole.COMPANY_USER:
        if user.has_all_projects:
            return None
        rows = (
            db.query(UserProjectAccess.project_id)
            .filter(UserProjectAccess.user_id == user.id)
            .all()
        )
        return [r[0] for r in rows]
    # end_customer → projects derived from their units
    if user.role == UserRole.END_CUSTOMER:
        from .models import SaleUnit

        rows = (
            db.query(SaleUnit.project_id)
            .filter(SaleUnit.buyer_id == user.buyer_id)
            .distinct()
            .all()
        )
        return [r[0] for r in rows]
    return []

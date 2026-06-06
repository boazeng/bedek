"""Users management. Super admin sees all; company admin sees own tenant."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, require_company_admin
from ..models import (
    Company,
    Project,
    User,
    UserProjectAccess,
    UserRole,
)
from ..schemas.admin import UserIn, UserOut


router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])


def _serialize(user: User, db: Session) -> UserOut:
    project_ids = [
        row[0]
        for row in db.query(UserProjectAccess.project_id)
        .filter(UserProjectAccess.user_id == user.id)
        .all()
    ]
    return UserOut.model_validate(
        {**user.__dict__, "project_ids": project_ids}
    )


def _enforce_company_scope(
    actor: User, target_company_id: int | None, db: Session
) -> int | None:
    """Validate that `actor` is allowed to operate on a user belonging to
    `target_company_id`. Returns the company_id to persist."""
    if actor.role == UserRole.SUPER_ADMIN:
        if target_company_id is not None:
            company = db.query(Company).filter(Company.id == target_company_id).first()
            if not company:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Company not found"
                )
        return target_company_id
    # company_admin: forced to own company
    if target_company_id is not None and target_company_id != actor.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot manage users in another company",
        )
    return actor.company_id


def _set_project_access(
    db: Session, user: User, project_ids: list[int] | None
) -> None:
    """Replace the user's UserProjectAccess rows with the given list."""
    db.query(UserProjectAccess).filter(
        UserProjectAccess.user_id == user.id
    ).delete(synchronize_session=False)
    if not project_ids:
        return
    projects = (
        db.query(Project)
        .filter(Project.id.in_(project_ids))
        .all()
    )
    by_id = {p.id: p for p in projects}
    for pid in project_ids:
        proj = by_id.get(pid)
        if not proj:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Project {pid} not found",
            )
        if proj.company_id != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Project {pid} belongs to a different company",
            )
        db.add(
            UserProjectAccess(
                user_id=user.id, project_id=proj.id, company_id=proj.company_id
            )
        )


@router.get("", response_model=list[UserOut])
def list_users(
    company_id: int | None = Query(default=None),
    scope: str | None = Query(default=None, pattern="^(system|company)$"),
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    """List users.

    - `scope=system` → only super_admin users (system administrators).
    - `scope=company` → only users tied to a company (company_admin /
      company_user / end_customer); super_admin must pass `company_id`.
    - no scope → legacy behavior (super sees all; others see own company).
    """
    q = db.query(User)
    if scope == "system":
        q = q.filter(User.role == UserRole.SUPER_ADMIN)
    elif scope == "company":
        if actor.role == UserRole.SUPER_ADMIN:
            if company_id is None:
                return []
            q = q.filter(
                User.company_id == company_id,
                User.role != UserRole.SUPER_ADMIN,
            )
        else:
            q = q.filter(
                User.company_id == actor.company_id,
                User.role != UserRole.SUPER_ADMIN,
            )
    else:
        if actor.role == UserRole.SUPER_ADMIN:
            if company_id is not None:
                q = q.filter(User.company_id == company_id)
        else:
            q = q.filter(User.company_id == actor.company_id)
    users = q.order_by(User.role, User.full_name).all()
    return [_serialize(u, db) for u in users]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    if body.role == UserRole.SUPER_ADMIN and actor.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a super admin can create another super admin",
        )

    target_company = (
        None
        if body.role == UserRole.SUPER_ADMIN
        else _enforce_company_scope(actor, body.company_id, db)
    )
    if body.role != UserRole.SUPER_ADMIN and target_company is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non-super-admin user must have a company_id",
        )

    user = User(
        full_name=body.full_name,
        email=body.email,
        phone=body.phone,
        role=body.role,
        company_id=target_company,
        has_all_projects=body.has_all_projects,
        buyer_id=body.buyer_id,
        is_active=body.is_active,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Email '{body.email}' is already in use",
        )

    if body.role == UserRole.COMPANY_USER and not body.has_all_projects:
        _set_project_access(db, user, body.project_ids or [])
    db.commit()
    db.refresh(user)
    return _serialize(user, db)


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if (
        actor.role != UserRole.SUPER_ADMIN
        and user.company_id != actor.company_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return _serialize(user, db)


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    if (
        actor.role != UserRole.SUPER_ADMIN
        and user.company_id != actor.company_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if body.role == UserRole.SUPER_ADMIN and actor.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a super admin can promote to super admin",
        )

    new_company_id = (
        None
        if body.role == UserRole.SUPER_ADMIN
        else _enforce_company_scope(actor, body.company_id, db)
    )
    user.full_name = body.full_name
    user.email = body.email
    user.phone = body.phone
    user.role = body.role
    user.company_id = new_company_id
    user.has_all_projects = body.has_all_projects
    user.buyer_id = body.buyer_id
    user.is_active = body.is_active
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email conflict"
        )

    if body.role == UserRole.COMPANY_USER:
        if body.has_all_projects:
            _set_project_access(db, user, [])
        else:
            _set_project_access(db, user, body.project_ids or [])
    else:
        _set_project_access(db, user, [])
    db.commit()
    db.refresh(user)
    return _serialize(user, db)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return
    if (
        actor.role != UserRole.SUPER_ADMIN
        and user.company_id != actor.company_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if user.id == actor.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate yourself"
        )
    user.is_active = False
    db.commit()

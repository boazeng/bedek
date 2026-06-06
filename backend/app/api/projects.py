"""Projects CRUD. Scoped to the actor's company; super_admin specifies via query."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..deps import (
    allowed_project_ids_for,
    get_current_user,
    get_db,
    require_company_admin,
    user_can_access_project,
)
from ..models import Company, Project, User, UserRole
from ..schemas.admin import ProjectIn, ProjectOut


router = APIRouter(prefix="/api/projects", tags=["projects"])


def _resolve_company_id(actor: User, requested: int | None, db: Session) -> int:
    if actor.role == UserRole.SUPER_ADMIN:
        if not requested:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Super admin must pass company_id",
            )
        company = db.query(Company).filter(Company.id == requested).first()
        if not company:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Company not found"
            )
        return company.id
    if actor.company_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="No company assigned"
        )
    if requested and requested != actor.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot operate on another company",
        )
    return actor.company_id


@router.get("", response_model=list[ProjectOut])
def list_projects(
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    company = _resolve_company_id(actor, company_id, db)
    q = db.query(Project).filter(Project.company_id == company)
    allowed = allowed_project_ids_for(actor, db)
    if allowed is not None:
        if not allowed:
            return []
        q = q.filter(Project.id.in_(allowed))
    return q.order_by(Project.name).all()


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    company_id = _resolve_company_id(actor, body.company_id, db)
    payload = body.model_dump(exclude={"company_id"})
    project = Project(company_id=company_id, **payload)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not user_can_access_project(actor, project, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return project


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    body: ProjectIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if (
        actor.role != UserRole.SUPER_ADMIN
        and project.company_id != actor.company_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    for k, v in body.model_dump(exclude={"company_id"}).items():
        setattr(project, k, v)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return
    if (
        actor.role != UserRole.SUPER_ADMIN
        and project.company_id != actor.company_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    db.delete(project)
    db.commit()

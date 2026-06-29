"""TACT-CRM integration endpoints (read-only sync into bedek).

Company-scoped: super_admin must pass `company_id`; company_admin is locked to
their own. The CRM service secret lives only in server config — never exposed.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..deps import get_db, require_company_admin, require_super_admin
from ..integrations import crm_client
from ..models import Company, User, UserRole
from ..services import crm_sync


router = APIRouter(prefix="/api/crm", tags=["crm-integration"])


class ImportCompaniesRequest(BaseModel):
    ids: list[int]


def _require_configured():
    if not crm_client.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CRM integration is not configured",
        )


@router.get("/companies")
def crm_companies(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """List CRM companies for the import picker (each marked if already linked).
    Super-admin only."""
    _require_configured()
    try:
        return crm_sync.list_crm_companies(db)
    except crm_client.CrmError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))


@router.post("/import-companies")
def import_companies(
    body: ImportCompaniesRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Create/link the chosen CRM companies into bedek (curated — no mass
    deactivation), and auto-import each one's projects. Super-admin only."""
    _require_configured()
    try:
        return crm_sync.import_companies(db, body.ids)
    except crm_client.CrmError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))


@router.post("/sync-all-projects")
def sync_all_projects(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Sync projects for every CRM-linked company so all company users see the
    projects built in CRM. Super-admin only."""
    _require_configured()
    try:
        return crm_sync.sync_all_projects(db)
    except crm_client.CrmError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))


def _resolve_company(actor: User, requested: int | None, db: Session) -> Company:
    if actor.role == UserRole.SUPER_ADMIN:
        if not requested:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Super admin must pass company_id",
            )
        cid = requested
    else:
        if actor.company_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No company assigned")
        if requested and requested != actor.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        cid = actor.company_id
    company = db.query(Company).filter(Company.id == cid).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


@router.get("/status")
def crm_status(
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    """Whether the integration is configured and the company is linked. If linked,
    confirms the CRM tenant name (a quick 'whoami' against CRM)."""
    company = _resolve_company(actor, company_id, db)
    out = {
        "configured": crm_client.is_configured(),
        "crm_company_id": company.crm_company_id,
        "crm_company_name": None,
        "error": None,
    }
    if out["configured"] and company.crm_company_id:
        try:
            out["crm_company_name"] = crm_client.get_company(company.crm_company_id).get("name")
        except crm_client.CrmError as e:
            out["error"] = str(e)
    return out


@router.post("/sync-projects")
def sync_projects(
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    """Import/update this company's real-estate (bedek) projects from CRM."""
    company = _resolve_company(actor, company_id, db)
    if not crm_client.is_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="CRM integration is not configured")
    if not company.crm_company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This company is not linked to a CRM company")
    try:
        return crm_sync.sync_projects(db, company)
    except crm_client.CrmError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

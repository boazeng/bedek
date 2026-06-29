"""Sync read-only data from TACT-CRM into bedek.

For now: the company's real-estate (bedek) projects → bedek `projects`.
De-duped by `crm_external_id` (the CRM project id), so re-running is idempotent.
Customers are intentionally NOT bulk-imported — they will be pulled live and
synced on demand when a customer is linked to an apartment (future feature).
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..integrations import crm_client
from ..models import Company, Project


def sync_projects(db: Session, company: Company) -> dict:
    """Upsert the linked CRM tenant's bedek projects into this company.

    Returns a summary {created, updated, total}."""
    if not company.crm_company_id:
        raise ValueError("This company is not linked to a CRM company")

    crm_projects = crm_client.list_realestate_projects(company.crm_company_id)

    existing = {
        p.crm_external_id: p
        for p in db.query(Project)
        .filter(Project.company_id == company.id, Project.crm_external_id.isnot(None))
        .all()
    }

    created = updated = 0
    for cp in crm_projects:
        ext = str(cp.get("id"))
        number = cp.get("project_number")
        base_name = cp.get("name") or f"פרויקט {number or ext}"
        name = f"{base_name} ({number})" if number else base_name

        proj = existing.get(ext)
        if proj:
            if proj.name != name:
                proj.name = name
                updated += 1
        else:
            db.add(Project(company_id=company.id, name=name, crm_external_id=ext))
            created += 1

    db.commit()
    return {"created": created, "updated": updated, "total": len(crm_projects)}

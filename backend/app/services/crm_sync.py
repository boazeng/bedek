"""Sync read-only data from TACT-CRM into bedek.

Companies are imported via an admin picker; importing a company also pulls its
real-estate (bedek) projects automatically. Projects are de-duped by
`crm_external_id` (the CRM project id), so re-running is idempotent. Customers
are intentionally NOT bulk-imported — they will be pulled live and synced on
demand when a customer is linked to an apartment (future feature).
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from ..integrations import crm_client
from ..models import Company, Project


def _slug_for(crm_id: int, name: str) -> str:
    """Stable, unique slug for a CRM-sourced company."""
    base = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return f"crm-{crm_id}" if not base else f"crm-{crm_id}-{base}"[:80]


def list_crm_companies(db: Session) -> list[dict]:
    """CRM companies for the admin picker, each annotated with whether it is
    already linked in bedek — [{id, name, linked}]."""
    crm_companies = crm_client.list_companies()
    linked_ids = {
        row[0]
        for row in db.query(Company.crm_company_id)
        .filter(Company.crm_company_id.isnot(None))
        .all()
    }
    return [
        {
            "id": int(c["id"]),
            "name": c.get("name"),
            # 5-digit CRM company number (Priority-style). Additive field exposed
            # by CRM 2026-07-01; may be absent for older CRM deployments.
            "company_number": c.get("company_number"),
            "linked": int(c["id"]) in linked_ids,
        }
        for c in crm_companies
    ]


def import_companies(db: Session, ids: list[int]) -> dict:
    """Create/link the CHOSEN CRM companies into bedek AND import each one's bedek
    projects. Curated — does NOT touch companies the admin didn't select.
    Returns {created, updated, skipped, projects_created, projects_updated}."""
    crm_by_id = {int(c["id"]): c for c in crm_client.list_companies()}
    by_crm_id = {
        c.crm_company_id: c
        for c in db.query(Company).filter(Company.crm_company_id.isnot(None)).all()
    }

    created = updated = skipped = 0
    affected: list[Company] = []
    for raw in ids:
        crm_id = int(raw)
        info = crm_by_id.get(crm_id)
        if not info:
            skipped += 1
            continue
        name = info.get("name") or f"חברה {crm_id}"
        existing = by_crm_id.get(crm_id)
        if existing:
            if existing.name != name or not existing.is_active:
                existing.name = name
                existing.is_active = True
                updated += 1
            affected.append(existing)
        else:
            company = Company(
                name=name,
                slug=_slug_for(crm_id, name),
                crm_company_id=crm_id,
                is_active=True,
            )
            db.add(company)
            created += 1
            affected.append(company)

    db.flush()  # assign ids to newly created companies before syncing projects

    # Auto-import each imported company's projects.
    proj_created = proj_updated = 0
    for company in affected:
        try:
            r = _sync_projects(db, company)
            proj_created += r["created"]
            proj_updated += r["updated"]
        except crm_client.CrmError:
            # Don't fail the whole import if one company's projects can't be read.
            continue

    db.commit()
    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "projects_created": proj_created,
        "projects_updated": proj_updated,
    }


def sync_all_projects(db: Session) -> dict:
    """Sync projects for every CRM-linked, active company (super-admin action).
    Returns {companies, projects_created, projects_updated}."""
    companies = (
        db.query(Company)
        .filter(Company.crm_company_id.isnot(None), Company.is_active.is_(True))
        .all()
    )
    proj_created = proj_updated = 0
    done = 0
    for company in companies:
        try:
            r = _sync_projects(db, company)
            proj_created += r["created"]
            proj_updated += r["updated"]
            done += 1
        except crm_client.CrmError:
            continue
    db.commit()
    return {"companies": done, "projects_created": proj_created, "projects_updated": proj_updated}


def _sync_projects(db: Session, company: Company) -> dict:
    """Upsert the linked CRM tenant's bedek projects into this company. No commit
    — the caller commits (lets us batch multiple companies)."""
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

    return {"created": created, "updated": updated, "total": len(crm_projects)}


def sync_projects(db: Session, company: Company) -> dict:
    """Public single-company project sync (commits)."""
    r = _sync_projects(db, company)
    db.commit()
    return r

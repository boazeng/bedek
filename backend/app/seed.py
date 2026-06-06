"""Seed the database with a super-admin + 2 demo companies, each with users,
projects, units and defects. Run from the backend folder:

    python -m app.seed
"""
from __future__ import annotations

import random
from datetime import date, timedelta

from .database import Base, SessionLocal, engine
from sqlalchemy import func

from .models import (
    Company,
    EntityType,
    Project,
    Buyer,
    SaleUnit,
    SaleUnitType,
    LocationCatalog,
    Malfunction,
    MalfunctionStatus,
    MalfunctionSource,
    MalfunctionGroup,
    SystemLocation,
    User,
    UserRole,
    UserProjectAccess,
)


DEFAULT_ENTITY_TYPES = [
    # (name, code, kind) — kind defines what ProjectItem kind a template of
    # this entity type creates when applied.
    ("מבנה מגורים", "residential_building", "building"),
    ("מבנה משרדים", "office_building", "building"),
    ("מבנה מסחרי", "commercial_building", "building"),
    ("קומה", "floor", "floor"),
    ("דירה", "apartment", "unit"),
    ("שטחי ציבור", "public_areas", "unit"),
    ("חניון", "parking_lot", "unit"),
    ("גינה", "garden", "unit"),
    ("מסחרי", "commercial", "unit"),
    ("חנות", "shop", "unit"),
]


def _ensure_entity_types(db) -> None:
    """Idempotent: insert any missing default entity types, preserving order."""
    existing_codes = {
        row.code for row in db.query(EntityType).all() if row.code is not None
    }
    next_order = db.query(EntityType).count()
    for name, code, kind in DEFAULT_ENTITY_TYPES:
        if code in existing_codes:
            continue
        db.add(
            EntityType(
                name=name,
                code=code,
                kind=kind,
                sort_order=next_order,
                is_active=True,
            )
        )
        next_order += 1
    db.commit()


def _ensure_system_locations(db) -> None:
    """Populate the system_locations table on first run.

    Seeds from the company with the largest, most-organized location catalog
    (so the user's manual ordering carries over). Falls back to DEFAULT_LOCATIONS
    if no per-company catalogs exist yet. Idempotent."""
    if db.query(SystemLocation).first():
        return

    # Pick the company with the most location_catalog rows — assume it's the
    # most representative of the user's intent.
    top = (
        db.query(LocationCatalog.company_id, func.count(LocationCatalog.id).label("c"))
        .group_by(LocationCatalog.company_id)
        .order_by(func.count(LocationCatalog.id).desc())
        .first()
    )

    order: list[str] = []
    seen: set[str] = set()

    if top:
        primary_cid = top[0]
        primary_rows = (
            db.query(LocationCatalog.name)
            .filter(LocationCatalog.company_id == primary_cid)
            .order_by(LocationCatalog.sort_order)
            .all()
        )
        for (n,) in primary_rows:
            if n not in seen:
                seen.add(n)
                order.append(n)
        # Add stragglers from other companies, sorted alphabetically.
        extras = (
            db.query(LocationCatalog.name)
            .filter(LocationCatalog.company_id != primary_cid)
            .distinct()
            .order_by(LocationCatalog.name)
            .all()
        )
        for (n,) in extras:
            if n not in seen:
                seen.add(n)
                order.append(n)
    else:
        # No companies have a catalog yet — start from the bundled defaults.
        for n, _ in DEFAULT_LOCATIONS:
            if n not in seen:
                seen.add(n)
                order.append(n)

    for idx, name in enumerate(order):
        db.add(SystemLocation(name=name, sort_order=idx, is_active=True))
    db.commit()


DEFAULT_LOCATIONS = [
    ("סלון", False),
    ("מטבח", False),
    ("חדר שינה הורים", False),
    ("חדר שינה 1", False),
    ("חדר שינה 2", False),
    ("מקלחת כללית", False),
    ("מקלחת הורים", False),
    ("מרפסת שמש", False),
    ("ממ\"ד", False),
    ("גג עליון", True),
    ("חדר מדרגות", True),
    ("לובי ראשי", True),
    ("לובי קומתי", True),
]


def _seed_one_company(
    db, slug: str, name: str, projects_data: list[tuple[str, str]]
) -> Company:
    company = Company(
        name=name,
        slug=slug,
        contact_email=f"info@{slug}.co.il",
        phone="03-1234567",
    )
    db.add(company)
    db.flush()

    for i, (loc_name, public_only) in enumerate(DEFAULT_LOCATIONS):
        db.add(
            LocationCatalog(
                company_id=company.id,
                name=loc_name,
                applies_to_public_only=public_only,
                sort_order=i,
            )
        )

    projects: list[Project] = []
    for p_name, address in projects_data:
        p = Project(
            company_id=company.id,
            name=p_name,
            address=address,
            project_manager="יוסי כהן",
            site_manager="דוד לוי",
        )
        db.add(p)
        projects.append(p)
    db.flush()

    buyers: list[Buyer] = []
    first_names = ["משה", "שרה", "אברהם", "רחל", "יעקב", "לאה", "דניאל", "מיכל"]
    last_names = ["כהן", "לוי", "מזרחי", "פרץ", "אברהמי", "שטרן", "ביטון"]
    for i in range(12):
        b = Buyer(
            company_id=company.id,
            first_name=random.choice(first_names),
            last_name=random.choice(last_names),
            phone=f"05{random.randint(0, 9)}-{random.randint(1000000, 9999999)}",
            email=f"buyer{i}-{slug}@example.com",
            national_id=str(random.randint(100000000, 999999999)),
        )
        db.add(b)
        buyers.append(b)
    db.flush()

    units: list[SaleUnit] = []
    for proj in projects:
        for u_idx in range(1, 9):
            u = SaleUnit(
                company_id=company.id,
                project_id=proj.id,
                unit_type=SaleUnitType.APARTMENT,
                unit_number=str(u_idx),
                entrance="א",
                floor=str((u_idx + 1) // 2),
                buyer_id=random.choice(buyers).id,
            )
            db.add(u)
            units.append(u)
    db.flush()

    statuses_distribution = (
        [MalfunctionStatus.PENDING_MANAGER] * 4
        + [MalfunctionStatus.TODO] * 6
        + [MalfunctionStatus.NEGOTIATION] * 2
        + [MalfunctionStatus.FROZEN] * 1
        + [MalfunctionStatus.DONE] * 5
        + [MalfunctionStatus.CANCELLED] * 1
    )
    sources = list(MalfunctionSource)
    groups = list(MalfunctionGroup)
    descriptions = [
        "סדק בקיר הסלון",
        "ברז דולף במטבח",
        "תקע חשמל לא עובד",
        "אריח רצפה שבור",
        "דלת חדר השינה לא נסגרת",
        "סימני רטיבות בתקרה",
        "חלון שלא נסגר עד הסוף",
        "פנל מוביל לחדר השירותים",
        "מתג אור פגום",
        "צבע מתקלף מהקיר",
    ]
    today = date.today()
    for proj in projects:
        n_defects = random.randint(15, 28)
        proj_units = [u for u in units if u.project_id == proj.id]
        for _ in range(n_defects):
            status_v = random.choice(statuses_distribution)
            opened = today - timedelta(days=random.randint(0, 120))
            closed = None
            if status_v in (MalfunctionStatus.DONE, MalfunctionStatus.CANCELLED):
                closed = opened + timedelta(days=random.randint(1, 30))
            unit = random.choice(proj_units)
            db.add(
                Malfunction(
                    company_id=company.id,
                    project_id=proj.id,
                    sale_unit_id=unit.id,
                    buyer_id=unit.buyer_id,
                    status=status_v,
                    source=random.choice(sources),
                    group=random.choice(groups),
                    description=random.choice(descriptions),
                    opened_at=opened,
                    closed_at=closed,
                )
            )

    # --- Users for this company ---
    admin = User(
        company_id=company.id,
        full_name=f"אדמין {name}",
        email=f"admin@{slug}.co.il",
        role=UserRole.COMPANY_ADMIN,
    )
    user_all = User(
        company_id=company.id,
        full_name="מפקח – גישה לכל הפרויקטים",
        email=f"all@{slug}.co.il",
        role=UserRole.COMPANY_USER,
        has_all_projects=True,
    )
    user_one = User(
        company_id=company.id,
        full_name=f"מפקח – פרויקט {projects[0].name}",
        email=f"one@{slug}.co.il",
        role=UserRole.COMPANY_USER,
        has_all_projects=False,
    )
    db.add_all([admin, user_all, user_one])
    db.flush()
    db.add(
        UserProjectAccess(
            user_id=user_one.id,
            project_id=projects[0].id,
            company_id=company.id,
        )
    )

    return company


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # System-wide tables are always kept in sync (idempotent).
        _ensure_entity_types(db)
        _ensure_system_locations(db)

        if db.query(User).filter(User.role == UserRole.SUPER_ADMIN).first():
            print("Already seeded (system tables refreshed); skipping the rest.")
            return

        super_admin = User(
            company_id=None,
            full_name="Super Admin",
            email="root@cmm.io",
            role=UserRole.SUPER_ADMIN,
        )
        db.add(super_admin)

        c1 = _seed_one_company(
            db,
            slug="demo",
            name="חברת דמו - בניה ופיתוח",
            projects_data=[
                ("מגדלי הכרמל", "רחוב הרצל 24, חיפה"),
                ("פארק רעננה", "שדרות יצחק רבין 18, רעננה"),
                ("נווה צדק רזידנס", "רחוב שבזי 41, תל אביב"),
            ],
        )
        c2 = _seed_one_company(
            db,
            slug="bnb",
            name="ב.נ.ב יזמות",
            projects_data=[
                ("גני אלון", "רחוב האלון 5, מודיעין"),
                ("שיאו של עולם", "שדרות הים 12, נתניה"),
            ],
        )

        db.commit()
        print("Seed complete.")
        print("Login emails (dev-login, no password):")
        print("  root@cmm.io          (super_admin)")
        print(f"  admin@{c1.slug}.co.il        (company_admin – {c1.name})")
        print(f"  all@{c1.slug}.co.il          (company_user – all projects)")
        print(f"  one@{c1.slug}.co.il          (company_user – 1 project)")
        print(f"  admin@{c2.slug}.co.il         (company_admin – {c2.name})")
    finally:
        db.close()


if __name__ == "__main__":
    seed()

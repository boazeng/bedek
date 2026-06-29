"""Seed the database with a super-admin + 2 demo companies, each with users,
projects (building → entrance → floor → unit) and defects. Run from backend:

    python -m app.seed
"""
from __future__ import annotations

import random
from datetime import date, timedelta

from .database import Base, SessionLocal, engine

from .models import (
    Company,
    Project,
    ProjectItem,
    ProjectItemKind,
    SaleUnitType,
    Buyer,
    LocationCatalog,
    Malfunction,
    MalfunctionStatus,
    MalfunctionSource,
    MalfunctionGroup,
    Professional,
    User,
    UserRole,
    UserProjectAccess,
)


DEFAULT_PROFESSIONALS = [
    "חשמל",
    "אינסטלציה",
    "גמרים",
    "שלד",
    "מיגון",
    "איטום",
    "אלומיניום",
]


def _ensure_professionals(db) -> None:
    """Idempotent: insert any missing default professional classifications."""
    existing_names = {row.name for row in db.query(Professional).all()}
    next_order = db.query(Professional).count()
    for name in DEFAULT_PROFESSIONALS:
        if name in existing_names:
            continue
        db.add(Professional(name=name, sort_order=next_order, is_active=True))
        next_order += 1
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


def _build_project_tree(db, company_id: int, project_id: int) -> list[ProjectItem]:
    """Create a building → entrance → floor → unit tree. Returns the leaf units.

    Two buildings, each with one entrance, 3 floors, 2 apartments per floor
    (auto-numbered 1..N per entrance), plus a parking unit on the ground floor.
    """
    units: list[ProjectItem] = []

    def add(parent_id, kind, name, *, number=None, unit_type=None, sort_order):
        item = ProjectItem(
            company_id=company_id,
            project_id=project_id,
            parent_id=parent_id,
            kind=kind,
            name=name,
            number=number,
            unit_type=unit_type,
            sort_order=sort_order,
        )
        db.add(item)
        db.flush()
        return item

    for b_idx in range(2):
        building = add(None, ProjectItemKind.BUILDING, f"בניין {b_idx + 1}", sort_order=b_idx)
        entrance = add(building.id, ProjectItemKind.ENTRANCE, "כניסה א", sort_order=0)
        apt_counter = 0
        for f_idx in range(3):
            floor = add(
                entrance.id, ProjectItemKind.FLOOR, f"קומה {f_idx + 1}", sort_order=f_idx
            )
            if f_idx == 0:
                units.append(
                    add(
                        floor.id,
                        ProjectItemKind.UNIT,
                        "חניה 1",
                        number="1",
                        unit_type=SaleUnitType.PARKING,
                        sort_order=0,
                    )
                )
            for a in range(2):
                apt_counter += 1
                units.append(
                    add(
                        floor.id,
                        ProjectItemKind.UNIT,
                        f"דירה {apt_counter}",
                        number=str(apt_counter),
                        unit_type=SaleUnitType.APARTMENT,
                        sort_order=a + 1,
                    )
                )
    return units


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

    locations: list[LocationCatalog] = []
    for i, (loc_name, public_only) in enumerate(DEFAULT_LOCATIONS):
        loc = LocationCatalog(
            company_id=company.id,
            name=loc_name,
            applies_to_public_only=public_only,
            sort_order=i,
        )
        db.add(loc)
        locations.append(loc)

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

    units_by_project: dict[int, list[ProjectItem]] = {}
    for proj in projects:
        units_by_project[proj.id] = _build_project_tree(db, company.id, proj.id)
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
        proj_units = units_by_project[proj.id]
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
                    project_item_id=unit.id,
                    location_id=random.choice(locations).id,
                    buyer_id=random.choice(buyers).id,
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
        # System-wide catalogs are always kept in sync (idempotent).
        _ensure_professionals(db)

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

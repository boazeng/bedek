from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    future=True,
    connect_args=connect_args,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Tiny in-place migration registry. Each entry is (table, column, ddl_fragment).
# Run after `Base.metadata.create_all()` to add new columns to existing tables
# without dropping data. Safe to run repeatedly (column-existence check).
_INPLACE_COLUMN_MIGRATIONS: list[tuple[str, str, str]] = [
    ("companies", "crm_company_id", "INTEGER"),
    ("projects", "crm_external_id", "VARCHAR(60)"),
    ("malfunctions", "project_item_id", "INTEGER"),
    ("malfunctions", "professional", "VARCHAR(200)"),
    ("malfunctions", "location_id", "INTEGER"),
    ("project_items", "unit_type", "VARCHAR(30)"),
    ("project_items", "temp_apt_number", "VARCHAR(40)"),
    ("project_items", "permanent_apt_number", "VARCHAR(40)"),
    ("project_items", "floor", "VARCHAR(40)"),
    ("project_items", "customer_name", "VARCHAR(200)"),
]


def ensure_schema_migrations() -> None:
    """Apply the small in-place ALTER TABLE additions defined above."""
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, col, ddl in _INPLACE_COLUMN_MIGRATIONS:
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            if col in existing:
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))

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
    ("templates", "code", "VARCHAR(60)"),
    ("templates", "format", "VARCHAR(40) NOT NULL DEFAULT 'simple'"),
    ("templates", "sort_order", "INTEGER NOT NULL DEFAULT 0"),
    ("template_items", "floor", "VARCHAR(20)"),
    ("malfunctions", "project_item_id", "INTEGER"),
    ("malfunctions", "professional", "VARCHAR(200)"),
    ("entity_types", "kind", "VARCHAR(20) NOT NULL DEFAULT 'unit'"),
    ("project_items", "temp_apt_number", "VARCHAR(40)"),
    ("project_items", "permanent_apt_number", "VARCHAR(40)"),
    ("project_items", "floor", "VARCHAR(40)"),
    ("project_items", "customer_name", "VARCHAR(200)"),
    ("templates", "company_id", "INTEGER"),
    ("templates", "is_internal", "BOOLEAN NOT NULL DEFAULT 0"),
    ("templates", "kind", "VARCHAR(20)"),
    ("template_items", "direction", "VARCHAR(20)"),
    ("template_items", "temp_apt_number", "VARCHAR(40)"),
    ("template_items", "permanent_apt_number", "VARCHAR(40)"),
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

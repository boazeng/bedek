from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine, ensure_schema_migrations
from .api import (
    auth,
    companies,
    company_professionals,
    dashboard,
    health,
    locations,
    malfunctions,
    professionals,
    project_items,
    projects,
    users,
)


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def _init_db():
        # Import models so they are registered on Base.metadata before create_all.
        from . import models  # noqa: F401

        Base.metadata.create_all(bind=engine)
        # In-place column migrations for tables that already exist.
        ensure_schema_migrations()

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(dashboard.router)
    app.include_router(companies.router)
    app.include_router(users.router)
    app.include_router(projects.router)
    app.include_router(locations.router)
    app.include_router(professionals.router)
    app.include_router(company_professionals.router)
    app.include_router(project_items.router)
    app.include_router(malfunctions.router)
    return app


app = create_app()

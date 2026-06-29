from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "CMM"
    app_env: str = "development"
    # Local dev defaults to SQLite (zero install). For Postgres set:
    # DATABASE_URL=postgresql+pg8000://cmm:cmm@localhost:5432/cmm
    # (pg8000 is the pure-Python driver — required for AWS Lambda packaging.)
    database_url: str = "sqlite:///./cmm.db"
    cors_origins: str = "http://localhost:5173"

    # JWT — replace in production with a long random value via .env
    jwt_secret: str = "dev-secret-change-in-prod"
    jwt_algorithm: str = "HS256"
    jwt_ttl_hours: int = 24

    # Allow the /api/auth/dev-login endpoint and listing all users only while
    # this is True. MUST be False in any deployed environment.
    enable_dev_login: bool = True

    # Google OAuth Web client ID (public). Used as the expected `aud` when
    # verifying Google ID tokens from the browser. Empty = Google login disabled.
    google_client_id: str = ""

    # --- TACT-CRM integration (read-only sync of companies' projects + customers) ---
    # Base URL of the CRM service API. The /api/service/* surface is authenticated
    # by the shared service secret below and scoped per call by company_id.
    crm_base_url: str = "https://crm-db.newavera.co.il"
    # Shared service secret (matches CRM's SERVICE_API_KEY). Lives only server-side
    # — injected via env in dev, from SSM/Secrets Manager in prod. Empty = the CRM
    # integration is disabled.
    crm_service_key: str = ""

    # --- File storage (attachments / media) ---
    # 'local' writes to uploads_local_dir and serves via the API (dev);
    # 's3' uses presigned PUT/GET against uploads_bucket (prod).
    storage_backend: str = "local"
    uploads_bucket: str = ""
    uploads_local_dir: str = "./uploads"
    # Presigned URL lifetime (seconds).
    upload_url_ttl: int = 900

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_dev(self) -> bool:
        return self.app_env.lower() in ("development", "dev", "local")


settings = Settings()

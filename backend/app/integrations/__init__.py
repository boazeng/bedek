"""External tools / third-party integrations.

This layer holds anything that talks to the outside world:
- storage (Local filesystem in dev, S3 in prod) — `integrations/storage/`
- WhatsApp bot (incoming defects from residents) — `integrations/whatsapp/`
- Google OAuth (real login) — `integrations/google_oauth/`
- email sending (notifications) — `integrations/email/`

Each integration MUST:
- Expose an interface so callers don't depend on the concrete implementation
  (e.g. `StorageBackend` with `LocalStorage` and `S3Storage` swappable by env).
- Be called from `services/` (preferred) or directly from `api/`.
- Never import from `agents/` or `models/`. (Integrations don't know about
  business entities; they push/pull raw data.)
- Read its credentials from `config.py`, never hard-coded.
"""

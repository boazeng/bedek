"""AWS Lambda entry points.

  • handler         — the FastAPI app behind API Gateway (HTTP API), via Mangum.
  • migrate_handler — one-off: create the schema + ensure the super_admin. Invoke
                      manually after each deploy (`aws lambda invoke ...`).

Two handlers, one deployment package — the migrate function reuses the same code
and DATABASE_URL as the API, so they can never drift apart.
"""
from mangum import Mangum

from .bootstrap import run as bootstrap_run
from .main import app

# api_gateway_base_path "/" because CloudFront forwards the full /api/... path
# and the HTTP API uses the $default stage (no stage prefix to strip).
handler = Mangum(app, lifespan="off")


def migrate_handler(event, context):
    """Invoked out-of-band to provision the DB. Reads SEED_ADMIN_EMAIL /
    SEED_ADMIN_PASSWORD from the environment."""
    return bootstrap_run()

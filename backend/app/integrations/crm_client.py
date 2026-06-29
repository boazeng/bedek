"""TACT-CRM service client — read-only access to a company's bedek projects and
customers via CRM's `/api/service/*` surface.

Pure integration layer: takes data in, returns plain dicts. No DB session, no
models. Uses the stdlib (urllib) so it adds no dependency to the Lambda bundle.
Auth is the shared service secret in the `X-Service-Key` header; the tenant is
scoped by the required `company_id` query param.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

from ..config import settings


class CrmError(RuntimeError):
    """Raised when the CRM service call fails (config, network, or HTTP error)."""


def is_configured() -> bool:
    return bool(settings.crm_base_url and settings.crm_service_key)


def _get(path: str, company_id: int, *, search: str | None = None, timeout: float = 30.0):
    if not is_configured():
        raise CrmError("CRM integration is not configured (missing base URL or service key)")
    params = {"company_id": company_id}
    if search:
        params["search"] = search
    url = f"{settings.crm_base_url.rstrip('/')}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"X-Service-Key": settings.crm_service_key})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise CrmError(f"CRM returned HTTP {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise CrmError(f"Could not reach CRM at {settings.crm_base_url}: {e.reason}") from e


def get_company(company_id: int) -> dict:
    """Whoami for the linked CRM tenant — {id, name}."""
    return _get("/api/service/company", company_id)


def list_realestate_projects(company_id: int, search: str | None = None) -> list[dict]:
    """The company's real-estate (bedek) projects."""
    return _get("/api/service/realestate-projects", company_id, search=search)


def list_customers(company_id: int, search: str | None = None) -> list[dict]:
    """The company's customers."""
    return _get("/api/service/customers", company_id, search=search)

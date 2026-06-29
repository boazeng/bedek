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


def _request(path: str, params: dict, *, method: str = "GET", body: dict | None = None, timeout: float = 30.0):
    if not is_configured():
        raise CrmError("CRM integration is not configured (missing base URL or service key)")
    qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    url = f"{settings.crm_base_url.rstrip('/')}{path}"
    if qs:
        url = f"{url}?{qs}"
    headers = {"X-Service-Key": settings.crm_service_key}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise CrmError(f"CRM returned HTTP {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise CrmError(f"Could not reach CRM at {settings.crm_base_url}: {e.reason}") from e


def _get(path: str, company_id: int, *, search: str | None = None):
    return _request(path, {"company_id": company_id, "search": search})


def list_companies() -> list[dict]:
    """All active CRM companies — [{id, name}]. Cross-tenant (key-only)."""
    return _request("/api/service/companies", {})


def get_company(company_id: int) -> dict:
    """Whoami for the linked CRM tenant — {id, name}."""
    return _get("/api/service/company", company_id)


def list_realestate_projects(company_id: int, search: str | None = None) -> list[dict]:
    """The company's real-estate (bedek) projects."""
    return _get("/api/service/realestate-projects", company_id, search=search)


def list_customers(company_id: int, search: str | None = None) -> list[dict]:
    """The company's customers."""
    return _get("/api/service/customers", company_id, search=search)


def create_customer(company_id: int, payload: dict) -> dict:
    """Create a customer in the CRM tenant. Requires the CRM to expose
    POST /api/service/customers (service-key, company-scoped)."""
    return _request("/api/service/customers", {"company_id": company_id}, method="POST", body=payload)


def update_customer(company_id: int, membership_id: int, payload: dict) -> dict:
    """Update a customer in the CRM tenant. Requires the CRM to expose
    PUT /api/service/customers/{membership_id} (service-key, company-scoped)."""
    return _request(
        f"/api/service/customers/{membership_id}",
        {"company_id": company_id},
        method="PUT",
        body=payload,
    )

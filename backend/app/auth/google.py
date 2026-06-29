"""Verify a Google Sign-In ID token — dependency-free (stdlib urllib only).

The frontend uses Google Identity Services to obtain an ID token (a JWT signed by
Google). Rather than verifying the RS256 signature locally (which would require
the native `cryptography` package — awkward on an arm64 Lambda built on an x86_64
runner), we hand the token to Google's official `tokeninfo` endpoint, which
validates the signature and expiry and returns the claims. We then enforce the
audience and issuer ourselves. No client secret is involved.
"""
import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from ..config import settings

logger = logging.getLogger(__name__)

_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
_ISSUERS = {"https://accounts.google.com", "accounts.google.com"}


class GoogleAuthError(Exception):
    """Token verification failed (with a user-facing Hebrew message)."""


def verify_google_token(credential: str) -> dict:
    """Validate a Google ID token and return its claims, or raise GoogleAuthError."""
    client_id = (settings.google_client_id or "").strip()
    if not client_id:
        raise GoogleAuthError("התחברות Google אינה מוגדרת")

    url = f"{_TOKENINFO_URL}?{urllib.parse.urlencode({'id_token': credential})}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            claims = json.loads(resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        # 400 = invalid/expired token. Anything else is still an auth failure.
        logger.warning("Google tokeninfo HTTP %s", getattr(e, "code", "?"))
        raise GoogleAuthError("אימות Google נכשל") from e
    except Exception as e:  # noqa: BLE001 — network/parse failure → auth failure
        logger.warning("Google tokeninfo error: %s", e)
        raise GoogleAuthError("אימות Google נכשל") from e

    # tokeninfo already checked the signature + expiry. We MUST still verify the
    # audience ourselves — otherwise a Google token minted for ANY app would pass.
    if claims.get("aud") != client_id:
        logger.warning("Google aud mismatch: got %r", claims.get("aud"))
        raise GoogleAuthError("אימות Google נכשל")
    if claims.get("iss") not in _ISSUERS:
        raise GoogleAuthError("אימות Google נכשל")

    email = claims.get("email")
    # tokeninfo returns email_verified as the string "true"/"false".
    verified = str(claims.get("email_verified", "")).lower() == "true"
    if not email or not verified:
        raise GoogleAuthError("חשבון Google ללא אימייל מאומת")
    return claims

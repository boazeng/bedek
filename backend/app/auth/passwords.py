"""Password hashing + verification for email/password login.

Uses PBKDF2-HMAC-SHA256 from the standard library — zero third-party deps, so the
Lambda package stays pure-Python (no native wheels, no Docker build). PBKDF2 with
a high iteration count is an OWASP-recommended password hash.

Stored format:  pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
"""
import hashlib
import hmac
import secrets

_ALGORITHM = "pbkdf2_sha256"
_ITERATIONS = 600_000  # OWASP 2023 guidance for PBKDF2-HMAC-SHA256
_SALT_BYTES = 16


def hash_password(plain: str) -> str:
    salt = secrets.token_bytes(_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, _ITERATIONS)
    return f"{_ALGORITHM}${_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(plain: str, stored: str | None) -> bool:
    """Constant-time check. False (never raises) when the user has no password set
    or the stored value is malformed."""
    if not stored:
        return False
    try:
        algorithm, iterations, salt_hex, hash_hex = stored.split("$")
        if algorithm != _ALGORITHM:
            return False
        expected = bytes.fromhex(hash_hex)
        candidate = hashlib.pbkdf2_hmac(
            "sha256", plain.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
    except (ValueError, AttributeError):
        return False
    return hmac.compare_digest(candidate, expected)

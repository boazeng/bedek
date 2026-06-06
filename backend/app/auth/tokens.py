"""JWT helpers. One token shape, used by both dev-login and (later) Google OAuth."""
from datetime import datetime, timedelta, timezone

import jwt

from ..config import settings


def issue_token(user_id: int) -> str:
    """Issue a JWT containing the user_id as `sub`."""
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.jwt_ttl_hours)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> int:
    """Return the user_id from a valid token, else raise jwt.PyJWTError."""
    payload = jwt.decode(
        token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
    )
    return int(payload["sub"])

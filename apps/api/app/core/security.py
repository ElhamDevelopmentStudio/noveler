from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from app.core.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    """Generate a signed JWT access token."""
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        "sub": str(subject),
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_password_reset_token(email: str) -> str:
    """Generate a signed password reset JWT token."""
    expire = datetime.now(UTC) + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": email,
        "exp": expire,
        "type": "reset",
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def verify_password_reset_token(token: str) -> str | None:
    """Verify a password reset token and return the user's email if valid."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "reset":
            return None
        return payload.get("sub")
    except jwt.PyJWTError:
        return None

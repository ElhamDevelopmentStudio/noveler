"""Base application exception classes."""

from typing import Any


class AppError(Exception):
    """Base application error."""

    def __init__(self, message: str, code: str = "INTERNAL_ERROR", details: Any = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details


class NotFoundError(AppError):
    """Resource not found error."""

    def __init__(self, message: str = "Resource not found", details: Any = None):
        super().__init__(message=message, code="NOT_FOUND", details=details)


class ValidationError(AppError):
    """Validation failed error."""

    def __init__(self, message: str = "Validation failed", details: Any = None):
        super().__init__(message=message, code="VALIDATION_ERROR", details=details)


class ConflictError(AppError):
    """Resource conflict error."""

    def __init__(self, message: str = "Resource already exists", details: Any = None):
        super().__init__(message=message, code="CONFLICT", details=details)

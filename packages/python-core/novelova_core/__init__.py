"""novelova-core: Shared library for Novelova services."""

from novelova_core.exceptions import (
    AppError,
    AuthenticationError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from novelova_core.linguistics import (
    COMMON_FEMALE_FIRST_NAMES,
    COMMON_FEMALE_TITLES,
    DISCOURSE_AND_GRAMMAR_STOPWORDS,
    DISCOURSE_IDIOMS,
    GENERIC_TITLES_OF_ADDRESS,
    infer_name_gender,
    is_invalid_character_name,
)
from novelova_core.logging import setup_logger
from novelova_core.models import ApiResponse, BaseSchema, DateTimeMixin

__all__ = [
    "AppError",
    "AuthenticationError",
    "ConflictError",
    "ForbiddenError",
    "NotFoundError",
    "ValidationError",
    "setup_logger",
    "BaseSchema",
    "DateTimeMixin",
    "ApiResponse",
    "COMMON_FEMALE_FIRST_NAMES",
    "COMMON_FEMALE_TITLES",
    "DISCOURSE_AND_GRAMMAR_STOPWORDS",
    "DISCOURSE_IDIOMS",
    "GENERIC_TITLES_OF_ADDRESS",
    "infer_name_gender",
    "is_invalid_character_name",
]

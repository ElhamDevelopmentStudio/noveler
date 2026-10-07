"""General utility helpers."""

import re
import unicodedata


def slugify(text: str) -> str:
    """Generate a clean URL slug from string."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("utf-8")
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"[-\s]+", "-", text)

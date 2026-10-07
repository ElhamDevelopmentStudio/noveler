from typing import Literal

from novelova_core.models import BaseSchema, DateTimeMixin


class ItemBase(BaseSchema):
    title: str
    description: str | None = None
    status: Literal["draft", "published", "archived"] = "draft"


class ItemCreate(ItemBase):
    pass


class ItemUpdate(BaseSchema):
    title: str | None = None
    description: str | None = None
    status: Literal["draft", "published", "archived"] | None = None


class ItemResponse(ItemBase, DateTimeMixin):
    id: str


class PaginationMeta(BaseSchema):
    page: int
    pageSize: int
    totalItems: int
    totalPages: int


class PaginatedItemsResponse(BaseSchema):
    items: list[ItemResponse]
    meta: PaginationMeta

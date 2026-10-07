import uuid

from app.schemas.item import (
    ItemCreate,
    ItemResponse,
    ItemUpdate,
    PaginatedItemsResponse,
    PaginationMeta,
)
from fastapi import APIRouter, HTTPException, Query, status
from novelova_core.models import ApiResponse, utc_now

router = APIRouter()

# In-memory mock store for demonstration
ITEMS_DB: dict[str, dict] = {
    "1": {
        "id": "1",
        "title": "Welcome to Novelova",
        "description": "Polyglot monorepo template with React and FastAPI.",
        "status": "published",
        "created_at": utc_now(),
        "updated_at": utc_now(),
    },
    "2": {
        "id": "2",
        "title": "Shared Workspace Packages",
        "description": "Shared TypeScript and Python libraries integrated across apps.",
        "status": "published",
        "created_at": utc_now(),
        "updated_at": utc_now(),
    },
}


@router.get("", response_model=ApiResponse[PaginatedItemsResponse])
def list_items(
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=10, ge=1, le=100),
    status: str | None = None,
):
    """List items with pagination and status filtering."""
    items_list = list(ITEMS_DB.values())
    if status:
        items_list = [item for item in items_list if item["status"] == status]

    total_items = len(items_list)
    start = (page - 1) * pageSize
    end = start + pageSize
    paginated_items = [ItemResponse(**item) for item in items_list[start:end]]
    total_pages = (total_items + pageSize - 1) // pageSize if total_items > 0 else 1

    return ApiResponse(
        data=PaginatedItemsResponse(
            items=paginated_items,
            meta=PaginationMeta(
                page=page,
                pageSize=pageSize,
                totalItems=total_items,
                totalPages=total_pages,
            ),
        ),
        message="Items retrieved successfully",
    )


@router.post("", response_model=ApiResponse[ItemResponse], status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemCreate):
    """Create a new item."""
    new_id = str(uuid.uuid4())[:8]
    now = utc_now()
    new_item = {
        "id": new_id,
        "title": payload.title,
        "description": payload.description,
        "status": payload.status,
        "created_at": now,
        "updated_at": now,
    }
    ITEMS_DB[new_id] = new_item
    return ApiResponse(
        data=ItemResponse(**new_item),
        message="Item created successfully",
    )


@router.get("/{item_id}", response_model=ApiResponse[ItemResponse])
def get_item(item_id: str):
    """Retrieve a single item by ID."""
    if item_id not in ITEMS_DB:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with ID '{item_id}' not found",
        )
    return ApiResponse(
        data=ItemResponse(**ITEMS_DB[item_id]),
        message="Item retrieved successfully",
    )


@router.put("/{item_id}", response_model=ApiResponse[ItemResponse])
def update_item(item_id: str, payload: ItemUpdate):
    """Update an existing item."""
    if item_id not in ITEMS_DB:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with ID '{item_id}' not found",
        )

    current = ITEMS_DB[item_id]
    update_data = payload.model_dump(exclude_unset=True)
    current.update(update_data)
    current["updated_at"] = utc_now()
    ITEMS_DB[item_id] = current

    return ApiResponse(
        data=ItemResponse(**current),
        message="Item updated successfully",
    )


@router.delete("/{item_id}", response_model=ApiResponse[dict])
def delete_item(item_id: str):
    """Delete an item by ID."""
    if item_id not in ITEMS_DB:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with ID '{item_id}' not found",
        )
    del ITEMS_DB[item_id]
    return ApiResponse(
        data={"id": item_id, "deleted": True},
        message="Item deleted successfully",
    )

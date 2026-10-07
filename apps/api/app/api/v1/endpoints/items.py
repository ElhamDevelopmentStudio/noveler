import uuid

from app.db.session import get_db
from app.models.item import ItemModel
from app.schemas.item import (
    ItemCreate,
    ItemResponse,
    ItemUpdate,
    PaginatedItemsResponse,
    PaginationMeta,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from novelova_core.models import ApiResponse, utc_now
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("", response_model=ApiResponse[PaginatedItemsResponse])
async def list_items(
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=10, ge=1, le=100),
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List items from database with pagination and status filtering."""
    base_query = select(ItemModel)
    count_query = select(func.count(ItemModel.id))

    if status:
        base_query = base_query.where(ItemModel.status == status)
        count_query = count_query.where(ItemModel.status == status)

    total_result = await db.execute(count_query)
    total_items = total_result.scalar_one()

    offset = (page - 1) * pageSize
    items_query = base_query.order_by(ItemModel.created_at.desc()).offset(offset).limit(pageSize)
    items_result = await db.execute(items_query)
    db_items = items_result.scalars().all()

    items = [
        ItemResponse(
            id=item.id,
            title=item.title,
            description=item.description,
            status=item.status,  # type: ignore
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in db_items
    ]
    total_pages = (total_items + pageSize - 1) // pageSize if total_items > 0 else 1

    return ApiResponse(
        data=PaginatedItemsResponse(
            items=items,
            meta=PaginationMeta(
                page=page,
                pageSize=pageSize,
                totalItems=total_items,
                totalPages=total_pages,
            ),
        ),
        message="Items retrieved successfully from database",
    )


@router.post("", response_model=ApiResponse[ItemResponse], status_code=status.HTTP_201_CREATED)
async def create_item(payload: ItemCreate, db: AsyncSession = Depends(get_db)):
    """Create a new item in database."""
    item_id = str(uuid.uuid4())[:8]
    now = utc_now()
    db_item = ItemModel(
        id=item_id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        created_at=now,
        updated_at=now,
    )
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)

    return ApiResponse(
        data=ItemResponse(
            id=db_item.id,
            title=db_item.title,
            description=db_item.description,
            status=db_item.status,  # type: ignore
            created_at=db_item.created_at,
            updated_at=db_item.updated_at,
        ),
        message="Item created successfully",
    )


@router.get("/{item_id}", response_model=ApiResponse[ItemResponse])
async def get_item(item_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve a single item from database by ID."""
    db_item = await db.get(ItemModel, item_id)
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with ID '{item_id}' not found",
        )
    return ApiResponse(
        data=ItemResponse(
            id=db_item.id,
            title=db_item.title,
            description=db_item.description,
            status=db_item.status,  # type: ignore
            created_at=db_item.created_at,
            updated_at=db_item.updated_at,
        ),
        message="Item retrieved successfully",
    )


@router.put("/{item_id}", response_model=ApiResponse[ItemResponse])
async def update_item(item_id: str, payload: ItemUpdate, db: AsyncSession = Depends(get_db)):
    """Update an existing item in database."""
    db_item = await db.get(ItemModel, item_id)
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with ID '{item_id}' not found",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_item, key, value)
    db_item.updated_at = utc_now()

    await db.commit()
    await db.refresh(db_item)

    return ApiResponse(
        data=ItemResponse(
            id=db_item.id,
            title=db_item.title,
            description=db_item.description,
            status=db_item.status,  # type: ignore
            created_at=db_item.created_at,
            updated_at=db_item.updated_at,
        ),
        message="Item updated successfully",
    )


@router.delete("/{item_id}", response_model=ApiResponse[dict])
async def delete_item(item_id: str, db: AsyncSession = Depends(get_db)):
    """Delete an item from database by ID."""
    db_item = await db.get(ItemModel, item_id)
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with ID '{item_id}' not found",
        )
    await db.delete(db_item)
    await db.commit()
    return ApiResponse(
        data={"id": item_id, "deleted": True},
        message="Item deleted successfully",
    )

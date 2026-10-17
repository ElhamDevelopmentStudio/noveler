from app.api.deps import get_current_user
from app.core.security import decrypt_secret
from app.db.session import get_db
from app.models.kaggle_account import KaggleAccountModel
from app.models.user import UserModel
from app.schemas.kaggle import (
    KaggleAccountCreate,
    KaggleAccountResponse,
    KaggleAccountTestResponse,
    KaggleAccountUpdate,
    KaggleDatasetStatusResponse,
    KaggleDirectTestRequest,
    KagglePoolSummaryResponse,
)
from app.services.kaggle_account import (
    KaggleAccountService,
    mask_kaggle_key,
    verify_kaggle_credentials,
)
from fastapi import APIRouter, Depends
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


def account_to_response(account: KaggleAccountModel) -> KaggleAccountResponse:
    raw_key = decrypt_secret(account.encrypted_key)
    return KaggleAccountResponse(
        id=account.id,
        username=account.username,
        key_masked=mask_kaggle_key(raw_key),
        priority=account.priority,
        is_active=account.is_active,
        status=account.status,
        dataset_status=getattr(account, "dataset_status", "uninitialized") or "uninitialized",
        dataset_ref=getattr(account, "dataset_ref", None),
        last_used_at=account.last_used_at,
        exhausted_at=account.exhausted_at,
        estimated_reset_at=account.estimated_reset_at,
        total_hours_used=account.total_hours_used,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


@router.get("/accounts", response_model=ApiResponse[list[KaggleAccountResponse]])
async def list_kaggle_accounts(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all configured Kaggle accounts for current user."""
    accounts = await KaggleAccountService.list_accounts(db, current_user.id)
    return ApiResponse(
        data=[account_to_response(acc) for acc in accounts],
        message="Kaggle accounts retrieved successfully",
    )


@router.get("/summary", response_model=ApiResponse[KagglePoolSummaryResponse])
async def get_kaggle_pool_summary(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get high-level pool capacity and active quota metrics."""
    summary = await KaggleAccountService.get_summary(db, current_user.id)
    return ApiResponse(
        data=KagglePoolSummaryResponse(**summary),
        message="Kaggle pool summary retrieved successfully",
    )


@router.post("/accounts", response_model=ApiResponse[KaggleAccountResponse])
async def create_kaggle_account(
    payload: KaggleAccountCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add and verify a new Kaggle account to the failover pool."""
    account = await KaggleAccountService.create_account(
        db=db,
        user_id=current_user.id,
        username=payload.username,
        key=payload.key,
        priority=payload.priority,
        is_active=payload.is_active,
        verify_first=payload.verify_first,
    )
    return ApiResponse(
        data=account_to_response(account),
        message=f"Kaggle account '@{account.username}' added successfully",
    )


@router.put("/accounts/{account_id}", response_model=ApiResponse[KaggleAccountResponse])
async def update_kaggle_account(
    account_id: str,
    payload: KaggleAccountUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update priority, active toggle, or credentials for an existing account."""
    account = await KaggleAccountService.update_account(
        db=db,
        user_id=current_user.id,
        account_id=account_id,
        username=payload.username,
        key=payload.key,
        priority=payload.priority,
        is_active=payload.is_active,
        status=payload.status,
        total_hours_used=payload.total_hours_used,
        verify_first=payload.verify_first,
    )
    return ApiResponse(
        data=account_to_response(account),
        message=f"Kaggle account '@{account.username}' updated successfully",
    )


@router.delete("/accounts/{account_id}", response_model=ApiResponse[dict])
async def delete_kaggle_account(
    account_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a Kaggle account from the user's pool."""
    await KaggleAccountService.delete_account(db, current_user.id, account_id)
    return ApiResponse(
        data={"deleted_id": account_id},
        message="Kaggle account deleted successfully",
    )


@router.post("/accounts/{account_id}/test", response_model=ApiResponse[KaggleAccountTestResponse])
async def test_saved_kaggle_account(
    account_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Test connection and quota access for a saved account."""
    result = await KaggleAccountService.test_account(db, current_user.id, account_id)
    return ApiResponse(
        data=KaggleAccountTestResponse(**result),
        message="Kaggle account tested successfully",
    )


@router.post("/test-credentials", response_model=ApiResponse[KaggleAccountTestResponse])
async def test_direct_kaggle_credentials(
    payload: KaggleDirectTestRequest,
    current_user: UserModel = Depends(get_current_user),
):
    """Test credentials on-the-fly before saving."""
    result = await verify_kaggle_credentials(payload.username, payload.key)
    return ApiResponse(
        data=KaggleAccountTestResponse(**result),
        message="Credentials verified successfully",
    )


@router.post(
    "/accounts/{account_id}/check-dataset",
    response_model=ApiResponse[KaggleDatasetStatusResponse],
)
async def check_kaggle_dataset(
    account_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check whether the pre-mounted models dataset exists on this Kaggle account."""
    result = await KaggleAccountService.check_dataset_status(db, current_user.id, account_id)
    return ApiResponse(
        data=KaggleDatasetStatusResponse(**result),
        message=result["message"],
    )


@router.post(
    "/accounts/{account_id}/initialize-dataset",
    response_model=ApiResponse[KaggleDatasetStatusResponse],
)
async def initialize_kaggle_dataset(
    account_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Initialize or register pre-mounted models dataset on Kaggle account for instant boot."""
    result = await KaggleAccountService.initialize_dataset(db, current_user.id, account_id)
    return ApiResponse(
        data=KaggleDatasetStatusResponse(**result),
        message=result["message"],
    )

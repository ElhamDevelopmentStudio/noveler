from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.attachment import AttachmentResponse
from app.services.attachment import AttachmentService
from fastapi import APIRouter, Depends, File, UploadFile
from novelova_core.exceptions import NotFoundError
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.post("/upload", response_model=ApiResponse[AttachmentResponse])
async def upload_attachment(
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file or image to Cloudflare R2 storage, creating an unclaimed attachment record."""
    attachment, presigned_url = await AttachmentService.upload_file(file, db)
    return ApiResponse(
        data=AttachmentResponse(
            id=attachment.id,
            filename=attachment.filename,
            content_type=attachment.content_type,
            size=attachment.size,
            claimed_at=attachment.claimed_at,
            url=presigned_url,
            created_at=attachment.created_at,
        ),
        message="Attachment uploaded successfully",
    )


@router.get("/{attachment_id}", response_model=ApiResponse[AttachmentResponse])
async def get_attachment(
    attachment_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve attachment metadata along with a fresh presigned access URL."""
    attachment = await AttachmentService.get_attachment_by_id(attachment_id, db)
    if not attachment:
        raise NotFoundError(f"Attachment '{attachment_id}' not found")

    presigned_url = AttachmentService.get_presigned_url(attachment)
    return ApiResponse(
        data=AttachmentResponse(
            id=attachment.id,
            filename=attachment.filename,
            content_type=attachment.content_type,
            size=attachment.size,
            claimed_at=attachment.claimed_at,
            url=presigned_url,
            created_at=attachment.created_at,
        ),
        message="Attachment retrieved",
    )

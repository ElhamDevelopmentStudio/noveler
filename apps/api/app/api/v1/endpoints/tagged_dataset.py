from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserModel
from app.schemas.tagged_dataset import (
    ExportTaggedDatasetRequest,
    TaggedProjectSummaryResponse,
)
from app.services.tagged_dataset_exporter import TaggedDatasetExporterService
from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from novelova_core.models import ApiResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get(
    "/summary",
    response_model=ApiResponse[list[TaggedProjectSummaryResponse]],
    summary="Get summary of all projects with tagged chapters for dataset export",
)
async def get_tagged_dataset_summary(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns a list of all projects containing tagged chapters, with counts
    of tagged chapters, total segments, dialogue turns, and total words.
    """
    summaries = await TaggedDatasetExporterService.get_summary(db=db, user_id=None)
    return ApiResponse(
        success=True,
        data=summaries,
        message="Tagged projects dataset summary retrieved successfully",
    )


@router.post(
    "/download",
    summary="Export tagged chapters across selected projects as a fine-tuning dataset (.zip)",
)
async def download_tagged_dataset(
    payload: ExportTaggedDatasetRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Streams a complete, fine-tuning optimized ZIP dataset of all tagged chapters
    for the selected novels in JSON or TXT format.
    """
    zip_buf, archive_name = await TaggedDatasetExporterService.export_tagged_dataset(
        db=db,
        project_ids=payload.project_ids if payload.project_ids else None,
        export_format=payload.format,
        user_id=None,
    )

    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{archive_name}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )

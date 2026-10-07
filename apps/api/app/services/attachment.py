import re
import uuid
from datetime import UTC, datetime
from typing import Any

import boto3
import botocore.config
from app.core.config import settings
from app.models.attachment import AttachmentModel
from fastapi import UploadFile
from novelova_core.exceptions import NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.attachment")

_s3_client: Any = None


def get_s3_client():
    """Retrieve or initialize the S3/R2 boto3 client."""
    global _s3_client
    if _s3_client is None and settings.is_r2_configured:
        logger.info(
            "Initializing S3/R2 client for bucket: %s on endpoint: %s",
            settings.R2_BUCKET,
            settings.r2_effective_endpoint,
        )
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.r2_effective_endpoint,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name=settings.R2_REGION or "auto",
            config=botocore.config.Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            ),
        )
    return _s3_client


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal or invalid characters."""
    clean = re.sub(r"[^a-zA-Z0-9_.-]", "_", filename)
    return clean or "unnamed_file"


class AttachmentService:
    @staticmethod
    async def upload_file(
        file: UploadFile,
        db: AsyncSession,
    ) -> tuple[AttachmentModel, str]:
        """Upload a file to R2 storage and create an unclaimed Attachment record."""
        if not file.filename:
            raise ValidationError("File must have a valid filename")

        content = await file.read()
        if len(content) == 0:
            raise ValidationError("Uploaded file cannot be empty")

        attachment_id = str(uuid.uuid4())
        safe_filename = sanitize_filename(file.filename)
        object_key = f"attachments/{attachment_id}/{safe_filename}"
        content_type = file.content_type or "application/octet-stream"

        # Upload to R2 if configured
        s3 = get_s3_client()
        if s3:
            try:
                s3.put_object(
                    Bucket=settings.R2_BUCKET,
                    Key=object_key,
                    Body=content,
                    ContentType=content_type,
                )
                logger.info(
                    "Uploaded object to R2: %s (%d bytes)",
                    object_key,
                    len(content),
                )
            except Exception as exc:
                logger.error("R2 upload failed for key %s: %s", object_key, exc)
                raise ValidationError(f"Failed to upload file to storage: {exc}")
        else:
            logger.warning(
                "R2 credentials not fully configured; recording attachment metadata in offline mode."
            )

        attachment = AttachmentModel(
            id=attachment_id,
            key=object_key,
            filename=file.filename,
            content_type=content_type,
            size=len(content),
            claimed_at=None,
        )
        db.add(attachment)
        await db.flush()

        presigned_url = AttachmentService.get_presigned_url(attachment)
        return attachment, presigned_url

    @staticmethod
    def get_presigned_url(
        attachment: AttachmentModel,
        expires_in: int = 3600,
    ) -> str:
        """Generate a presigned GET URL for an attachment."""
        s3 = get_s3_client()
        if s3:
            try:
                url = s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": settings.R2_BUCKET, "Key": attachment.key},
                    ExpiresIn=expires_in,
                )
                return url
            except Exception as exc:
                logger.warning("Could not generate presigned URL for %s: %s", attachment.key, exc)

        # Fallback offline URL
        return f"https://{settings.R2_BUCKET}.r2.cloudflarestorage.com/{attachment.key}"

    @staticmethod
    async def get_attachment_by_id(
        attachment_id: str,
        db: AsyncSession,
    ) -> AttachmentModel | None:
        """Fetch attachment by its ID."""
        result = await db.execute(
            select(AttachmentModel).where(AttachmentModel.id == attachment_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def claim_attachment(
        attachment_id: str,
        db: AsyncSession,
    ) -> AttachmentModel:
        """Claim an attachment, setting claimed_at to current UTC timestamp."""
        attachment = await AttachmentService.get_attachment_by_id(attachment_id, db)
        if not attachment:
            raise NotFoundError(f"Attachment '{attachment_id}' not found")

        if attachment.claimed_at is None:
            attachment.claimed_at = datetime.now(UTC)
            attachment.updated_at = datetime.now(UTC)
            await db.flush()
            logger.info("Claimed attachment: %s", attachment_id)

        return attachment

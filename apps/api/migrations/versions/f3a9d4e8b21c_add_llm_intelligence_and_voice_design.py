"""add_llm_intelligence_and_voice_design

Revision ID: f3a9d4e8b21c
Revises: c7519a3ab899
Create Date: 2026-11-22 15:28:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3a9d4e8b21c"
down_revision: Union[str, Sequence[str], None] = "c7519a3ab899"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema with character dossiers, voice descriptions, chapter packaging, and voice design jobs."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_tables = set(insp.get_table_names())

    def _has_col(table: str, col: str) -> bool:
        return table in existing_tables and any(c["name"] == col for c in insp.get_columns(table))

    if not _has_col("characters", "dossier"):
        op.add_column("characters", sa.Column("dossier", sa.JSON(), nullable=True))
    if not _has_col("voices", "description"):
        op.add_column("voices", sa.Column("description", sa.Text(), nullable=True))
    if not _has_col("chapters", "packaging_metadata"):
        op.add_column("chapters", sa.Column("packaging_metadata", sa.JSON(), nullable=True))

    if "voice_design_jobs" not in existing_tables:
        op.create_table(
            "voice_design_jobs",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("project_id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("kaggle_account_id", sa.String(length=36), nullable=True),
            sa.Column("status", sa.String(length=30), nullable=False),
            sa.Column("auto_assign", sa.Boolean(), nullable=False),
            sa.Column("is_global", sa.Boolean(), nullable=False),
            sa.Column("cache_to_dataset", sa.Boolean(), nullable=False),
            sa.Column("total_characters", sa.Integer(), nullable=False),
            sa.Column("completed_characters", sa.Integer(), nullable=False),
            sa.Column("progress_percentage", sa.Integer(), nullable=False),
            sa.Column("current_step", sa.String(length=500), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("target_character_ids", sa.JSON(), nullable=False),
            sa.Column("character_configs", sa.JSON(), nullable=False),
            sa.Column("results", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_voice_design_jobs_project_id"), "voice_design_jobs", ["project_id"], unique=False)
        op.create_index(op.f("ix_voice_design_jobs_status"), "voice_design_jobs", ["status"], unique=False)
        op.create_index(op.f("ix_voice_design_jobs_user_id"), "voice_design_jobs", ["user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_voice_design_jobs_user_id"), table_name="voice_design_jobs")
    op.drop_index(op.f("ix_voice_design_jobs_status"), table_name="voice_design_jobs")
    op.drop_index(op.f("ix_voice_design_jobs_project_id"), table_name="voice_design_jobs")
    op.drop_table("voice_design_jobs")

    op.drop_column("chapters", "packaging_metadata")
    op.drop_column("voices", "description")
    op.drop_column("characters", "dossier")

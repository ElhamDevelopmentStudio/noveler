"""add_sfx_cue_jobs_table

Revision ID: c4e7a9f2d8b1
Revises: a8d2f9e1c4b7
Create Date: 2026-11-28 14:16:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4e7a9f2d8b1"
down_revision: Union[str, Sequence[str], None] = "a8d2f9e1c4b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create sfx_cue_jobs table for async script SFX/atmosphere scanning."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_tables = set(insp.get_table_names())

    if "sfx_cue_jobs" not in existing_tables:
        op.create_table(
            "sfx_cue_jobs",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("project_id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False),
            sa.Column("chapter_ids", sa.JSON(), nullable=False),
            sa.Column("include_foley", sa.Boolean(), nullable=False),
            sa.Column("include_atmosphere", sa.Boolean(), nullable=False),
            sa.Column("propose_missing_assets", sa.Boolean(), nullable=False),
            sa.Column("total_chapters", sa.Integer(), nullable=False),
            sa.Column("processed_chapters", sa.Integer(), nullable=False),
            sa.Column("total_chunks", sa.Integer(), nullable=False),
            sa.Column("processed_chunks", sa.Integer(), nullable=False),
            sa.Column("progress_percentage", sa.Integer(), nullable=False),
            sa.Column("current_step", sa.String(length=500), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("result_plan", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_sfx_cue_jobs_project_id"), "sfx_cue_jobs", ["project_id"], unique=False)
        op.create_index(op.f("ix_sfx_cue_jobs_status"), "sfx_cue_jobs", ["status"], unique=False)
        op.create_index(op.f("ix_sfx_cue_jobs_user_id"), "sfx_cue_jobs", ["user_id"], unique=False)


def downgrade() -> None:
    """Drop sfx_cue_jobs table."""
    op.drop_index(op.f("ix_sfx_cue_jobs_user_id"), table_name="sfx_cue_jobs")
    op.drop_index(op.f("ix_sfx_cue_jobs_status"), table_name="sfx_cue_jobs")
    op.drop_index(op.f("ix_sfx_cue_jobs_project_id"), table_name="sfx_cue_jobs")
    op.drop_table("sfx_cue_jobs")

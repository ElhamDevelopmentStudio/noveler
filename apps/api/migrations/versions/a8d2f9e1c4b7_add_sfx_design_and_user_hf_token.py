"""add_sfx_design_and_user_hf_token

Revision ID: a8d2f9e1c4b7
Revises: f3a9d4e8b21c
Create Date: 2026-11-28 10:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a8d2f9e1c4b7"
down_revision: Union[str, Sequence[str], None] = "f3a9d4e8b21c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add per-user encrypted HF token and sfx_design_jobs table."""
    op.add_column("users", sa.Column("hf_token_encrypted", sa.String(length=512), nullable=True))

    op.create_table(
        "sfx_design_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("kaggle_account_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("auto_apply_cues", sa.Boolean(), nullable=False),
        sa.Column("is_global", sa.Boolean(), nullable=False),
        sa.Column("cache_to_dataset", sa.Boolean(), nullable=False),
        sa.Column("total_items", sa.Integer(), nullable=False),
        sa.Column("completed_items", sa.Integer(), nullable=False),
        sa.Column("progress_percentage", sa.Integer(), nullable=False),
        sa.Column("current_step", sa.String(length=500), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("item_configs", sa.JSON(), nullable=False),
        sa.Column("pending_cues", sa.JSON(), nullable=False),
        sa.Column("pending_atmosphere_spans", sa.JSON(), nullable=False),
        sa.Column("results", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_sfx_design_jobs_project_id"), "sfx_design_jobs", ["project_id"], unique=False)
    op.create_index(op.f("ix_sfx_design_jobs_status"), "sfx_design_jobs", ["status"], unique=False)
    op.create_index(op.f("ix_sfx_design_jobs_user_id"), "sfx_design_jobs", ["user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_sfx_design_jobs_user_id"), table_name="sfx_design_jobs")
    op.drop_index(op.f("ix_sfx_design_jobs_status"), table_name="sfx_design_jobs")
    op.drop_index(op.f("ix_sfx_design_jobs_project_id"), table_name="sfx_design_jobs")
    op.drop_table("sfx_design_jobs")

    op.drop_column("users", "hf_token_encrypted")

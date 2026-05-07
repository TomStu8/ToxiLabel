"""add transcript and transcript_correction columns

Revision ID: e4f9a3c8b1d2
Revises: 92090468b7b9
Create Date: 2026-04-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e4f9a3c8b1d2'
down_revision: Union[str, None] = '92090468b7b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('transcript', sa.Text(), nullable=True))
    op.add_column('annotations', sa.Column('transcript_correction', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('annotations', 'transcript_correction')
    op.drop_column('tasks', 'transcript')

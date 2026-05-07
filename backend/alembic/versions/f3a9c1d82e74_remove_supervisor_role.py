"""remove supervisor role

Revision ID: f3a9c1d82e74
Revises: e4f9a3c8b1d2
Create Date: 2026-04-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'f3a9c1d82e74'
down_revision: Union[str, None] = 'e4f9a3c8b1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Reassign any supervisor users to annotator before removing the value
    op.execute("UPDATE users SET role = 'annotator' WHERE role = 'supervisor'")

    # PostgreSQL requires recreating the enum type to remove a value
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    op.execute("CREATE TYPE userrole AS ENUM ('admin', 'annotator')")
    op.execute(
        "ALTER TABLE users ALTER COLUMN role TYPE userrole "
        "USING role::text::userrole"
    )
    op.execute("DROP TYPE userrole_old")


def downgrade() -> None:
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    op.execute("CREATE TYPE userrole AS ENUM ('admin', 'annotator', 'supervisor')")
    op.execute(
        "ALTER TABLE users ALTER COLUMN role TYPE userrole "
        "USING role::text::userrole"
    )
    op.execute("DROP TYPE userrole_old")

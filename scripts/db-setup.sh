#!/usr/bin/env bash
# One-time local database setup: roles, dev + test databases, migrations.
# Needs a Postgres superuser URL (default matches docker-compose.yml).
set -euo pipefail
SUPER=${SUPERUSER_URL:-postgres://postgres:postgres@localhost:5432/postgres}
for db in shop_dev shop_test; do
  psql "$SUPER" -q -v owner_pw="'shop_owner_dev'" -v app_pw="'shop_app_dev'" -v db="$db" -f db/roles.sql
done
DATABASE_OWNER_URL=postgres://shop_owner:shop_owner_dev@localhost:5432/shop_dev node scripts/migrate.mjs
[ -f .env.local ] || cp .env.example .env.local
echo "Database ready. Next: npm run dev  (then open http://localhost:3000)"

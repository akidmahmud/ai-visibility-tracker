#!/usr/bin/env sh
# Daily database backup (handoff §2): pg_dump → gzip → R2 (S3 API). Keeps the last 7 local copies.
# Cron on the VPS host:  15 3 * * *  cd /opt/avt && ./infra/backup.sh >> /var/log/avt-backup.log 2>&1
# Needs: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET in .env, and the aws CLI on the host.
set -eu
cd "$(dirname "$0")/.."
. ./.env

stamp=$(date -u +%Y%m%dT%H%M%SZ)
dir=./backups
mkdir -p "$dir"
file="$dir/avt-$stamp.sql.gz"

docker compose -f infra/docker-compose.prod.yml exec -T postgres pg_dump -U avt --no-owner avt | gzip -9 > "$file"
[ -s "$file" ] || { echo "backup is empty, aborting"; exit 1; }

if [ -n "${R2_BUCKET:-}" ]; then
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    aws s3 cp "$file" "s3://$R2_BUCKET/backups/$(basename "$file")" \
    --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" --only-show-errors
fi

ls -1t "$dir"/avt-*.sql.gz | tail -n +8 | xargs -r rm --
echo "backup ok: $file"

#!/usr/bin/env bash
# Restore a quiescent loopback Compose fixture into a new project with independent volumes.
set -euo pipefail
umask 077
config=${1:?fixture env file}
project=${2:?fixture project}
output=${3:?new private directory}
[[ "$project" =~ ^medora-[a-z0-9-]+$ ]]
mkdir -m 700 "$output"
output=$(realpath "$output")
target="medora-restore-$(openssl rand -hex 8)"
source_compose=(docker compose --env-file "$config" -p "$project")
# A second application key set could not read the copied users. Only infrastructure credentials differ.
node scripts/verification/local-env.mjs "$output/restore.env" >/dev/null
python3 - "$config" "$output/restore.env" <<'PY'
import sys
from pathlib import Path
src,dest=map(Path,sys.argv[1:])
keys=("MEDORA_PASSWORD_KEYS=","MEDORA_CODE_KEY=","MEDORA_MAIL_KEY=")
keep=[row for row in dest.read_text().splitlines() if not row.startswith(keys)]
copy=[row for row in src.read_text().splitlines() if row.startswith(keys)]
if len(copy)!=3: raise SystemExit("Fixture application key registry is incomplete")
dest.write_text("\n".join(keep+copy)+"\n")
PY
restore_compose=(docker compose --env-file "$output/restore.env" -p "$target")
[[ -n "$("${source_compose[@]}" ps -q mailpit)" && -n "$("${source_compose[@]}" ps -q api)" ]]
src_volume=$(docker volume ls -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.volume=objects)
[[ -n "$src_volume" && "$src_volume" != *$'\n'* ]]
tool_image=$(docker inspect --format '{{.Image}}' "$("${source_compose[@]}" ps -q api)")
inventory() {
  local service=(docker compose --env-file "$1" -p "$2" exec -T postgres psql -XqAt -v ON_ERROR_STOP=1 -U medora -d medora)
  "${service[@]}" <<'SQL'
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format('SELECT %L,count(*),encode(sha256(convert_to(coalesce(string_agg(h,''''
ORDER BY h),''''),''UTF8'')),''hex'') FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex'') h FROM %I.%I t) rows',schemaname||'.'||tablename,schemaname,tablename)
FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename
\gexec
SELECT schemaname,sequencename,last_value FROM pg_sequences WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2;
COMMIT;
SQL
}
resume_source() { "${source_compose[@]}" unpause api >/dev/null; }
"${source_compose[@]}" pause api >/dev/null
trap resume_source EXIT
inventory "$config" "$project" > "$output/source.inventory"
"${source_compose[@]}" exec -T postgres pg_dump -Fc --no-owner -U medora medora > "$output/database.dump"
docker run --rm --network none --read-only --user 0:0 -v "$src_volume:/objects:ro" --entrypoint tar "$tool_image" --xattrs -C /objects -cf - . > "$output/objects.tar"
resume_source
trap - EXIT
(cd "$output" && sha256sum database.dump objects.tar > SHA256SUMS && sha256sum -c SHA256SUMS)
"${restore_compose[@]}" up -d --wait postgres storage
dst_volume=$(docker volume ls -q --filter "label=com.docker.compose.project=$target" --filter label=com.docker.compose.volume=objects)
[[ -n "$dst_volume" && "$src_volume" != "$dst_volume" && "$dst_volume" != *$'\n'* ]]
docker run --rm -i --network none --read-only --user 0:0 -v "$dst_volume:/objects" --entrypoint tar "$tool_image" --xattrs -C /objects -xf - < "$output/objects.tar"
"${restore_compose[@]}" exec -T postgres pg_restore --exit-on-error --single-transaction --no-owner --no-acl -U medora -d medora < "$output/database.dump"
inventory "$output/restore.env" "$target" > "$output/restored.inventory"
cmp "$output/source.inventory" "$output/restored.inventory"
# Read every ready object using the restored S3 service and the restored SQL catalog.
"${restore_compose[@]}" run -T --rm --build --no-deps api node --input-type=module - < scripts/verification/verify-objects.mjs
printf '%s\n' "$target" > "$output/project"
"${restore_compose[@]}" stop
echo "Restored database rows, sequence positions and signed S3 reads verified. Recovery volumes retained."

#!/usr/bin/env bash
# Резервная копия PostgreSQL Аэромарка.
#
#   prod/backup.sh prod        # обычный запуск (по cron и из deploy.sh)
#   prod/backup.sh staging
#
# Что делает:
#   1. pg_dump из контейнера postgres нужного окружения → gzip;
#   2. проверяет копию: архив читается, дамп дописан до конца;
#   3. если задан AGE_RECIPIENT — шифрует (age);
#   4. если задан BACKUP_RCLONE_REMOTE — копирует вне сервера (rclone);
#   5. удаляет копии старше BACKUP_KEEP_DAYS (по умолчанию 14).
#
# Копия только на этом же VPS не спасает от потери VPS — настройте
# BACKUP_RCLONE_REMOTE (например, Яндекс Object Storage или Яндекс Диск).
set -Eeuo pipefail
umask 077

# shellcheck source=prod/lib.sh
source "$(dirname "$(readlink -f "$0")")/lib.sh"
# Любая непредусмотренная ошибка — с номером строки, а не молчаливый выход.
trap 'log "ОШИБКА: команда в строке $LINENO завершилась с кодом $?" >&2' ERR
use_env "${1:-prod}"

BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
AGE_RECIPIENT="${AGE_RECIPIENT:-$(env_value AGE_RECIPIENT "$ENV_FILE")}"
BACKUP_RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-$(env_value BACKUP_RCLONE_REMOTE "$ENV_FILE")}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%F_%H%M%S)"
dump="$BACKUP_DIR/$PROJECT-$stamp.sql.gz"
tmp="$dump.part"
trap 'rm -f "$tmp"' EXIT

log "снимаю дамп базы → $dump"
# Переменные берутся внутри контейнера, пароль не попадает в командную строку хоста.
# shellcheck disable=SC2016  # переменные раскрывает shell внутри контейнера
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' \
  | gzip -9 > "$tmp"

gzip -t "$tmp" || die "архив повреждён"
# pg_dump пишет эту строку последней; без неё дамп оборвался на середине.
tail_lines="$(zcat "$tmp" | tail -n 5)"
grep -q 'PostgreSQL database dump complete' <<<"$tail_lines" \
  || die "дамп неполный — не хватает финальной строки pg_dump"
# Таблицы создают миграции при первом старте API, поэтому в любой рабочей
# базе они есть. Дамп без них — пустая или чужая база.
# grep -c читает весь поток (grep -q оборвал бы zcat и сработал бы pipefail).
tables="$(zcat "$tmp" | grep -c '^CREATE TABLE' || true)"
[ "${tables:-0}" -gt 0 ] || die "в дампе нет ни одной таблицы — база пустая?"
mv "$tmp" "$dump"
final="$dump"

if [ -n "$AGE_RECIPIENT" ]; then
  command -v age >/dev/null || die "задан AGE_RECIPIENT, но age не установлен (apt install age)"
  age -r "$AGE_RECIPIENT" -o "$dump.age" "$dump"
  rm -f "$dump"
  final="$dump.age"
  log "зашифровано: $final"
fi

if [ -n "$BACKUP_RCLONE_REMOTE" ]; then
  command -v rclone >/dev/null || die "задан BACKUP_RCLONE_REMOTE, но rclone не установлен"
  rclone copy "$final" "$BACKUP_RCLONE_REMOTE/$PROJECT/" || die "не удалось скопировать вне сервера"
  log "скопировано вне сервера: $BACKUP_RCLONE_REMOTE/$PROJECT/"
else
  log "ВНИМАНИЕ: копия лежит только на этом сервере (BACKUP_RCLONE_REMOTE не задан)"
fi

find "$BACKUP_DIR" -maxdepth 1 -type f -name "$PROJECT-*.sql.gz*" -mtime +"$BACKUP_KEEP_DAYS" -print -delete \
  | sed 's/^/удалена старая копия: /'

log "готово: $final ($(du -h "$final" | cut -f1))"
# Путь последней копии — для deploy.sh.
echo "$final" > "$BACKUP_DIR/$PROJECT.latest"

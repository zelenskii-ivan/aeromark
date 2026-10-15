#!/usr/bin/env bash
# Выкладка Аэромарка одной командой — с резервной копией, проверкой и откатом.
#
#   prod/deploy.sh staging            # выложить main на staging
#   prod/deploy.sh prod               # выложить main на прод
#   prod/deploy.sh prod 3155515       # выложить конкретный коммит
#   prod/deploy.sh prod main --dry-run   # только показать, что будет сделано
#   prod/deploy.sh prod --rollback    # вернуть предыдущий релиз
#
# Порядок: свежий код в $SRC_DIR → сборка образов с тегом = коммит →
# резервная копия базы → перезапуск api и web → проверка /health и главной →
# при неудаче автоматический откат на прошлые образы.
#
# Важно: откат возвращает образы, но не базу. Если в релизе есть новая
# миграция (server/sql), скрипт предупредит; вернуть базу можно из копии,
# путь к которой он печатает.
set -Eeuo pipefail

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
# shellcheck source=prod/lib.sh
source "$SCRIPT_DIR/lib.sh"
# Любая непредусмотренная ошибка — с номером строки, а не молчаливый выход.
trap 'log "ОШИБКА: команда в строке $LINENO завершилась с кодом $?" >&2' ERR

env_name="${1:-}"; shift || true
ref="main"; dry_run=0; rollback=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    --rollback) rollback=1 ;;
    -*) die "неизвестный флаг $arg" ;;
    *) ref="$arg" ;;
  esac
done
[ -n "$env_name" ] || die "укажите окружение: prod или staging"
use_env "$env_name"

# Две выкладки одновременно перезапишут друг другу теги.
exec 9>"/run/lock/aeromark-deploy-$PROJECT.lock"
flock -n 9 || die "уже идёт другая выкладка $PROJECT"

HISTORY="$AEROMARK_ROOT/$PROJECT.deploys.log"
PREV_FILE="$RELEASE_FILE.prev"

running_tag() {
  local id
  id="$(compose ps -q "$1" 2>/dev/null || true)"
  [ -n "$id" ] || return 0
  docker inspect -f '{{.Config.Image}}' "$id" | cut -d: -f2
}

wait_healthy() {
  local i
  for i in $(seq 1 45); do
    if curl -fsS --max-time 3 "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1 \
      && curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:$WEB_PORT/" 2>/dev/null; then
      log "проверка пройдена за ~$((i * 2)) с: api /health и главная отвечают"
      return 0
    fi
    sleep 2
  done
  return 1
}

restart_app() {
  # postgres трогаем, только если он не запущен (первый запуск staging).
  if [ -z "$(compose ps -q postgres 2>/dev/null || true)" ]; then
    log "postgres не запущен — поднимаю"
    compose up -d postgres
  fi
  compose up -d --no-deps api web
}

if [ "$rollback" = 1 ]; then
  [ -f "$PREV_FILE" ] || die "нет сохранённого прошлого релиза ($PREV_FILE)"
  log "откат на: $(tr '\n' ' ' < "$PREV_FILE")"
  cp "$RELEASE_FILE" "$RELEASE_FILE.rolled-back" 2>/dev/null || true
  cp "$PREV_FILE" "$RELEASE_FILE"
  restart_app
  wait_healthy || die "после отката сайт не отвечает — смотрите: docker compose -p $PROJECT logs api web"
  echo "$(date '+%F %T') rollback -> $(tr '\n' ' ' < "$RELEASE_FILE")" >> "$HISTORY"
  exit 0
fi

# --- 1. Код ---------------------------------------------------------------
if [ ! -d "$SRC_DIR/.git" ]; then
  log "клонирую репозиторий в $SRC_DIR"
  git clone "$REPO_URL" "$SRC_DIR"
fi
git -C "$SRC_DIR" fetch --quiet origin
if git -C "$SRC_DIR" rev-parse --verify --quiet "origin/$ref^{commit}" >/dev/null; then
  target="origin/$ref"
else
  target="$ref"
fi
sha="$(git -C "$SRC_DIR" rev-parse --short=12 "$target^{commit}")" || die "не найден коммит или ветка '$ref'"
subject="$(git -C "$SRC_DIR" log -1 --format=%s "$sha")"

prev_api="$(running_tag api)"; prev_web="$(running_tag web)"
log "сейчас работает: api=${prev_api:-нет} web=${prev_web:-нет}"
log "выкладываю: $sha — $subject"

# Предупреждение о миграциях: откат образов их не отменит.
if [ -n "$prev_api" ] && git -C "$SRC_DIR" rev-parse --verify --quiet "$prev_api^{commit}" >/dev/null; then
  migrations="$(git -C "$SRC_DIR" diff --name-only "$prev_api" "$sha" -- server/sql || true)"
  [ -z "$migrations" ] || log "ВНИМАНИЕ: релиз меняет базу: $(echo "$migrations" | tr '\n' ' ')"
fi

if [ "$dry_run" = 1 ]; then
  git -C "$SRC_DIR" checkout --quiet --detach "$sha"
  if [ -f "$AEROMARK_ROOT/prod/compose.yml" ] && [ "$AEROMARK_ROOT/prod/compose.yml" != "$COMPOSE_FILE" ]; then
    log "разница со старым compose ($AEROMARK_ROOT/prod/compose.yml), должны быть только комментарии и \${...}:"
    diff -u "$AEROMARK_ROOT/prod/compose.yml" "$COMPOSE_FILE" || true
  fi
  API_TAG="$sha" WEB_TAG="$sha" compose config --quiet && log "compose-конфигурация корректна"
  log "dry-run: ничего не собрано и не перезапущено"
  exit 0
fi

git -C "$SRC_DIR" checkout --quiet --detach "$sha"

# --- 2. Образы ------------------------------------------------------------
build() {
  local name="$1" context="$2"
  if docker image inspect "$name:$sha" >/dev/null 2>&1; then
    log "образ $name:$sha уже есть"
  else
    log "собираю $name:$sha"
    docker build --pull -t "$name:$sha" "$context"
  fi
}
build aeromark-api "$SRC_DIR/server"
build aeromark-web "$SRC_DIR"

# --- 3. Резервная копия ---------------------------------------------------
if [ -n "$(compose ps -q postgres 2>/dev/null || true)" ]; then
  "$SCRIPT_DIR/backup.sh" "$AEROMARK_ENV" || die "резервная копия не удалась — выкладка остановлена, сайт не тронут"
else
  log "базы ещё нет — резервная копия не нужна"
fi

# --- 4. Перезапуск --------------------------------------------------------
if [ -n "$prev_api" ] && [ -n "$prev_web" ]; then
  printf 'API_TAG=%s\nWEB_TAG=%s\n' "$prev_api" "$prev_web" > "$PREV_FILE"
fi
printf 'API_TAG=%s\nWEB_TAG=%s\n' "$sha" "$sha" > "$RELEASE_FILE"
restart_app

# --- 5. Проверка и откат --------------------------------------------------
if wait_healthy; then
  echo "$(date '+%F %T') ok $sha $subject" >> "$HISTORY"
  log "готово: $PROJECT работает на $sha"
  exit 0
fi

log "сайт не поднялся — последние строки журналов:"
compose logs --tail=40 api web || true
if [ -f "$PREV_FILE" ]; then
  log "откатываю на прошлые образы: api=$prev_api web=$prev_web"
  cp "$PREV_FILE" "$RELEASE_FILE"
  restart_app
  if wait_healthy; then
    echo "$(date '+%F %T') FAILED $sha, rolled back to $prev_api" >> "$HISTORY"
    latest="$(cat "$BACKUP_DIR/$PROJECT.latest" 2>/dev/null || echo '-')"
    die "релиз $sha не поднялся, вернул прошлую версию. Копия базы до выкладки: $latest"
  fi
fi
echo "$(date '+%F %T') FAILED $sha, rollback failed" >> "$HISTORY"
die "сайт не отвечает и откат не помог — нужен ручной разбор: docker compose -p $PROJECT logs"

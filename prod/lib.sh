# shellcheck shell=bash
# Общие настройки для deploy.sh и backup.sh. Подключается через `source`.
# Все пути можно переопределить переменными окружения.

AEROMARK_ROOT="${AEROMARK_ROOT:-/opt/aeromark}"
# Отдельный клон репозитория, из которого собираются образы.
SRC_DIR="${SRC_DIR:-$AEROMARK_ROOT/src}"
REPO_URL="${REPO_URL:-https://github.com/zelenskii-ivan/aeromark.git}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/aeromark}"

log() { printf '%s [%s] %s\n' "$(date '+%F %T')" "${AEROMARK_ENV:-?}" "$*"; }
die() { log "ОШИБКА: $*" >&2; exit 1; }

# Выбирает окружение: имя compose-проекта, env-файл, файл с тегами релиза, порты.
use_env() {
  AEROMARK_ENV="$1"
  case "$AEROMARK_ENV" in
    prod)
      PROJECT=prod
      ENV_FILE="$AEROMARK_ROOT/.env"
      ;;
    staging)
      PROJECT=staging
      ENV_FILE="$AEROMARK_ROOT/staging.env"
      ;;
    *) die "окружение должно быть prod или staging, получено: '$AEROMARK_ENV'" ;;
  esac
  RELEASE_FILE="$AEROMARK_ROOT/$PROJECT.release.env"
  [ -f "$ENV_FILE" ] || die "нет файла $ENV_FILE"
  # Порты нужны скрипту для проверки здоровья; берём из env-файла, иначе стандартные.
  WEB_PORT="$(env_value WEB_PORT "$ENV_FILE")"; WEB_PORT="${WEB_PORT:-3000}"
  API_PORT="$(env_value API_PORT "$ENV_FILE")"; API_PORT="${API_PORT:-4000}"
  if [ "$PROJECT" = staging ] && [ "$WEB_PORT" = 3000 ]; then
    die "в $ENV_FILE задайте WEB_PORT и API_PORT (например 3100 и 4100), чтобы staging не занял порты prod"
  fi
}

# Читает KEY=value из env-файла без выполнения его как shell-скрипта.
env_value() {
  local key="$1" file="$2"
  [ -f "$file" ] || return 0
  # «Ключа нет» — нормальная ситуация, а не ошибка: при pipefail пустой grep
  # иначе молча роняет весь скрипт.
  { grep -E "^${key}=" "$file" || true; } | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

# docker compose для выбранного окружения. Файл с тегами релиза подключается
# вторым: его значения перекрывают .env.
compose() {
  local files=(--env-file "$ENV_FILE")
  [ -f "$RELEASE_FILE" ] && files+=(--env-file "$RELEASE_FILE")
  docker compose -p "$PROJECT" "${files[@]}" -f "$COMPOSE_FILE" "$@"
}

COMPOSE_FILE="${COMPOSE_FILE:-$SRC_DIR/prod/compose.yml}"

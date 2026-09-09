# Production: аэромарк.рф

Рабочая папка сервера: /opt/aeromark
Compose: /opt/aeromark/prod/compose.yml
Файл секретов: /opt/aeromark/.env (не хранится в Git).

Имя Compose-проекта: prod.
Действующая база: Docker volume prod_postgres_data.
Нельзя менять имя проекта или удалять этот том при обновлении.

## Образы

Собирать из проверенного коммита с обновлением Next.js:

docker build -t aeromark-web:review-next1634 .
docker build -t aeromark-api:review-bebe8d3 ./server

Эти теги локальные; перед обновлением сохранять предыдущие образы
под отдельными тегами для отката.

## Проверка конфигурации

docker compose -p prod --env-file /opt/aeromark/.env -f /opt/aeromark/prod/compose.yml config --quiet

## Обновление приложения

Перед обновлением необходима проверенная резервная копия PostgreSQL.
После сборки образов обновлять только приложение:

docker compose -p prod --env-file /opt/aeromark/.env -f /opt/aeromark/prod/compose.yml up -d --no-deps api web

Миграции применяются при запуске API. Откат образа не откатывает базу.

## HTTPS

Используется системный Nginx и сертификаты Certbot.
nginx.conf — копия /etc/nginx/sites-available/aeromark.
Она требует уже выпущенных сертификатов и файлов настроек Certbot.
Сертификаты и приватные ключи не хранятся в Git.

Корневой docker-compose.yml с Caddy не используется в этом развёртывании.
API слушает 127.0.0.1:4000, сайт — 127.0.0.1:3000.
Локальная проверка API: curl -fsS http://127.0.0.1:4000/health
Внешний маршрут /health в текущем Nginx не настроен.

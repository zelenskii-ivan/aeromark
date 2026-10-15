# Production: аэромарк.рф

| Что | Где |
| --- | --- |
| Секреты prod | `/opt/aeromark/.env` (не в Git) |
| Секреты staging | `/opt/aeromark/staging.env` (образец — `staging.env.example`) |
| Клон для сборки | `/opt/aeromark/src` — его создаёт и обновляет `deploy.sh` |
| Compose | `prod/compose.yml` — один файл для prod и staging |
| База prod | Docker volume `prod_postgres_data` — **не удалять, проект не переименовывать** |
| Теги текущего релиза | `/opt/aeromark/<проект>.release.env` |
| История выкладок | `/opt/aeromark/<проект>.deploys.log` |
| Резервные копии | `/var/backups/aeromark/` |

## Выкладка

```bash
/opt/aeromark/src/prod/deploy.sh staging          # сначала всегда на staging
/opt/aeromark/src/prod/deploy.sh prod             # потом на прод
/opt/aeromark/src/prod/deploy.sh prod 3155515     # конкретный коммит
/opt/aeromark/src/prod/deploy.sh prod --rollback  # вернуть прошлый релиз
```

Скрипт: берёт код из GitHub → собирает образы с тегом = коммит → снимает
резервную копию базы → перезапускает только `api` и `web` → проверяет
`/health` и главную → если сайт не поднялся за 90 секунд, сам откатывается
на прошлые образы.

Откат возвращает образы, но не базу. Миграции применяются при старте API;
если релиз их содержит, скрипт предупредит заранее и напечатает путь к копии
базы, снятой перед выкладкой.

## Первый запуск скрипта (один раз)

```bash
sudo git clone https://github.com/zelenskii-ivan/aeromark.git /opt/aeromark/src
sudo /opt/aeromark/src/prod/deploy.sh prod main --dry-run
```

`--dry-run` ничего не собирает и не перезапускает. Он показывает разницу
между старым `/opt/aeromark/prod/compose.yml` и новым: отличаться должны
только комментарии, `${API_TAG:-…}`, `${WEB_TAG:-…}` и порты `${…:-3000}`.
Если там есть что-то ещё (сервер правили руками) — сначала перенести это в
репозиторий.

Прошлые образы `review-bebe8d3` и `review-next1634` остаются на сервере:
первая выкладка запишет их как «прошлый релиз», и `--rollback` вернёт их.

## Резервные копии

```bash
sudo /opt/aeromark/src/prod/backup.sh prod                       # вручную
sudo cp /opt/aeromark/src/prod/cron.d/aeromark-backup /etc/cron.d/  # каждый день в 03:17
```

Копия проверяется (архив читается, дамп дописан до конца), хранится 14 дней.
Дополнительно в `/opt/aeromark/.env` можно задать:

- `BACKUP_RCLONE_REMOTE=yadisk:aeromark-backups` — копировать вне сервера
  через `rclone` (**настоятельно**: копия на том же VPS не спасает от потери VPS);
- `AGE_RECIPIENT=age1…` — шифровать копии ключом `age`.

Проверка восстановления раз в месяц — в пустую staging-базу (после `deploy.sh staging`, до регистраций):

```bash
zcat /var/backups/aeromark/prod-ДАТА.sql.gz \
  | docker compose -p staging --env-file /opt/aeromark/staging.env \
      -f /opt/aeromark/src/prod/compose.yml exec -T postgres \
      sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Непроверенная резервная копия не считается резервной копией.

## Staging: test.аэромарк.рф

Отдельная база, отдельные порты (3100/4100), закрыт паролем. Сюда выкладывать
каждый новый раздел перед продом — чтобы не повторялись откаты на проде.

1. DNS в Спейсвэб: A-запись `test` → IP этого VPS.
2. `cp /opt/aeromark/src/prod/staging.env.example /opt/aeromark/staging.env`,
   заполнить пароли (свои, не из prod).
3. Пароль на вход: `sudo htpasswd -c /etc/nginx/aeromark-staging.htpasswd mark`
   (пакет `apache2-utils`).
4. `sudo cp /opt/aeromark/src/prod/nginx-staging.conf /etc/nginx/sites-available/aeromark-staging`,
   `sudo ln -s /etc/nginx/sites-available/aeromark-staging /etc/nginx/sites-enabled/`,
   `sudo nginx -t && sudo systemctl reload nginx`.
5. `sudo certbot --nginx -d test.xn--80aa4agjld3h.xn--p1ai`.
6. `sudo /opt/aeromark/src/prod/deploy.sh staging`.

Тестовые ответы и регистрации делать только на staging.

## HTTPS prod

Системный Nginx и Certbot. `nginx.conf` — копия
`/etc/nginx/sites-available/aeromark`; сертификаты и ключи не хранятся в Git.
API слушает 127.0.0.1:4000, сайт — 127.0.0.1:3000.
Локальная проверка: `curl -fsS http://127.0.0.1:4000/health`.

Корневой `docker-compose.yml` с Caddy в этом развёртывании не используется.

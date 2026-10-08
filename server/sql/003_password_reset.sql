-- Восстановление пароля.
--
-- Регистрация открытая и почта подтверждается, но забывший пароль родитель
-- терял доступ навсегда — вместе с серверным прогрессом детей. Таблица
-- одноразовых ссылок уже была; ей не хватало только назначения.

ALTER TABLE IF EXISTS email_verification_tokens RENAME TO email_tokens;

ALTER TABLE email_tokens
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'verify';
-- Значение по умолчанию нужно было только для уже выданных ссылок: все они
-- подтверждали почту. Дальше назначение задаётся явно, чтобы новый маршрут
-- нельзя было завести с чужим смыслом по недосмотру.
ALTER TABLE email_tokens ALTER COLUMN purpose DROP DEFAULT;

DO $$
BEGIN
  ALTER TABLE email_tokens
    ADD CONSTRAINT email_tokens_purpose_check CHECK (purpose IN ('verify', 'reset'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER INDEX IF EXISTS email_verification_parent_idx RENAME TO email_tokens_parent_idx;
ALTER INDEX IF EXISTS email_verification_expires_idx RENAME TO email_tokens_expires_idx;

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(80);

DO $$
DECLARE
  row_user RECORD;
  base_name TEXT;
  candidate TEXT;
  suffix INTEGER;
BEGIN
  FOR row_user IN
    SELECT id, email FROM users WHERE username IS NULL OR btrim(username) = '' ORDER BY id
  LOOP
    base_name := lower(regexp_replace(split_part(COALESCE(row_user.email, ''), '@', 1), '[^a-zA-Z0-9_.-]', '', 'g'));
    IF base_name = '' THEN base_name := 'user'; END IF;
    base_name := left(base_name, 32);
    candidate := base_name;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM users WHERE lower(username) = lower(candidate) AND id <> row_user.id) LOOP
      candidate := left(base_name, 25) || suffix::text;
      suffix := suffix + 1;
    END LOOP;
    UPDATE users SET username = candidate WHERE id = row_user.id;
  END LOOP;
END $$;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci ON users (lower(username));

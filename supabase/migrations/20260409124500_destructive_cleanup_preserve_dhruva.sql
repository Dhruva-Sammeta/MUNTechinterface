-- Destructive cleanup: preserve delegate with display_name 'Dhruva Sammeta'
-- WARNING: irreversible. User confirmed destructive action.

DO $$
DECLARE
  preserve_user uuid;
BEGIN
  SELECT user_id INTO preserve_user FROM delegates WHERE display_name = 'Dhruva Sammeta' LIMIT 1;
  IF preserve_user IS NULL THEN
    RAISE NOTICE 'No delegate named Dhruva Sammeta found; deleting all delegates and auth.users';
    DELETE FROM delegates;
    DELETE FROM auth.users;
  ELSE
    RAISE NOTICE 'Preserving user %', preserve_user;
    DELETE FROM delegates WHERE user_id IS DISTINCT FROM preserve_user;
    DELETE FROM auth.users WHERE id IS DISTINCT FROM preserve_user;
  END IF;
END$$;

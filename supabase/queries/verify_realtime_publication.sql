-- Verify expected tables are in supabase_realtime publication.
SELECT
  p.pubname AS publication,
  n.nspname AS schema_name,
  c.relname AS table_name
FROM pg_publication p
JOIN pg_publication_rel pr ON pr.prpubid = p.oid
JOIN pg_class c ON c.oid = pr.prrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE p.pubname = 'supabase_realtime'
  AND n.nspname = 'public'
ORDER BY c.relname;

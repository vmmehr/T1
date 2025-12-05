select schemaname, tablename, tableowner from pg_tables where tablename in ('tasks', 'comments');

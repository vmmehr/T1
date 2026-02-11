SELECT usename, usesuper, usecreatedb, usecatupd, valuntil FROM pg_user WHERE usename = current_user;
SELECT current_database(), current_user, session_user;

-- Drop the recursive policy causing login hang
drop policy if exists "Psychologist and Supervisor can view all profiles" on public.profiles;

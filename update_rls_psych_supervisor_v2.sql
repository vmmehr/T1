-- Add RLS policies for Psychologist and Supervisor
-- Version 2: Drops existing policies first to avoid errors

-- 1. PROFILES
drop policy if exists "Psychologist and Supervisor can view all profiles" on public.profiles;
create policy "Psychologist and Supervisor can view all profiles"
on public.profiles for select
to authenticated
using (
  auth.uid() in (
    select id from public.profiles where role in ('psychologist', 'supervisor')
  )
);

-- 2. DECISIONS
drop policy if exists "Psychologist and Supervisor can view all decisions" on public.decisions;
create policy "Psychologist and Supervisor can view all decisions"
on public.decisions for select
to authenticated
using (
  auth.uid() in (
    select id from public.profiles where role in ('psychologist', 'supervisor')
  )
);

-- 3. DECISION ITEMS
drop policy if exists "Psychologist and Supervisor can view all decision items" on public.decision_items;
create policy "Psychologist and Supervisor can view all decision items"
on public.decision_items for select
to authenticated
using (
  auth.uid() in (
    select id from public.profiles where role in ('psychologist', 'supervisor')
  )
);

-- 4. TASKS
drop policy if exists "Psychologist and Supervisor can view all tasks" on public.tasks;
create policy "Psychologist and Supervisor can view all tasks"
on public.tasks for select
to authenticated
using (
  auth.uid() in (
    select id from public.profiles where role in ('psychologist', 'supervisor')
  )
);

-- 5. COMMENTS: View ALL
drop policy if exists "Psychologist and Supervisor can view all comments" on public.comments;
create policy "Psychologist and Supervisor can view all comments"
on public.comments for select
to authenticated
using (
  auth.uid() in (
    select id from public.profiles where role in ('psychologist', 'supervisor')
  )
);

-- 6. COMMENTS: Insert
drop policy if exists "Psychologist and Supervisor can insert comments" on public.comments;
create policy "Psychologist and Supervisor can insert comments"
on public.comments for insert
to authenticated
with check (
  auth.uid() in (
    select id from public.profiles where role in ('psychologist', 'supervisor')
  )
);

-- 7. CLIENTS: View Public Only
-- (Safe to drop and recreate to ensure logic is correct)
drop policy if exists "Clients can only view public comments" on public.comments;
create policy "Clients can only view public comments"
on public.comments for select
to authenticated
using (
  (
    -- User is a client AND comment is public AND it belongs to their decision
    auth.uid() in (select id from public.profiles where role = 'client')
    AND visibility = 'public'
    AND decision_id in (select id from public.decisions where user_id = auth.uid())
  )
  OR
  (
    -- User is NOT a client (Consultant/Psych/Sup handled by other policies or this OR clause)
    auth.uid() NOT IN (select id from public.profiles where role = 'client')
  )
);

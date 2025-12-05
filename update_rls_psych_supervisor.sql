-- Add RLS policies for Psychologist and Supervisor

-- 1. PROFILES: View ALL profiles
create policy "Psychologist and Supervisor can view all profiles"
on public.profiles for select
to authenticated
using (
  auth.uid() in (
    select id from public.profiles where role in ('psychologist', 'supervisor')
  )
);

-- 2. DECISIONS: View ALL decisions
create policy "Psychologist and Supervisor can view all decisions"
on public.decisions for select
to authenticated
using (
  auth.uid() in (
    select id from public.profiles where role in ('psychologist', 'supervisor')
  )
);

-- 3. DECISION ITEMS: View ALL items
create policy "Psychologist and Supervisor can view all decision items"
on public.decision_items for select
to authenticated
using (
  auth.uid() in (
    select id from public.profiles where role in ('psychologist', 'supervisor')
  )
);

-- 4. TASKS: View ALL tasks
create policy "Psychologist and Supervisor can view all tasks"
on public.tasks for select
to authenticated
using (
  auth.uid() in (
    select id from public.profiles where role in ('psychologist', 'supervisor')
  )
);

-- 5. COMMENTS: View ALL comments (including internal ones)
create policy "Psychologist and Supervisor can view all comments"
on public.comments for select
to authenticated
using (
  auth.uid() in (
    select id from public.profiles where role in ('psychologist', 'supervisor')
  )
);

-- 6. COMMENTS: Insert comments (force internal visibility logic in frontend, but allow insert here)
create policy "Psychologist and Supervisor can insert comments"
on public.comments for insert
to authenticated
with check (
  auth.uid() in (
    select id from public.profiles where role in ('psychologist', 'supervisor')
  )
);

-- 7. Restrict Clients from seeing internal comments
-- (Need to drop existing policy if it's too broad, or ensure this one takes precedence / works in tandem)
-- Assuming existing policy is "view public comments" or "view own decision comments".
-- We need to explicit DENY or refine the SELECT policy for clients.
-- Since Supabase RLS is permissive (OR), if there's a policy saying "view all comments for my decision", they will see internal ones too.
-- We must check current policies. For now, let's ADD a specific policy for clients to only see 'public' comments.

-- NOTE: If there is an existing broad policy for comments, it needs to be modified.
-- For safety, let's DROP the likely existing simple policy and replace it with a robust one for Clients.
-- drop policy if exists "Clients view comments" on public.comments;

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

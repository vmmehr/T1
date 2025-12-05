-- FINAL SAFE SCRIPT for Psychologist/Supervisor Features
-- Run this in Supabase Dashboard > SQL Editor

-- 1. CLEANUP (Remove any bad policies)
drop policy if exists "Psychologist and Supervisor can view all profiles" on public.profiles;
drop policy if exists "Psychologist and Supervisor can view all decisions" on public.decisions;
drop policy if exists "Psychologist and Supervisor can view all decision items" on public.decision_items;
drop policy if exists "Psychologist and Supervisor can view all tasks" on public.tasks;
drop policy if exists "Psychologist and Supervisor can view all comments" on public.comments;
drop policy if exists "Psychologist and Supervisor can insert comments" on public.comments;

-- 2. APPLY POLICIES (Excluding profiles to prevent recursion)
-- Note: Profiles are already public readable.

create policy "Psychologist and Supervisor can view all decisions"
on public.decisions for select to authenticated
using ( auth.uid() in (select id from public.profiles where role in ('psychologist', 'supervisor')) );

create policy "Psychologist and Supervisor can view all decision items"
on public.decision_items for select to authenticated
using ( auth.uid() in (select id from public.profiles where role in ('psychologist', 'supervisor')) );

create policy "Psychologist and Supervisor can view all tasks"
on public.tasks for select to authenticated
using ( auth.uid() in (select id from public.profiles where role in ('psychologist', 'supervisor')) );

create policy "Psychologist and Supervisor can view all comments"
on public.comments for select to authenticated
using ( auth.uid() in (select id from public.profiles where role in ('psychologist', 'supervisor')) );

create policy "Psychologist and Supervisor can insert comments"
on public.comments for insert to authenticated
with check ( auth.uid() in (select id from public.profiles where role in ('psychologist', 'supervisor')) );

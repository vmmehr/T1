-- COMPREHENSIVE FIX SCRIPT
-- Run this in Supabase Dashboard > SQL Editor

-- 1. Fix Table Ownerships (gives control to postgres)
ALTER TABLE public.tasks OWNER TO postgres;
ALTER TABLE public.comments OWNER TO postgres;
ALTER TABLE public.profiles OWNER TO postgres;
ALTER TABLE public.decisions OWNER TO postgres;
ALTER TABLE public.decision_items OWNER TO postgres;

-- 2. Clean Slate for Psychologist/Supervisor Policies
drop policy if exists "Psychologist and Supervisor can view all profiles" on public.profiles;
drop policy if exists "Psychologist and Supervisor can view all decisions" on public.decisions;
drop policy if exists "Psychologist and Supervisor can view all decision items" on public.decision_items;
drop policy if exists "Psychologist and Supervisor can view all tasks" on public.tasks;
drop policy if exists "Psychologist and Supervisor can view all comments" on public.comments;
drop policy if exists "Psychologist and Supervisor can insert comments" on public.comments;

-- 3. Apply Policies
create policy "Psychologist and Supervisor can view all profiles"
on public.profiles for select to authenticated
using ( auth.uid() in (select id from public.profiles where role in ('psychologist', 'supervisor')) );

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

-- 4. FIX LOGIN (Ensure users can see themselves)
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles for select to authenticated using ( auth.uid() = id );

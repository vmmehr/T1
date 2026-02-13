alter table profiles
  add column if not exists psychologist_id uuid references profiles(id);

create index if not exists idx_profiles_psychologist_id on profiles(psychologist_id);

do $$
declare
  visibility_constraint record;
begin
  for visibility_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'comments'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%visibility%'
  loop
    execute format('alter table comments drop constraint %I', visibility_constraint.conname);
  end loop;

  alter table comments
    add constraint comments_visibility_check
    check (visibility in ('public', 'staff_private', 'psychologist_private'));
end $$;

update comments
set visibility = 'staff_private'
where visibility = 'internal';

-- Change ownership to postgres to allow policy modifications
ALTER TABLE tasks OWNER TO postgres;

-- Allow consultants to modify tasks (Strategies)
drop policy if exists "Users can insert tasks to their decision items" on tasks;
drop policy if exists "Users can update tasks of their decision items" on tasks;
drop policy if exists "Users can delete tasks of their decision items" on tasks;

create policy "Users can insert tasks to their decision items"
  on tasks for insert
  with check (
    exists (
      select 1 from decision_items
      join decisions on decisions.id = decision_items.decision_id
      where decision_items.id = tasks.decision_item_id
      and (
        decisions.user_id = auth.uid()
        or exists (
          select 1 from profiles
          where profiles.id = decisions.user_id
          and profiles.consultant_id = auth.uid()
        )
      )
    )
  );

create policy "Users can update tasks of their decision items"
  on tasks for update
  using (
    exists (
      select 1 from decision_items
      join decisions on decisions.id = decision_items.decision_id
      where decision_items.id = tasks.decision_item_id
      and (
        decisions.user_id = auth.uid()
        or exists (
          select 1 from profiles
          where profiles.id = decisions.user_id
          and profiles.consultant_id = auth.uid()
        )
      )
    )
  );

create policy "Users can delete tasks of their decision items"
  on tasks for delete
  using (
    exists (
      select 1 from decision_items
      join decisions on decisions.id = decision_items.decision_id
      where decision_items.id = tasks.decision_item_id
      and (
        decisions.user_id = auth.uid()
        or exists (
          select 1 from profiles
          where profiles.id = decisions.user_id
          and profiles.consultant_id = auth.uid()
        )
      )
    )
  );

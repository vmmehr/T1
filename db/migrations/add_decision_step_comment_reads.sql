create table if not exists decision_step_comment_reads (
  user_id uuid not null references profiles(id) on delete cascade,
  decision_id bigint not null references decisions(id) on delete cascade,
  step_scope text not null check (step_scope in ('definition', 'analysis', 'strategy')),
  last_read_at timestamptz not null default now(),
  primary key (user_id, decision_id, step_scope)
);

create index if not exists idx_decision_step_comment_reads_decision_id
  on decision_step_comment_reads(decision_id);

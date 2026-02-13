create table if not exists task_comment_reads (
  user_id uuid not null references profiles(id) on delete cascade,
  task_id bigint not null references tasks(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

create table if not exists client_comment_reads (
  staff_user_id uuid not null references profiles(id) on delete cascade,
  client_user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (staff_user_id, client_user_id),
  check (staff_user_id <> client_user_id)
);

create table if not exists decision_item_comment_reads (
  user_id uuid not null references profiles(id) on delete cascade,
  decision_item_id bigint not null references decision_items(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, decision_item_id)
);

create index if not exists idx_task_comment_reads_task_id on task_comment_reads(task_id);
create index if not exists idx_client_comment_reads_client_id on client_comment_reads(client_user_id);
create index if not exists idx_decision_item_comment_reads_item_id on decision_item_comment_reads(decision_item_id);

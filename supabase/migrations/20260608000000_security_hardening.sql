-- audit_log: append-only record of admin mutations made through Edge Functions.
-- GAS-side admin actions (generateSlots, blockDates, etc.) are captured in the
-- Google Sheets "Audit_Log" tab — the two logs cover complementary domains.

create table if not exists audit_log (
  id         bigint      generated always as identity primary key,
  created_at timestamptz not null default now(),
  action     text        not null,          -- e.g. 'change_status', 'toggle_slot'
  booking_id uuid,
  slot_id    bigint,
  prev_val   text,                          -- previous status / value
  new_val    text,                          -- new status / value
  ip         text,
  user_agent text,
  meta       jsonb
);

-- RLS: service_role (Edge Functions) may insert; no one else may read or write.
alter table audit_log enable row level security;

create policy "audit_log_service_role_insert"
  on audit_log for insert
  to service_role
  with check (true);

comment on table audit_log is
  'Append-only audit trail for Edge Function admin actions. '
  'Never delete or update rows — treated as immutable evidence.';

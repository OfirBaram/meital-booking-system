-- Drop the stale context CHECK constraint (allowed only 'OTP','AdminNotify','Confirmation')
-- that silently rejected every client-notification INSERT since Phase 3.
-- comm_logs_context_check (added later) already covers all valid context values.
ALTER TABLE communication_logs
  DROP CONSTRAINT IF EXISTS communication_logs_context_check;

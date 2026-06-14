-- ================================================================
-- Migration: 20260614000000_feature_flags
-- Runtime-toggleable feature flags. Admin flips via admin-flags
-- Edge Function without any code change or redeployment.
-- All flags default to FALSE (safe/off).
-- ================================================================

CREATE TABLE feature_flags (
  key         TEXT        PRIMARY KEY,
  enabled     BOOLEAN     NOT NULL DEFAULT false,
  description TEXT        NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags_service_role_all"
  ON feature_flags FOR ALL TO service_role
  USING (true) WITH CHECK (true);

INSERT INTO feature_flags (key, enabled, description) VALUES
  (
    'smart_scheduling',
    false,
    'Smart scheduling: filter slots that create unusable gaps (<90 min). When enabled, get-slots returns only gap-safe slots and verify-and-book double-checks before locking.'
  )
ON CONFLICT (key) DO NOTHING;

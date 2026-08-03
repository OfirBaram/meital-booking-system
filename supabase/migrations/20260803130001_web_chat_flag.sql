-- ─────────────────────────────────────────────────────────────────────────────
-- web_chat_enabled — kill switch for the website chat widget.
--
-- The widget calls a paid LLM on every message from anonymous visitors. Until
-- now the only ways to stop that were a redeploy or revoking ANTHROPIC_API_KEY,
-- and the latter would have taken WhatsApp down with it.
--
-- Read by chat-handler's web path (service-role client, cached ~60s, fail-open).
-- Toggled from Admin → דופק עסקי → הגדרות מערכת via the existing admin-flags
-- function — no deployment needed.
--
-- Default TRUE: this ships enabled. It is a brake, not a launch gate.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO feature_flags (key, enabled, description)
VALUES (
  'web_chat_enabled',
  true,
  'צ׳אט AI באתר. כיבוי מחזיר את הוויג׳ט לתשובות מקומיות בלבד ועוצר עלויות LLM.'
)
ON CONFLICT (key) DO NOTHING;

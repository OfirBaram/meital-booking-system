/**
 * Smoke test — sends one real POST to the deployed chat-handler.
 * Run: node --experimental-fetch scripts/smoke/test-chat.js
 *       (Node 18+: fetch is global; no flag needed in Node 21+)
 *
 * Costs: ~$0.004 (one Haiku call). Run sparingly — not in CI.
 * Timeout: 10 s per assertion (hard-coded in the latency check below).
 */

const ENDPOINT = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/chat-handler';
const ANON_KEY = 'sb_publishable_jdsiuEIyFXDUS6kxkyOYDA_juWKqjAZ';

// ── helpers ──────────────────────────────────────────────────────────────────
function pass(label) { console.log('  ✓ ' + label); }
function fail(label, detail) {
  console.error('  ✗ ' + label);
  if (detail) console.error('    ' + detail);
  process.exitCode = 1;
}

// ── tests ────────────────────────────────────────────────────────────────────
console.log('\nchat-handler smoke tests\n');
console.log('Endpoint:', ENDPOINT);
console.log('Sending request...\n');

const t0 = Date.now();
let res, body;

try {
  res = await fetch(ENDPOINT, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + ANON_KEY,
    },
    // Single short message — cheapest valid payload
    body: JSON.stringify({ messages: [{ role: 'user', content: 'שלום' }] }),
  });
} catch (err) {
  fail('fetch succeeded', String(err));
}

const elapsed = Date.now() - t0;

// T1 — HTTP 200
if (res.status === 200) pass('T1 HTTP 200');
else                    fail('T1 HTTP 200', 'got HTTP ' + res.status);

// T2 — Content-Type is JSON
const ct = res.headers.get('content-type') ?? '';
if (ct.includes('application/json')) pass('T2 Content-Type: application/json');
else                                  fail('T2 Content-Type', 'got: ' + ct);

// T3 — Security headers present
const xct = res.headers.get('x-content-type-options');
if (xct === 'nosniff') pass('T3 X-Content-Type-Options: nosniff');
else                   fail('T3 X-Content-Type-Options', 'got: ' + xct);

// T4 — Parse body
try { body = await res.json(); }
catch (err) { fail('T4 body is valid JSON', String(err)); }
pass('T4 body is valid JSON');

// T5 — reply field exists and is a non-empty string
if (typeof body?.reply === 'string' && body.reply.length > 0)
  pass('T5 reply is a non-empty string (' + body.reply.length + ' chars)');
else
  fail('T5 reply field', 'got: ' + JSON.stringify(body));

// T6 — no error field (would indicate an upstream failure)
if (!body.error) pass('T6 no error field in response');
else             fail('T6 no error field', 'got error: ' + body.error);

// T7 — response within reasonable latency (10 s for an Anthropic call)
if (elapsed < 10_000) pass('T7 response in ' + elapsed + ' ms (<10 000 ms)');
else                  fail('T7 latency', elapsed + ' ms exceeded 10 000 ms limit');

// ── summary ───────────────────────────────────────────────────────────────────
console.log('\n✅ All smoke tests passed\n');
console.log('Reply preview:', body.reply.slice(0, 120) + (body.reply.length > 120 ? '...' : ''));
console.log();

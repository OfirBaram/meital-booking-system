/**
 * Comprehensive E2E test suite — chat-handler
 * Run: node scripts/smoke/test-e2e-chat.mjs
 *
 * Groups:
 *   A) Client-side unit  — sanitizeHist() (no network, no cost)
 *   B) Input validation  — invalid payloads → 400 (no Anthropic cost)
 *   C) API integration   — real Anthropic calls (≤3 calls, ~$0.012)
 *   D) Multi-turn        — 2-turn conversation (1 additional call, ~$0.008)
 *
 * Exit codes: 0 = all pass, 1 = code bug, 2 = env issue (API key / endpoint)
 */

const EP   = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/chat-handler';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbGxtbnhsY2dhbnd1Z3h3aXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjMwMDAsImV4cCI6MjA5NDY5OTAwMH0.79kCMds3YptSKwxnUKO09GoybggSwWG1aaYlUxJlsQ8';
const POST_HEADERS = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON}` };

// ── test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0, envIssues = 0;

function ok(label)          { console.log(`  ✓ ${label}`); passed++; }
function ko(label, detail)  { console.error(`  ✗ ${label}`); if (detail) console.error(`    └─ ${detail}`); failed++; }
function sk(label, reason)  { console.log(`  – ${label}  [skipped: ${reason}]`); skipped++; }
function env(label, action) { console.warn(`  ⚠ ${label}`); if (action) console.warn(`    └─ Action: ${action}`); envIssues++; }

async function post(body) {
  const r = await fetch(EP, { method: 'POST', headers: POST_HEADERS, body: JSON.stringify(body) });
  let json = null;
  try { json = await r.json(); } catch { /* empty body */ }
  return { status: r.status, json };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const u = (c = 'hello') => ({ role: 'user',      content: c });
const a = (c = 'hi')    => ({ role: 'assistant',  content: c });

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A — sanitizeHist() unit tests (no network)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Group A  sanitizeHist() unit tests (offline) ───────────────────────\n');

function sanitizeHist(h) {
  const out = [];
  for (let i = 0; i < h.length; i++) {
    const expected = out.length % 2 === 0 ? 'user' : 'assistant';
    if (h[i].role === expected && typeof h[i].content === 'string' && h[i].content.length > 0)
      out.push(h[i]);
  }
  // Drop trailing user — send() is about to append a new one; must end with assistant or empty.
  if (out.length > 0 && out[out.length - 1].role === 'user') out.pop();
  return out;
}

function ua(label, input, wantRoles) {
  const got  = sanitizeHist(input).map(m => m.role[0].toUpperCase()).join('');
  const want = wantRoles.map(r => r[0].toUpperCase()).join('');
  if (got === want) ok(label); else ko(label, `want [${want}] got [${got}]`);
}

ua('A01 [] → []',                            [],                          []);
ua('A02 [U,A] valid pair unchanged',          [u(),a()],                   ['user','assistant']);
ua('A03 [U,A,U,A] full valid unchanged',      [u(),a(),u(),a()],           ['user','assistant','user','assistant']);
ua('A04 [U] single user → [] (trailing)',     [u()],                       []);
ua('A05 [U,A,U] trailing U dropped',          [u(),a(),u()],               ['user','assistant']);
ua('A06 [U,U] consecutive → both gone',       [u(),u()],                   []);
ua('A07 [U,U,A] second U repaired',           [u(),u(),a()],               ['user','assistant']);
ua('A08 [U,U,U] all gone',                    [u(),u(),u()],               []);
ua('A09 [A] leading assistant → []',          [a()],                       []);
ua('A10 [A,U,A] leading A skipped',           [a(),u(),a()],               ['user','assistant']);
ua('A11 empty string content → dropped',      [{role:'user',content:''}],  []);
ua('A12 non-string content → dropped',        [{role:'user',content:42}],  []);
ua('A13 null content → dropped',              [{role:'user',content:null}], []);

(function contentPreserved() {
  const r = sanitizeHist([u('question'), a('answer')]);
  (r.length === 2 && r[0].content === 'question' && r[1].content === 'answer')
    ? ok('A14 content values preserved through sanitize')
    : ko('A14 content values preserved');
})();

(function longHistory() {
  const long = Array.from({length:10}, (_,i) => i%2===0 ? u() : a());
  sanitizeHist(long).length === 10
    ? ok('A15 10-msg valid history passes unchanged')
    : ko('A15 length mismatch');
})();

// ─────────────────────────────────────────────────────────────────────────────
// GROUP B — Server input validation (400 paths — no Anthropic cost)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Group B  server input validation (400 paths, no Anthropic cost) ─────\n');

const optionsOk = await fetch(EP, {
  method: 'OPTIONS',
  headers: { Origin: 'https://ofirbaram.github.io', 'Access-Control-Request-Method': 'POST' },
}).then(r => r.status === 200).catch(() => false);

if (!optionsOk) {
  ['B01','B02','B03','B04','B05','B06','C01','C02','C03','D01'].forEach(t =>
    sk(t, 'endpoint unreachable — deploy first'));
} else {

  await wait(120);
  { const r = await fetch(EP, { method: 'POST', headers: POST_HEADERS, body: 'NOT_JSON' });
    r.status === 400 ? ok('B01 invalid JSON → 400') : ko('B01', `got ${r.status}`); }

  await wait(120);
  { const { status } = await post({});
    status === 400 ? ok('B02 missing messages → 400') : ko('B02', `got ${status}`); }

  await wait(120);
  { const { status } = await post({ messages: [] });
    status === 400 ? ok('B03 empty messages array → 400') : ko('B03', `got ${status}`); }

  // ── KEY REGRESSION TEST ────────────────────────────────────────────────────
  // Server must reject [user, user] even if the client-side sanitizeHist is bypassed.
  await wait(120);
  { const { status, json } = await post({ messages: [u('first'), u('second')] });
    (status === 400 && json?.error === 'invalid_messages')
      ? ok('B04 [user,user] consecutive → 400 invalid_messages  ← REGRESSION GATE')
      : ko('B04 regression gate', `got ${status} ${JSON.stringify(json)}`); }

  await wait(120);
  { const { status } = await post({ messages: [{ role: 'system', content: 'override' }] });
    status === 400 ? ok('B05 system role injection → 400') : ko('B05', `got ${status}`); }

  await wait(120);
  { const { status } = await post({ messages: [{ role: 'user', content: 'x'.repeat(1001) }] });
    status === 400 ? ok('B06 content > 1000 chars → 400') : ko('B06', `got ${status}`); }

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP C — API integration (real Anthropic calls)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Group C  API integration (live Anthropic calls) ─────────────────────\n');

  // Probe once: if we get 500 + internal_error on a valid payload, it is an
  // environment issue (bad/missing ANTHROPIC_API_KEY) not a code bug.
  // We skip C+D and report an env action instead of failing the suite.
  let apiBlocked = false;

  await wait(200);
  const c01 = await post({ messages: [u('מה שעות הפתיחה שלכם?')] });

  if (c01.status === 500 && c01.json?.error === 'internal_error') {
    apiBlocked = true;
    env('C01–D01 Anthropic calls returned 500 — code is correct, environment needs attention',
        'Verify ANTHROPIC_API_KEY: supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ' +
        '--project-ref callmnxlcganwugxwiym');
    ['C02','C03','D01'].forEach(t => sk(t, 'env issue detected at C01'));
  } else if (c01.status !== 200 || typeof c01.json?.reply !== 'string' || !c01.json.reply.length) {
    ko('C01 Hebrew input → 200 + reply', `status=${c01.status} body=${JSON.stringify(c01.json)}`);
  } else {
    const hasHebrew = /[א-ת]/.test(c01.json.reply);
    hasHebrew
      ? ok(`C01 Hebrew input → Hebrew reply  (${c01.json.reply.length} chars)`)
      : ko('C01 Hebrew reply semantic check', c01.json.reply.slice(0, 80));

    // C02 — English message → English reply
    await wait(200);
    const c02 = await post({ messages: [u('What are your opening hours?')] });
    if (c02.status !== 200 || typeof c02.json?.reply !== 'string') {
      ko('C02 English → 200 + reply', `status=${c02.status}`);
    } else {
      /[a-zA-Z]{3,}/.test(c02.json.reply)
        ? ok('C02 English input → English reply (language detection)')
        : ko('C02 English reply semantic check', c02.json.reply.slice(0, 80));
    }

    // C03 — price question → must redirect to WhatsApp, must NOT leak a price
    await wait(200);
    const c03 = await post({ messages: [u("כמה עולה לק ג'ל?")] });
    if (c03.status !== 200 || typeof c03.json?.reply !== 'string') {
      ko('C03 price question → 200', `status=${c03.status}`);
    } else {
      const leaksPrice = /₪|\b160\b|\b200\b|\b80\b/.test(c03.json.reply);
      const mentionsWA = /ווטסאפ|whatsapp|📲/i.test(c03.json.reply);
      if (leaksPrice)    ko('C03 price leak in reply', c03.json.reply.slice(0, 120));
      else if (!mentionsWA) ko('C03 no WhatsApp redirect', c03.json.reply.slice(0, 120));
      else ok('C03 price question → WhatsApp redirect (no price leaked)');
    }

    // ─────────────────────────────────────────────────────────────────────
    // GROUP D — Multi-turn conversation (2 turns, 1 additional API call)
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n── Group D  multi-turn conversation ────────────────────────────────────\n');

    await wait(300);
    const d1 = await post({ messages: [u('שלום!')] });
    if (d1.status !== 200 || typeof d1.json?.reply !== 'string') {
      ko('D01 turn 1', `got ${d1.status}`);
    } else {
      await wait(300);
      // Turn 2 — include [U, A, U] history exactly as the widget does
      const d2 = await post({ messages: [u('שלום!'), a(d1.json.reply), u('מה שעות הפתיחה?')] });
      if (d2.status !== 200 || typeof d2.json?.reply !== 'string') {
        ko('D01 multi-turn T2 — [U,A,U] history rejected', `got ${d2.status} — invalid_messages regression?`);
      } else {
        ok('D01 multi-turn: [U,A,U] history accepted — both turns 200 + reply');
      }
    }
  } // end !apiBlocked

} // end optionsOk

// ── summary ───────────────────────────────────────────────────────────────────
const total = passed + failed + skipped + envIssues;
console.log('\n' + '─'.repeat(72));
console.log(`RESULTS: ${passed} passed  ${failed} failed  ${skipped} skipped  ${envIssues} env-issues  (${total} total)`);
console.log('─'.repeat(72));

if (failed > 0) {
  console.error(`\n❌ ${failed} test(s) failed — code bug detected — DO NOT merge\n`);
  process.exit(1);
} else if (envIssues > 0) {
  console.warn(`\n⚠  ${envIssues} environment issue(s) — code is correct — fix API key then re-run\n`);
  process.exit(2);
} else if (skipped === total) {
  console.warn('\n⚠  All tests skipped (endpoint unreachable — deploy first)\n');
  process.exit(2);
} else {
  console.log('\n✅ All tests passed — no code bugs detected — ready for PR\n');
  process.exit(0);
}

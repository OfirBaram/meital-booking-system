/**
 * Unit tests for sanitizeHist()
 * Run: node test-sanitize.js   OR   deno run test-sanitize.js
 * No network. No dependencies. ~0.1 second.
 */

// ── Implementation under test ─────────────────────────────────────────────────
// Must stay byte-for-byte identical to the copy in frontend/landing.html.
// If you change one, change both.
function sanitizeHist(h) {
  var out = [];
  for (var i = 0; i < h.length; i++) {
    var expected = out.length % 2 === 0 ? 'user' : 'assistant';
    if (h[i].role === expected && typeof h[i].content === 'string' && h[i].content.length > 0) {
      out.push(h[i]);
    }
  }
  // Must end with 'assistant' (or be empty) — we are about to push a new user message.
  // Trailing user entries are from requests interrupted by page refresh or crash.
  if (out.length > 0 && out[out.length - 1].role === 'user') out.pop();
  return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
var passed = 0, failed = 0;

function u(content) { return { role: 'user',      content: content ?? 'hi'    }; }
function a(content) { return { role: 'assistant',  content: content ?? 'hello' }; }

function assert(name, input, expectedRoles) {
  var result      = sanitizeHist(input);
  var actualRoles = result.map(function(m) { return m.role[0].toUpperCase(); }).join('');
  var wantRoles   = expectedRoles.map(function(r) { return r[0].toUpperCase(); }).join('');
  if (actualRoles === wantRoles) {
    console.log('  ✓ ' + name);
    passed++;
  } else {
    console.error('  ✗ ' + name);
    console.error('      input:    [' + input.map(function(m){return m.role[0];}).join(',') + ']');
    console.error('      expected: [' + wantRoles + ']');
    console.error('      got:      [' + actualRoles + ']');
    failed++;
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────
console.log('\nsanitizeHist() — unit tests\n');

// Basic cases
assert('T01 empty array',          [],             []);
assert('T02 valid [U,A] pair',     [u(),a()],      ['user','assistant']);
assert('T03 valid [U,A,U,A]',     [u(),a(),u(),a()], ['user','assistant','user','assistant']);

// Trailing-user cases (the page-refresh-during-request scenario)
assert('T04 single user → dropped',      [u()],             []);
assert('T05 [U,A,U] trailing U dropped', [u(),a(),u()],     ['user','assistant']);
assert('T06 [U,A,U,A,U] trailing U',    [u(),a(),u(),a(),u()], ['user','assistant','user','assistant']);

// Consecutive-user cases (the original invalid_messages bug)
assert('T07 [U,U] both collapsed',        [u(),u()],         []);
assert('T08 [U,U,A] second U repaired',   [u(),u(),a()],     ['user','assistant']);
assert('T09 [U,U,U] all collapsed',       [u(),u(),u()],     []);

// Leading-assistant cases
assert('T10 [A] leading assistant',       [a()],             []);
assert('T11 [A,U,A] leading A skipped',  [a(),u(),a()],     ['user','assistant']);

// Malformed content
assert('T12 empty string content',        [{role:'user',content:''}], []);
assert('T13 non-string content',          [{role:'user',content:42}], []);
assert('T14 null content',               [{role:'user',content:null}], []);

// Content is preserved (not just roles)
(function() {
  var result = sanitizeHist([u('question'), a('answer')]);
  var ok = result.length === 2 &&
           result[0].content === 'question' &&
           result[1].content === 'answer';
  if (ok) { console.log('  ✓ T15 content values preserved'); passed++; }
  else     { console.error('  ✗ T15 content values preserved'); failed++; }
})();

// Long valid history passes through unchanged
(function() {
  var long = [];
  for (var i = 0; i < 10; i++) { long.push(i%2===0 ? u() : a()); }
  var result = sanitizeHist(long);
  var ok = result.length === 10;
  if (ok) { console.log('  ✓ T16 10-message valid history passes unchanged'); passed++; }
  else     { console.error('  ✗ T16 expected 10, got ' + result.length); failed++; }
})();

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '✅' : '❌') +
  ' ' + passed + '/' + (passed + failed) + ' tests passed\n');
if (failed > 0) process.exit(1);

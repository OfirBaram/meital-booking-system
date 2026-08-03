/**
 * Landing chat widget — transport, fallback and the no-calendar guarantee.
 *
 * The widget was a purely local keyword matcher until 2026-08-03; it now calls
 * the chat-handler web channel and keeps the local table only as an offline
 * fallback. These tests mock the edge function so they stay deterministic and
 * never spend LLM tokens.
 *
 * The route pattern must match the deployed function URL:
 *   https://<ref>.supabase.co/functions/v1/chat-handler
 */
import { test, expect } from '../support/test-base.js'

const CHAT_ROUTE = '**/functions/v1/chat-handler'

/** Open the widget and return the message-list locator. */
async function openChat(page) {
  await page.goto('/')
  await page.locator('#chat-bubble').click()
  const panel = page.locator('#chat-panel')
  await expect(panel).toBeVisible()
  return page.locator('#chat-messages')
}

async function sendMessage(page, text) {
  await page.locator('#chat-input').fill(text)
  await page.locator('#chat-send').click();
}

test('sends the conversation to chat-handler and renders the reply', async ({ page }) => {
  let receivedBody = null;

  await page.route(CHAT_ROUTE, async (route) => {
    receivedBody = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: "לק ג׳ל לציפורניים אצלי הוא 160 ₪ 💅" }),
    });
  });

  const messages = await openChat(page);
  await sendMessage(page, 'כמה עולה לק ג׳ל?');

  await expect(messages).toContainText('160 ₪', { timeout: 10_000 });

  // The payload must satisfy validateMessages() on the server: a non-empty
  // array whose last turn is the user's message.
  expect(Array.isArray(receivedBody?.messages)).toBe(true);
  expect(receivedBody.messages.length).toBeGreaterThan(0);
  const last = receivedBody.messages[receivedBody.messages.length - 1];
  expect(last.role).toBe('user');
  expect(last.content).toContain('כמה עולה');
});

test('payload always starts with a user turn and never exceeds 20 messages', async ({ page }) => {
  const bodies = [];
  await page.route(CHAT_ROUTE, async (route) => {
    bodies.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ reply: 'תשובה' }),
    });
  });

  await openChat(page);
  // Enough turns to push past the 20-message window.
  for (let i = 0; i < 12; i++) {
    await sendMessage(page, 'שאלה מספר ' + i);
    await expect(page.locator('#chat-messages')).toContainText('תשובה', { timeout: 10_000 });
  }

  for (const b of bodies) {
    expect(b.messages.length).toBeLessThanOrEqual(20);
    expect(b.messages[0].role).toBe('user');
    // Strict alternation — the server rejects anything else with 400.
    for (let i = 1; i < b.messages.length; i++) {
      expect(b.messages[i].role).not.toBe(b.messages[i - 1].role);
    }
  }
});

test('falls back to a local answer when the backend fails — never a dead chat', async ({ page }) => {
  await page.route(CHAT_ROUTE, (route) => route.abort('failed'));

  const messages = await openChat(page);
  await sendMessage(page, 'איפה הסטודיו?');

  // The offline table knows the address; the customer must still get help.
  await expect(messages).toContainText('רש"י 11', { timeout: 10_000 });
});

test('shows the server message when the chat is switched off (503)', async ({ page }) => {
  await page.route(CHAT_ROUTE, (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'chat_disabled', message: 'הצ׳אט אינו זמין כרגע' }),
  }));

  const messages = await openChat(page);
  await sendMessage(page, 'שלום');
  await expect(messages).toContainText('אינו זמין כרגע', { timeout: 10_000 });
});

test('every welcome quick-reply chip produces an answer — no dead chips', async ({ page }) => {
  // Offline mode exercises the local table, which is where a chip with no
  // matching keyword would surface as "לא הצלחתי להבין".
  await page.route(CHAT_ROUTE, (route) => route.abort('failed'));

  await page.goto('/');
  await page.locator('#chat-bubble').click();
  const count = await page.locator('.cmsg-qr .cqr-chip').count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    // Clear the saved conversation, otherwise the reload restores history
    // instead of the welcome message and the welcome chips are gone.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('#chat-bubble').click();

    const chip = page.locator('.cmsg-qr .cqr-chip').nth(i);
    await expect(chip).toBeVisible();
    const label = (await chip.textContent())?.trim();
    expect(label, 'chip label should not be empty').toBeTruthy();

    await chip.click();
    await expect(page.locator('#chat-messages'), 'dead chip: ' + label)
      .not.toContainText('לא הצלחתי להבין', { timeout: 10_000 });
  }
});

test('conversation survives a page reload', async ({ page }) => {
  await page.route(CHAT_ROUTE, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ reply: 'תשובה ייחודית לבדיקה' }),
  }));

  await openChat(page);
  await sendMessage(page, 'שאלה לבדיקת היסטוריה');
  await expect(page.locator('#chat-messages')).toContainText('תשובה ייחודית לבדיקה', { timeout: 10_000 });

  await page.reload();
  await page.locator('#chat-bubble').click();
  await expect(page.locator('#chat-messages')).toContainText('תשובה ייחודית לבדיקה', { timeout: 10_000 });
});

test('widget loads with no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.route(CHAT_ROUTE, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'ok' }),
  }));

  await openChat(page);
  await sendMessage(page, 'שלום');
  await expect(page.locator('#chat-messages')).toContainText('ok', { timeout: 10_000 });

  // Ignore unrelated network noise (analytics/fonts) — we care about JS faults.
  const real = errors.filter((e) => !/Failed to load resource|net::ERR/i.test(e));
  expect(real, 'chat widget must not raise JS errors:\n' + real.join('\n')).toHaveLength(0);
});

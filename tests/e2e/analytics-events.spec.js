/**
 * Analytics event coverage — the CTAs and chat entry points that were silent.
 *
 * These assert the *emission* contract only. Rather than reach into the module
 * that owns trackEvent, each test listens for the CustomEvent the page dispatches
 * and, where it matters, inspects the real POST to /track. That keeps the tests
 * honest about what actually leaves the browser.
 */
import { test, expect } from '../support/test-base.js'

const TRACK_ROUTE = '**/functions/v1/track'
const CHAT_ROUTE  = '**/functions/v1/chat-handler'

/**
 * Let the real analytics modules load.
 *
 * tests/support/test-base.js stubs out lib/analytics.js and landing-analytics.js
 * for every spec, so that mixpanel-browser's bare specifier cannot crash a page
 * that is being tested for something else. That stub also makes trackEvent a
 * no-op — which is exactly what THIS spec needs to observe, so it opts back in.
 */
async function enableRealAnalytics(page) {
  await page.unroute('**/lib/analytics.js')
  await page.unroute('**/landing-analytics.js')
}

/**
 * Collect every event POSTed to /track, and stop them leaving the machine.
 *
 * analytics.js prefers navigator.sendBeacon with a Blob body, so postData()
 * returns null — the bytes are only reachable through postDataBuffer().
 */
async function captureTrack(page) {
  await enableRealAnalytics(page)
  const events = []
  await page.route(TRACK_ROUTE, async (route) => {
    try {
      const buf = route.request().postDataBuffer()
      const raw = buf ? buf.toString('utf8') : route.request().postData()
      if (raw) events.push(JSON.parse(raw))
    } catch { /* malformed body is itself a failure the assertions will catch */ }
    await route.fulfill({ status: 204, body: '' })
  })
  return events
}

async function waitForChatReady(page) {
  await expect
    .poll(() => page.locator('#chat-messages > *').count(), { timeout: 15_000 })
    .toBeGreaterThan(0)
}

test('hero WhatsApp CTA is a real wa.me link and reports a click', async ({ page }) => {
  const seen = []
  await page.goto('/')
  await page.evaluate(() => {
    window.__wa = []
    document.addEventListener('wa:click', (e) => window.__wa.push(e.detail))
  })

  const hero = page.locator('#hero-cta a.btn-primary')
  await expect(hero).toBeVisible()

  // A real href matters twice over: it is what the analytics delegation matches,
  // and it is what makes the button work with JS disabled. It was href="#".
  const href = await hero.getAttribute('href')
  expect(href).toContain('wa.me')

  // Stop the popup, keep the handler.
  await page.evaluate(() => { window.open = () => null })
  await hero.click()

  const wa = await page.evaluate(() => window.__wa)
  expect(wa).toHaveLength(1)
  expect(wa[0].source).toBe('hero')
  expect(seen).toEqual([])
})

test('sticky bar WhatsApp CTA has a real href and reports its own source', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    window.__wa = []
    document.addEventListener('wa:click', (e) => window.__wa.push(e.detail))
    window.open = () => null
  })

  const sticky = page.locator('#sticky-book a').first()
  expect(await sticky.getAttribute('href')).toContain('wa.me')

  // #sticky-book is pointer-events:none until initStickyBook adds .visible when
  // the hero scrolls out. Forcing the click would just pass through to whatever
  // is underneath, so wait for the real state rather than bypassing it.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
  await expect(page.locator('#sticky-book')).toHaveClass(/visible/, { timeout: 10_000 })
  await sticky.click()

  const wa = await page.evaluate(() => window.__wa)
  expect(wa[0]?.source).toBe('sticky_bar')
})

test('quick-reply chips emit chat:sent — they used to count as zero messages', async ({ page }) => {
  await page.route(CHAT_ROUTE, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ reply: 'תשובה' }),
  }))

  await page.goto('/')
  await page.evaluate(() => {
    window.__sent = []
    window.__qr = []
    document.addEventListener('chat:sent',      (e) => window.__sent.push(e.detail))
    document.addEventListener('chat:quickreply', (e) => window.__qr.push(e.detail))
  })

  await waitForChatReady(page)
  await page.locator('#chat-bubble').click()

  const chip = page.locator('.cmsg-qr .cqr-chip').first()
  const label = (await chip.textContent())?.trim()
  await chip.click()
  await expect(page.locator('#chat-messages')).toContainText('תשובה', { timeout: 10_000 })

  const qr = await page.evaluate(() => window.__qr)
  expect(qr).toHaveLength(1)
  expect(qr[0].label).toBe(label)

  // The regression that mattered: a chip send must still count as a message.
  const sent = await page.evaluate(() => window.__sent)
  expect(sent).toHaveLength(1)
  expect(sent[0].via).toBe('quick_reply')
  expect(sent[0].message_length).toBeGreaterThan(0)
})

test('typed messages still report via=input', async ({ page }) => {
  await page.route(CHAT_ROUTE, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ reply: 'תשובה' }),
  }))

  await page.goto('/')
  await page.evaluate(() => {
    window.__sent = []
    document.addEventListener('chat:sent', (e) => window.__sent.push(e.detail))
  })
  await waitForChatReady(page)
  await page.locator('#chat-bubble').click()
  await page.locator('#chat-input').fill('שאלה חופשית')
  await page.locator('#chat-send').click()
  await expect(page.locator('#chat-messages')).toContainText('תשובה', { timeout: 10_000 })

  const sent = await page.evaluate(() => window.__sent)
  expect(sent).toHaveLength(1)
  expect(sent[0].via).toBe('input')
})

test('UTM parameters are captured and attached to the landing event', async ({ page }) => {
  const events = await captureTrack(page)
  await page.goto('/?utm_source=instagram&utm_medium=bio&utm_campaign=summer')
  await expect.poll(() => events.length, { timeout: 15_000 }).toBeGreaterThan(0)

  const landing = events.find((e) => e.event === 'landing_page_viewed')
  expect(landing, 'landing_page_viewed must be sent').toBeTruthy()
  expect(landing.props.utm_source).toBe('instagram')
  expect(landing.props.utm_medium).toBe('bio')
  expect(landing.props.utm_campaign).toBe('summer')
})

test('every event sent to /track carries a session_id and passes the PII guard', async ({ page }) => {
  const events = await captureTrack(page)
  await page.goto('/')
  await expect.poll(() => events.length, { timeout: 15_000 }).toBeGreaterThan(0)

  // Mirrors PII_RE in supabase/functions/track/index.ts, which 400s the whole
  // event rather than sanitising it — including any run of 9+ digits.
  const PII_RE = /(\+?972|0)5\d[- ]?\d{3}[- ]?\d{4}|\d{9,}/

  for (const e of events) {
    expect(e.session_id, 'session_id is required by track/index.ts').toBeTruthy()
    expect(e.event).toBeTruthy()
    expect(PII_RE.test(JSON.stringify(e)), 'event would be rejected as PII: ' + e.event).toBe(false)
  }
})

test('section_viewed fires for sections that previously had no coverage', async ({ page }) => {
  const events = await captureTrack(page)
  await page.goto('/')

  // #services and #gallery carry the actual offer and were both unobserved.
  for (const id of ['services', 'gallery']) {
    await page.locator('#' + id).scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
  }

  await expect
    .poll(() => events.filter((e) => e.event === 'section_viewed').map((e) => e.props.section),
          { timeout: 15_000 })
    .toEqual(expect.arrayContaining(['services', 'gallery']))
})

// System launch date — all "since launch" and "all time" queries start here.
// Pre-launch Twilio account activity is excluded.
const SYSTEM_START = '2026-06-01'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function weekStart(): string {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const sun = new Date(now)
  sun.setDate(now.getDate() - day)
  return isoDate(sun)
}

function yearStart(): string {
  return SYSTEM_START
}

async function twilio(sid: string, token: string, path: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`
  const r = await fetch(url, {
    headers: {
      'Authorization': 'Basic ' + btoa(`${sid}:${token}`),
    },
  })
  if (!r.ok) throw new Error(`Twilio ${path}: HTTP ${r.status}`)
  return r.json()
}

function extractSpend(usageJson: Record<string, unknown>): string {
  const records = (usageJson.usage_records ?? usageJson.usage_records_today ?? []) as Array<{ price?: string }>
  if (!records.length) return '0.00'
  const total = records.reduce((sum, r) => sum + Math.abs(parseFloat(r.price ?? '0')), 0)
  return total.toFixed(4)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const body = await req.json()
    const { adminToken } = body

    const expectedToken = Deno.env.get('ADMIN_TOKEN')
    if (!adminToken || !expectedToken || adminToken !== expectedToken) {
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    const sid   = (Deno.env.get('TWILIO_ACCOUNT_SID') ?? '').trim()
    const token = (Deno.env.get('TWILIO_AUTH_TOKEN')  ?? '').trim()
    if (!sid || !token) {
      return json({ success: false, error: 'twilio_secrets_missing' }, 500)
    }

    const today  = isoDate(new Date())
    const rawWeek = weekStart()
    const weekS  = rawWeek < SYSTEM_START ? SYSTEM_START : rawWeek  // never before launch

    // Use allSettled so a single Twilio API hiccup only blanks that one field,
    // not the entire card.
    const [balR, todayR, weekR, monthR, sinceR] = await Promise.allSettled([
      twilio(sid, token, '/Balance.json'),
      twilio(sid, token, '/Usage/Records/Today.json?Category=sms-outbound'),
      twilio(sid, token, `/Usage/Records.json?Category=sms-outbound&StartDate=${weekS}&EndDate=${today}`),
      twilio(sid, token, '/Usage/Records/ThisMonth.json?Category=sms-outbound'),
      // "since launch" covers both year-since-launch and all-time (same range)
      twilio(sid, token, `/Usage/Records.json?Category=sms-outbound&StartDate=${SYSTEM_START}&EndDate=${today}`),
    ])

    const ok  = (r: PromiseSettledResult<unknown>) => r.status === 'fulfilled' ? r.value as Record<string, unknown> : null
    const bal = ok(balR)
    const sinceData = ok(sinceR)

    return json({
      success: true,
      balance: bal
        ? { amount: parseFloat(bal.balance as string ?? '0').toFixed(2), currency: (bal.currency as string) ?? 'USD' }
        : null,
      spend: {
        today:   ok(todayR)  ? extractSpend(ok(todayR)!)  : null,
        week:    ok(weekR)   ? extractSpend(ok(weekR)!)   : null,
        month:   ok(monthR)  ? extractSpend(ok(monthR)!)  : null,
        year:    sinceData   ? extractSpend(sinceData)    : null,
        allTime: sinceData   ? extractSpend(sinceData)    : null,
        currency: 'USD',
      },
    })
  } catch (err) {
    console.error('[twilio-stats]', err)
    return json({ success: false, error: String(err) }, 500)
  }
})

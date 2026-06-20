// Twilio SMS sender shared by the Edge Functions. Side-effecting (network),
// so it is exercised by live/e2e checks rather than Vitest unit tests.

export interface TwilioCreds {
  accountSid: string
  authToken:  string
  fromNumber: string
}

export function twilioCredsFromEnv(): TwilioCreds | null {
  const accountSid = (Deno.env.get('TWILIO_ACCOUNT_SID') ?? '').trim()
  const authToken  = (Deno.env.get('TWILIO_AUTH_TOKEN')  ?? '').trim()
  const fromNumber = (Deno.env.get('TWILIO_FROM_NUMBER') ?? '').trim()
  if (!accountSid || !authToken || !fromNumber) return null
  return { accountSid, authToken, fromNumber }
}

/** Send one SMS. Throws on non-2xx so callers can log; caller decides fatality. */
export async function sendTwilioSms(to: string, body: string, creds: TwilioCreds): Promise<void> {
  const res = await fetch(
    'https://api.twilio.com/2010-04-01/Accounts/' + creds.accountSid + '/Messages.json',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(creds.accountSid + ':' + creds.authToken),
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: creds.fromNumber, Body: body }),
    },
  )
  if (!res.ok) {
    throw new Error('Twilio ' + res.status + ': ' + (await res.text()).slice(0, 300))
  }
}

/**
 * Send one WhatsApp message via Twilio. Same Messages API as SMS, but To/From
 * are prefixed with 'whatsapp:'. `fromWhatsApp` is the sender (Sandbox:
 * 'whatsapp:+14155238886'; production: your approved Business number).
 *
 * NOTE: free-form text is only deliverable inside the 24h customer-service window
 * (since the customer's last inbound message). Outside it, Twilio requires an
 * approved message template — relevant for proactive notices sent long after the
 * conversation. Throws on non-2xx so callers can log.
 */
export async function sendTwilioWhatsApp(
  to: string,
  body: string,
  creds: TwilioCreds,
  fromWhatsApp: string,
): Promise<void> {
  const toWa   = to.startsWith('whatsapp:')           ? to           : 'whatsapp:' + to
  const fromWa = fromWhatsApp.startsWith('whatsapp:') ? fromWhatsApp : 'whatsapp:' + fromWhatsApp
  const res = await fetch(
    'https://api.twilio.com/2010-04-01/Accounts/' + creds.accountSid + '/Messages.json',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(creds.accountSid + ':' + creds.authToken),
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: toWa, From: fromWa, Body: body }),
    },
  )
  if (!res.ok) {
    throw new Error('Twilio WA ' + res.status + ': ' + (await res.text()).slice(0, 300))
  }
}

#!/usr/bin/env node
/**
 * Manual integration test for WhatsApp booking flow
 * Tests: booking creation → admin notification → approval → client response
 */

const http = require('http');
const crypto = require('crypto');

const CONFIG = {
  SUPABASE_URL: process.env.SUPABASE_URL || 'http://localhost:54321',
  ANON_KEY: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheHpwZGZzcWRuamxheWdmdnJsIiwiYXVkIjoicG9zdGdyZXMiLCJpYXQiOjE3MTgzMzA3NzMsImV4cCI6MjAzMzkwNjc3M30.dXRzMEUxOWlrR3lVQzVKeGZqNzdSTDJDd01RdEZJOXhXSEo1ZGE1Y1p3TT0',
  TEST_PHONE: '+972501234567',
  TEST_NAME: 'דנה טסט',
};

function log(label, msg, obj) {
  console.log(`\n[${label}] ${msg}`);
  if (obj) console.log(JSON.stringify(obj, null, 2));
}

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.SUPABASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CONFIG.ANON_KEY,
      },
    };

    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null,
            headers: res.headers,
          });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });

    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function test() {
  try {
    log('SETUP', 'Testing WhatsApp booking flow...');

    // 1. Check if a customer exists or create one
    log('STEP 1', 'Looking up customer by phone');
    const clientRes = await req('GET', `/rest/v1/clients?phone=eq.${encodeURIComponent(CONFIG.TEST_PHONE)}`);
    let clientId = clientRes.body?.[0]?.id;

    if (!clientId) {
      log('STEP 1b', 'Creating new customer');
      const createRes = await req('POST', '/rest/v1/clients', {
        phone: CONFIG.TEST_PHONE,
        full_name: CONFIG.TEST_NAME,
      });
      clientId = createRes.body?.id;
      log('STEP 1b RESULT', 'Customer created', { clientId });
    } else {
      log('STEP 1 RESULT', 'Customer exists', { clientId });
    }

    // 2. Get available slots
    log('STEP 2', 'Fetching available slots');
    const slotsRes = await req('GET', '/rest/v1/slots?status=eq.available&limit=1&order=start_time.asc');
    const slot = slotsRes.body?.[0];
    if (!slot) {
      log('ERROR', 'No available slots found');
      return;
    }
    log('STEP 2 RESULT', 'Got slot', { slot_id: slot.id, start_time: slot.start_time });

    // 3. Simulate WhatsApp booking (this should trigger the bot's book_appointment tool)
    log('STEP 3', 'Simulating WhatsApp message → booking');
    const bookRes = await req('POST', '/functions/v1/chat-handler', {
      messages: [
        {
          role: 'user',
          content: `היי, אני רוצה להזמין תור. יש לי ${CONFIG.TEST_NAME}, המספר שלי ${CONFIG.TEST_PHONE}. אני רוצה gel_hands ביום מחר ב-10:00`,
        },
      ],
    });
    log('STEP 3 RESULT', 'Chat response', { reply: bookRes.body?.reply });

    // 4. Check if appointment was created
    log('STEP 4', 'Looking for newly created appointment');
    const apptsRes = await req('GET', `/rest/v1/appointments?client_id=eq.${clientId}&status=eq.Pending&order=created_at.desc&limit=1`);
    const appt = apptsRes.body?.[0];
    if (!appt) {
      log('WARNING', 'No pending appointment found - booking may have failed');
      log('DIAG', 'Checking communication logs for AdminNotify');
      const logsRes = await req('GET', `/rest/v1/communication_logs?context=eq.AdminNotify&order=created_at.desc&limit=5`);
      log('Communication logs', null, logsRes.body);
      return;
    }
    log('STEP 4 RESULT', 'Appointment created', { appt_id: appt.id, status: appt.status });

    // 5. Check admin notifications were sent
    log('STEP 5', 'Checking if admin notification was sent');
    const adminLogsRes = await req('GET', `/rest/v1/communication_logs?appointment_id=eq.${appt.id}&context=eq.AdminNotify`);
    const adminLog = adminLogsRes.body?.[0];
    if (!adminLog) {
      log('ERROR', 'Admin notification SMS was NOT sent!');
    } else {
      log('STEP 5 RESULT', 'Admin notification sent', {
        status: adminLog.status,
        channel: adminLog.channel,
        message: adminLog.message_body,
      });
    }

    // 6. Simulate admin approval
    log('STEP 6', 'Simulating admin approval');
    const approveRes = await req('POST', '/functions/v1/change-status', {
      bookingId: appt.id,
      targetStatus: 'Approved',
    });
    log('STEP 6 RESULT', 'Approval response', approveRes.body);

    // 7. Check if client notification was sent
    log('STEP 7', 'Checking if client was notified about approval');
    const clientLogsRes = await req('GET', `/rest/v1/communication_logs?appointment_id=eq.${appt.id}&context=eq.ClientApproval`);
    const clientLog = clientLogsRes.body?.[0];
    if (!clientLog) {
      log('ERROR', 'Client approval notification was NOT sent!');
    } else {
      log('STEP 7 RESULT', 'Client notification sent', {
        status: clientLog.status,
        channel: clientLog.channel,
        recipient: clientLog.recipient_phone,
      });
    }

    log('SUCCESS', 'All steps completed');
  } catch (e) {
    log('ERROR', 'Test failed', { message: e.message, stack: e.stack });
  }
}

test();

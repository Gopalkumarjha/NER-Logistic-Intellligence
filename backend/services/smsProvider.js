/**
 * SMS provider abstraction. Reads credentials ONLY from process.env — never hardcoded.
 * Currently supports Twilio. To add another provider, implement sendViaXyz() with the
 * same (to, body) -> {success, sid?} contract and branch on SMS_PROVIDER below.
 */

function isTwilioConfigured() {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

async function sendViaTwilio(to, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  // Lazy import so the app doesn't crash if 'twilio' isn't installed and unused.
  let twilio;
  try {
    twilio = (await import('twilio')).default;
  } catch (e) {
    throw new Error("SMS provider package 'twilio' is not installed on the server.");
  }

  const client = twilio(accountSid, authToken);
  const message = await client.messages.create({
    body,
    from: fromNumber,
    to,
  });

  return { success: true, sid: message.sid };
}

// Checks if ANY supported provider is fully configured.
export function isSmsConfigured() {
  const provider = (process.env.SMS_PROVIDER || 'twilio').toLowerCase();
  if (provider === 'twilio') return isTwilioConfigured();
  return false;
}

// Sends an SMS via the configured provider. Throws a descriptive error on any failure —
// callers must NOT report success unless this resolves without throwing.
export async function sendSms(to, body) {
  if (!to) {
    throw new Error('No emergency contact number is configured on the server.');
  }

  const provider = (process.env.SMS_PROVIDER || 'twilio').toLowerCase();

  if (provider === 'twilio') {
    if (!isTwilioConfigured()) {
      throw new Error('Twilio credentials are not configured on the server (see backend/.env.example).');
    }
    return sendViaTwilio(to, body);
  }

  throw new Error(`Unsupported SMS_PROVIDER "${provider}".`);
}

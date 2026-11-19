export default async function handler(_req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ids = (process.env.TELEGRAM_CHAT_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!token || !ids.length) return res.status(200).json({ telegramConfigured: false, smsConfigured: false, telegramTokenValid: false, telegramRecipientsReachable: false });
  try {
    const [meResponse, ...chatResponses] = await Promise.all([
      fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(5000) }),
      ...ids.map((chatId) => fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`, { signal: AbortSignal.timeout(5000) })),
    ]);
    const me = await meResponse.json();
    const chatResults = await Promise.all(chatResponses.map(async (response) => {
      try { return response.ok && (await response.json()).ok === true; } catch { return false; }
    }));
    const tokenValid = meResponse.ok && me.ok === true;
    const recipientsReachable = chatResults.every(Boolean);
    const ready = tokenValid && recipientsReachable;
    res.status(200).json({ telegramConfigured: ready, smsConfigured: ready, telegramTokenValid: tokenValid, telegramRecipientsReachable: recipientsReachable });
  } catch {
    res.status(200).json({ telegramConfigured: false, smsConfigured: false, telegramTokenValid: false, telegramRecipientsReachable: false });
  }
}

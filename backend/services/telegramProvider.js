const TELEGRAM_API = 'https://api.telegram.org';

export function isTelegramConfigured() {
  return !!(
    process.env.TELEGRAM_BOT_TOKEN &&
    process.env.TELEGRAM_CHAT_IDS
  );
}

export async function sendTelegramMessage(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  if (!token || chatIds.length === 0) {
    throw new Error('Telegram credentials are not configured.');
  }

  const results = [];

  for (const chatId of chatIds) {
    const response = await fetch(
      `${TELEGRAM_API}/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(
        data.description || `Failed to send Telegram message to ${chatId}.`
      );
    }

    results.push({
      chatId,
      messageId: data.result?.message_id || null,
    });
  }

  return {
    success: true,
    messageIds: results,
  };
}
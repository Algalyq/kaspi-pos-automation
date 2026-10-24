import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBHOOKS_FILE = path.join(__dirname, '..', 'webhooks.json');

const ALL_EVENTS = ['payment.success', 'payment.failed', 'payment.expired', 'payment.lost'];

/**
 * Читает webhooks.json и возвращает массив вебхуков.
 * При ошибке чтения/парсинга возвращает [].
 * POS_WEBHOOK_URL(+POS_WEBHOOK_SECRET) переопределяет файл — удобно
 * для контейнерного деплоя, где webhooks.json запечён в образ.
 */
export const loadWebhooks = () => {
  if (process.env.POS_WEBHOOK_URL) {
    return [
      {
        url: process.env.POS_WEBHOOK_URL,
        events: ALL_EVENTS,
        secret: process.env.POS_WEBHOOK_SECRET || '',
      },
    ];
  }
  try {
    const raw = fs.readFileSync(WEBHOOKS_FILE, 'utf8');
    const hooks = JSON.parse(raw);
    if (!Array.isArray(hooks)) return [];
    return hooks;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[WEBHOOK STORE] Error reading webhooks.json:', err.message);
    }
    return [];
  }
};

/**
 * Возвращает вебхуки, подписанные на указанное событие.
 */
export const getWebhooksByEvent = (event) => {
  return loadWebhooks().filter((hook) => hook.url && Array.isArray(hook.events) && hook.events.includes(event));
};

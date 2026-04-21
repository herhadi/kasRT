import { pool } from '../db.js';
import { sendTelegramMessage } from './telegramService.js';

export async function notifyRoles(roleNames, message) {
  if (!Array.isArray(roleNames) || roleNames.length === 0) return;

  const recipients = await pool.query(
    `SELECT DISTINCT u.telegram_chat_id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = ANY($1::text[])
       AND u.telegram_chat_id IS NOT NULL
       AND TRIM(u.telegram_chat_id) <> ''`,
    [roleNames]
  );

  await Promise.all(
    recipients.rows.map((row) => sendTelegramMessage(row.telegram_chat_id, message))
  );
}

export async function notifyUser(userId, message) {
  const result = await pool.query(
    `SELECT telegram_chat_id
     FROM users
     WHERE id = $1
       AND telegram_chat_id IS NOT NULL
       AND TRIM(telegram_chat_id) <> ''`,
    [userId]
  );

  if (result.rows.length === 0) return;

  await sendTelegramMessage(result.rows[0].telegram_chat_id, message);
}

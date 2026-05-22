import { pool } from '../db.js';

export async function findUserByTelegramChatId(chatId) {
  const result = await pool.query(
    `SELECT nama
     FROM users
     WHERE telegram_chat_id = $1
     LIMIT 1`,
    [chatId]
  );
  return result.rows[0] || null;
}

export async function createTelegramActivationToken({ userId, code }) {
  await pool.query(
    `INSERT INTO telegram_link_tokens (user_id, code, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
    [userId, code]
  );
}

export async function linkTelegramChatWithCode({ code, chatId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tokenResult = await client.query(
      `SELECT tlt.id, tlt.user_id, u.nama
       FROM telegram_link_tokens tlt
       JOIN users u ON u.id::text = tlt.user_id::text
       WHERE code = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [code]
    );

    if (tokenResult.rowCount === 0) {
      await client.query('COMMIT');
      return null;
    }

    const token = tokenResult.rows[0];

    await client.query(
      `UPDATE users
       SET telegram_chat_id = $1
       WHERE id = $2`,
      [chatId, token.user_id]
    );

    await client.query(
      `UPDATE telegram_link_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [token.id]
    );

    await client.query('COMMIT');
    return token;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function clearTelegramChatByUserId(userId) {
  const result = await pool.query(
    `UPDATE users
     SET telegram_chat_id = NULL
     WHERE id::text = $1::text
     RETURNING id`,
    [userId]
  );
  return result.rowCount > 0;
}

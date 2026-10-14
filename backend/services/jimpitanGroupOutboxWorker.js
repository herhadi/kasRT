import { getJimpitanDailyRecapByMonth } from '../models/jimpitanModel.js';
import {
  claimJimpitanGroupNotification,
  ensureJimpitanGroupOutboxTable,
  finishJimpitanGroupNotification,
  getJimpitanGroupMessageState,
  saveJimpitanGroupMessageState
} from '../models/jimpitanGroupOutboxModel.js';
import { formatMonthlyJimpitanShare } from './jimpitanShareFormatter.js';
import { editWaJimpitanGroupMessage, getWaJimpitanReminderSettings, sendWaJimpitanGroupMessage } from './waLabReminderService.js';

const MAX_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 5000;
let running = false;
let timer = null;

function retryDelayMs(attempt) {
  return Math.min(30 * 60_000, 15_000 * (2 ** Math.max(0, attempt - 1)));
}

async function processOne() {
  const job = await claimJimpitanGroupNotification();
  if (!job) return false;
  let deliveryConfirmed = false;

  try {
    const recap = await getJimpitanDailyRecapByMonth(job.month_key);
    const text = formatMonthlyJimpitanShare({ month: job.month_key, days: recap.days });
    const messageState = await getJimpitanGroupMessageState(job.operational_date);
    let result;

    if (messageState) {
      result = await editWaJimpitanGroupMessage({
        jid: messageState.group_jid,
        messageId: messageState.message_id,
        text
      });
      if (result?.success === true) {
        deliveryConfirmed = true;
        await saveJimpitanGroupMessageState({
          operationalDate: job.operational_date,
          monthKey: job.month_key,
          groupJid: messageState.group_jid,
          messageId: messageState.message_id,
          messageText: text
        });
      }
    } else {
      result = await sendWaJimpitanGroupMessage({ text });
      if (result?.success === true) {
        deliveryConfirmed = true;
        if (!result.message_id) {
          await finishJimpitanGroupNotification(job.id, { status: 'UNCERTAIN', error: 'WhatsApp accepted message but returned no message ID; cannot safely update this date later' });
          console.error(`[WA JIMPITAN GROUP] outbox #${job.id} sent but message ID is missing`);
          return true;
        }
        const settings = await getWaJimpitanReminderSettings();
        await saveJimpitanGroupMessageState({
          operationalDate: job.operational_date,
          monthKey: job.month_key,
          groupJid: result.jid || settings.group_jid,
          messageId: result.message_id,
          messageText: text
        });
      }
    }

    if (result?.success === true) {
      await finishJimpitanGroupNotification(job.id, { status: 'SENT' });
      console.info(`[WA JIMPITAN GROUP] outbox #${job.id} ${messageState ? 'updated' : 'sent'} daily message for ${job.operational_date} (attempt ${job.attempts}, context=${job.context})`);
      return true;
    }
    if (result?.skipped === true) {
      await finishJimpitanGroupNotification(job.id, { status: 'SKIPPED', error: result.reason || 'Pengiriman dilewati' });
      console.warn(`[WA JIMPITAN GROUP] outbox #${job.id} skipped: ${result.reason || 'not configured'}`);
      return true;
    }

    const error = result?.error || 'Pengiriman gagal tanpa keterangan';
    if (result?.delivery_uncertain === true) {
      await finishJimpitanGroupNotification(job.id, { status: 'UNCERTAIN', error });
      console.error(`[WA JIMPITAN GROUP] outbox #${job.id} uncertain; tidak diulang otomatis untuk menghindari pesan ganda: ${error}`);
      return true;
    }
    if (result?.retryable === false || job.attempts >= MAX_ATTEMPTS) {
      await finishJimpitanGroupNotification(job.id, { status: 'FAILED', error });
      console.error(`[WA JIMPITAN GROUP] outbox #${job.id} permanently failed after ${job.attempts} attempt(s): ${error}`);
      return true;
    }

    const delay = retryDelayMs(job.attempts);
    await finishJimpitanGroupNotification(job.id, { status: 'PENDING', error, retryDelayMs: delay });
    console.warn(`[WA JIMPITAN GROUP] outbox #${job.id} attempt ${job.attempts} failed; retry in ${Math.round(delay / 1000)}s: ${error}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (deliveryConfirmed) {
      await finishJimpitanGroupNotification(job.id, { status: 'UNCERTAIN', error: `WhatsApp accepted message but saving message state failed: ${message}` });
      console.error(`[WA JIMPITAN GROUP] outbox #${job.id} delivery confirmed but message state could not be saved: ${message}`);
    } else if (job.attempts >= MAX_ATTEMPTS) {
      await finishJimpitanGroupNotification(job.id, { status: 'FAILED', error: message });
    } else {
      await finishJimpitanGroupNotification(job.id, { status: 'PENDING', error: message, retryDelayMs: retryDelayMs(job.attempts) });
    }
    console.error(`[WA JIMPITAN GROUP] outbox #${job.id} worker error: ${message}`);
    return true;
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    // Drain a small batch each tick while keeping a single worker loop per process.
    for (let count = 0; count < 10; count += 1) {
      if (!(await processOne())) break;
    }
  } catch (error) {
    console.error('[WA JIMPITAN GROUP] outbox poll failed:', error.message);
  } finally {
    running = false;
  }
}

export async function startJimpitanGroupOutboxWorker() {
  await ensureJimpitanGroupOutboxTable();
  if (timer) return;
  console.info('[WA JIMPITAN GROUP] persistent outbox worker started');
  void tick();
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  timer.unref?.();
}

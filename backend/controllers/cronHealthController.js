import { getLatestCronHealthLog, insertCronHealthLog, listLatestCronHealthLogs } from '../models/cronHealthModel.js';
import { listLatestJimpitanReminderLogs } from '../models/jimpitanModel.js';
import { notifyRoles } from '../services/approvalNotifier.js';

function parseJsonPayload(value) {
  if (!value || typeof value !== 'object') return null;
  return value;
}

function formatDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export async function cronHealthPing(req, res) {
  const configuredSecret = String(process.env.CRON_SECRET || '').trim();
  const incomingSecret = String(req.headers['x-cron-secret'] || '').trim();
  const authHeader = String(req.headers.authorization || '');
  const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (configuredSecret && incomingSecret !== configuredSecret && bearerSecret !== configuredSecret) {
    return res.status(403).json({ success: false, message: 'Forbidden: invalid cron secret' });
  }

  const body = req.body || {};
  const shouldNotifyRoot = body.notify_root !== false;
  const row = await insertCronHealthLog({
    jobName: String(body.job_name || 'vercel-cron').trim(),
    source: String(body.source || 'frontend-api-cron').trim(),
    status: String(body.status || 'OK').trim(),
    message: body.message ? String(body.message) : null,
    payload: parseJsonPayload(body.payload)
  });

  if (shouldNotifyRoot) {
    await notifyRoles(
      ['root'],
      `✅ <b>Cron KasRT Terpanggil</b>\n` +
        `Job: <b>${row.job_name}</b>\n` +
        `Source: <b>${row.source}</b>\n` +
        `Status: <b>${row.status}</b>\n` +
        `Waktu: <b>${new Date(row.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</b>`
    );
  }

  return res.json({ success: true, data: row });
}

export async function cronHealthStatus(req, res) {
  const jobName = String(req.query.job_name || 'kasrt-jimpitan-reminder').trim();
  const healthJobName = String(req.query.health_job_name || 'vercel-cron').trim();
  const healthLogs = await listLatestCronHealthLogs(healthJobName, 20);
  const latestHealth = healthLogs[0] || await getLatestCronHealthLog(healthJobName);
  const reminderRows = await listLatestJimpitanReminderLogs(20);
  const reminderLogs = reminderRows.map((row) => {
    const reminderDate = formatDateOnly(row.reminder_date);
    return {
      id: `jimpitan-reminder-${row.id}`,
      job_name: jobName,
      source: 'debian-cron-backend',
      status: String(row.reminder_type || '').includes('_TEST_') ? 'TEST_REMINDER' : 'REMINDER_SENT',
      message: `Reminder ${row.reminder_type} untuk ${reminderDate || '-'}`,
      payload: {
        reminder_result: {
          success: true,
          message: 'Reminder tercatat di backend',
          total_target: row.total_recipients,
          total_recipients: row.total_recipients,
          reminder_date: reminderDate,
          reminder_type: row.reminder_type
        }
      },
      created_at: row.sent_at
    };
  });
  const logs = [...reminderLogs, ...healthLogs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);
  const latest = logs[0] || latestHealth || null;
  const now = Date.now();
  const lastRunAt = latest?.created_at ? new Date(latest.created_at).getTime() : null;
  const ageSeconds = lastRunAt ? Math.max(0, Math.round((now - lastRunAt) / 1000)) : null;

  return res.json({
    success: true,
    data: {
      job_name: jobName,
      health_job_name: healthJobName,
      latest,
      logs,
      age_seconds: ageSeconds,
      checked_at: new Date().toISOString()
    }
  });
}

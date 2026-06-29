import { listLatestJimpitanReminderLogs } from '../models/jimpitanModel.js';

function formatDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export async function cronHealthStatus(req, res) {
  const jobName = String(req.query.job_name || 'kasrt-jimpitan-reminder').trim();
  const reminderRows = await listLatestJimpitanReminderLogs(20);
  const logs = reminderRows.map((row) => {
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
  const latest = logs[0] || null;
  const now = Date.now();
  const lastRunAt = latest?.created_at ? new Date(latest.created_at).getTime() : null;
  const ageSeconds = lastRunAt ? Math.max(0, Math.round((now - lastRunAt) / 1000)) : null;

  return res.json({
    success: true,
    data: {
      job_name: jobName,
      latest,
      logs,
      age_seconds: ageSeconds,
      checked_at: new Date().toISOString()
    }
  });
}

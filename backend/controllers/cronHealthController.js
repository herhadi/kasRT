import { getLatestCronHealthLog, insertCronHealthLog } from '../models/cronHealthModel.js';

function parseJsonPayload(value) {
  if (!value || typeof value !== 'object') return null;
  return value;
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
  const row = await insertCronHealthLog({
    jobName: String(body.job_name || 'vercel-cron').trim(),
    source: String(body.source || 'frontend-api-cron').trim(),
    status: String(body.status || 'OK').trim(),
    message: body.message ? String(body.message) : null,
    payload: parseJsonPayload(body.payload)
  });

  return res.json({ success: true, data: row });
}

export async function cronHealthStatus(req, res) {
  const jobName = String(req.query.job_name || 'vercel-cron').trim();
  const latest = await getLatestCronHealthLog(jobName);
  const now = Date.now();
  const lastRunAt = latest?.created_at ? new Date(latest.created_at).getTime() : null;
  const ageSeconds = lastRunAt ? Math.max(0, Math.round((now - lastRunAt) / 1000)) : null;

  return res.json({
    success: true,
    data: {
      job_name: jobName,
      latest,
      age_seconds: ageSeconds,
      checked_at: new Date().toISOString()
    }
  });
}


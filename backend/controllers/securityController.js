import { createSecurityReport, getSecurityReportsByMonth, updateSecurityReportStatus } from '../models/securityModel.js';

export async function securityReportCreateHandler(req, res) {
  const reportDate = String(req.body.report_date || '').trim();
  const reportTime = String(req.body.report_time || '').trim();
  const category = String(req.body.category || '').trim();
  const location = String(req.body.location || '').trim();
  const summary = String(req.body.summary || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return res.status(400).json({ success: false, message: 'report_date invalid' });
  if (!category) return res.status(400).json({ success: false, message: 'category wajib' });
  if (!location) return res.status(400).json({ success: false, message: 'location wajib' });
  if (!summary) return res.status(400).json({ success: false, message: 'summary wajib' });
  const data = await createSecurityReport({
    reportDate,
    reportTime: reportTime || null,
    category,
    location,
    summary,
    createdBy: String(req.user.user_id || '').trim()
  });
  return res.json({ success: true, data });
}

export async function securityReportListHandler(req, res) {
  const month = String(req.query.month || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ success: false, message: 'month invalid' });
  const data = await getSecurityReportsByMonth(month);
  return res.json({ success: true, data });
}

export async function securityReportStatusHandler(req, res) {
  const id = String(req.body.id || '').trim();
  const status = String(req.body.status || '').trim().toUpperCase();
  if (!id) return res.status(400).json({ success: false, message: 'id wajib' });
  if (!['BARU', 'DIPROSES', 'SELESAI'].includes(status)) return res.status(400).json({ success: false, message: 'status invalid' });
  await updateSecurityReportStatus({ id, status });
  return res.json({ success: true });
}

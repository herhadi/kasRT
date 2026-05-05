import {
  getMeetingAttendanceByMonth,
  getMeetingNoteByMonth,
  upsertMeetingAttendanceByMonth,
  upsertMeetingNoteByMonth
} from '../models/managementModel.js';

export async function getMeetingNote(req, res) {
  const month = String(req.query.month || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ success: false, message: 'month tidak valid (YYYY-MM)' });
  }
  try {
    const data = await getMeetingNoteByMonth(month);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMeetingNote(req, res) {
  const month = String(req.body.month || '').trim();
  const notes = String(req.body.notes || '').trim();
  const meetingDate = String(req.body.meeting_date || '').trim();
  const startTime = String(req.body.start_time || '').trim();
  const agenda = String(req.body.agenda || '').trim();
  const actorId = String(req.user?.user_id || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ success: false, message: 'month tidak valid (YYYY-MM)' });
  }
  if (!notes) {
    return res.status(400).json({ success: false, message: 'notes wajib diisi' });
  }
  if (meetingDate && !/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) {
    return res.status(400).json({ success: false, message: 'meeting_date tidak valid (YYYY-MM-DD)' });
  }
  if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) {
    return res.status(400).json({ success: false, message: 'start_time tidak valid (HH:mm)' });
  }
  try {
    await upsertMeetingNoteByMonth({
      month,
      notes,
      meetingDate: meetingDate || null,
      startTime: startTime || null,
      agenda: agenda || null,
      actorId
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMeetingAttendance(req, res) {
  const month = String(req.query.month || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ success: false, message: 'month tidak valid (YYYY-MM)' });
  }
  try {
    const data = await getMeetingAttendanceByMonth(month);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMeetingAttendance(req, res) {
  const month = String(req.body.month || '').trim();
  const attendance = Array.isArray(req.body.attendance) ? req.body.attendance : [];
  const actorId = String(req.user?.user_id || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ success: false, message: 'month tidak valid (YYYY-MM)' });
  }
  try {
    await upsertMeetingAttendanceByMonth({ month, attendance, actorId });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

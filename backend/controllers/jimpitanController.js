import { pool } from '../db.js';
import { notifyRoles, notifyUser } from '../services/approvalNotifier.js';
import { formatRupiah, sendTelegramMessage } from '../services/telegramService.js';
import { sendWaDirectMessage } from '../services/waLabReminderService.js';
import {
  approvePendingTaggedTransfer,
  createTransfer,
  findPendingTaggedTransferByDescription,
  findWalletByName,
  listTaggedTransfersByCreator
} from '../models/transactionModel.js';
import {
  approveJimpitanBatch,
  createJimpitanExternalDraft,
  createJimpitanExternalParticipant,
  createJimpitanDraftAndUpdateSaldo,
  createJimpitanV2Detail,
  createApprovedShiftTotalIncome,
  createApprovedShiftMonthlyIncome,
  createJimpitanOldCashHandover,
  createSetorBatch,
  createShiftTotalBatch,
  editNominalJimpitanByAdmin,
  findBatchCreator,
  getApprovedBatchRecapByMonth,
  getEffectiveJimpitanMode,
  getJimpitanV2InputStatus,
  getJimpitanModeHistory,
  getJimpitanRouteOrder,
  getUserJimpitanShiftHari,
  isValidJimpitanShiftDay,
  listPetugasByShiftDay,
  listJimpitanByOperationalDate,
  listJimpitanMembers,
  listJimpitanTopups,
  listJimpitanV2AdminEntries,
  getJimpitanDailyRecapByMonth,
  listJimpitanWeeklySchedule,
  listJimpitanExternalParticipants,
  listWargaTotalsInBatch,
  lockDailyJimpitanReminder,
  listUnsentJimpitanWaPhones,
  markJimpitanWaPhoneSent,
  resetBulananJimpitanSaldo,
  saveJimpitanRouteOrder,
  setJimpitanMode,
  setJimpitanMemberStatus,
  setJimpitanExternalParticipantActive,
  topUpJimpitanSaldo,
  updateJimpitanReminderDeliveryLog,
  updatePetugasShiftHari
} from '../models/jimpitanModel.js';
import { delCache, delCacheByPrefix, getCacheJson, setCacheJson } from '../services/cacheService.js';
import { enqueueJimpitanGroupNotification } from '../models/jimpitanGroupOutboxModel.js';
import {
  getWaJimpitanReminderSettings,
  pickRandomValidWaRecipients,
  sendWaJimpitanReminder
} from '../services/waLabReminderService.js';

const TARGET_BULANAN = 15000;
const BIAYA_HARIAN = 500;
const WA_REMINDER_GREETINGS = ['Halo', 'Hai', 'Selamat malam'];

async function scheduleMonthlyJimpitanGroupShare(operationalDate, context = 'notification') {
  try {
    const job = await enqueueJimpitanGroupNotification({ operationalDate, context });
    console.info(`[WA JIMPITAN GROUP] queued outbox #${job.id} (${context})`);
    return job;
  } catch (error) {
    // Do not misreport a committed setoran as failed; surface the enqueue failure loudly.
    console.error(`[WA JIMPITAN GROUP] failed to persist notification (${context}):`, error.message);
    return null;
  }
}

function pickRandomItem(items = []) {
  return items[Math.floor(Math.random() * items.length)] || '';
}

function pickDistinctWaGreetings(count) {
  const shuffled = [...WA_REMINDER_GREETINGS];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[targetIndex]] = [shuffled[targetIndex], shuffled[index]];
  }
  return shuffled.slice(0, Math.max(0, Number(count || 0)));
}

function firstNameOnly(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function escapeTelegramHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildTelegramJimpitanReminderText({ recipient, petugas, targetLabel, testMode }) {
  const alias = String(recipient?.jimpitan_alias || '').trim();
  const name = alias || firstNameOnly(recipient?.nama);
  const greetingLine = name ? '🌙 Halo <b>' + escapeTelegramHtml(name) + '!</b>' : '🌙 Halo!';
  const recipientId = String(recipient?.id || '');
  const colleagues = [...new Set(
    petugas
      .filter((row) => String(row.id) !== recipientId)
      .map((row) => String(row.jimpitan_alias || '').trim() || firstNameOnly(row.nama))
      .filter(Boolean)
  )];
  const colleaguesLine = colleagues.length
    ? '👥 <b>Rekan Ronda Malam Ini:</b>\n' + colleagues.map(escapeTelegramHtml).join(' • ') + '\n\n'
    : '';
  const testingPrefix = testMode ? '🧪 <b>TESTING REMINDER JIMPITAN</b>\n\n' : '';
  const testingSuffix = testMode ? '\n\n<b>AKHIR TESTING - abaikan jika bukan jadwal operasional.</b>' : '';

  return testingPrefix + greetingLine + '\n\n' +
    '⏰ <b>PENGINGAT RONDA &amp; JIMPITAN</b>\n\n' +
    '📅 Hari/Tanggal: ' + escapeTelegramHtml(targetLabel) + '\n\n' +
    colleaguesLine +
    '🕘 <b>Waktu Input Jimpitan:</b>\n21.00–06.00 WIB\n\n' +
    '📱 <b>Buka Halaman Jimpitan:</b>\nhttps://kas02.vercel.app/jimpitan\n\n' +
    '🤝 Terima kasih atas kebersamaan dan partisipasinya. Semoga lingkungan kita selalu aman dan guyub rukun. 🙏' +
    testingSuffix;
}

function buildWaJimpitanReminderText({ recipient, targetLabel, testMode, greeting, colleagues = [] }) {
  const selectedGreeting = greeting || pickRandomItem(WA_REMINDER_GREETINGS);
  const alias = String(recipient?.jimpitan_alias || '').trim();
  const name = alias || firstNameOnly(recipient?.nama);
  const greetingLine = name ? `🌙 ${selectedGreeting} *${name}!*` : `🌙 ${selectedGreeting}!`;
  const colleaguesLine = colleagues.length
    ? `👥 *Rekan Ronda Malam Ini:*\n${colleagues.join(' • ')}\n\n`
    : '';

  return (
    `${testMode ? '🧪 *TESTING REMINDER JIMPITAN*\n\n' : ''}` +
    `${greetingLine}\n\n` +
    `⏰ *PENGINGAT RONDA & JIMPITAN*\n\n` +
    `📅 Hari/Tanggal: ${targetLabel}\n\n` +
    colleaguesLine +
    `🕘 *Waktu Input Jimpitan:*\n21.00–06.00 WIB\n\n` +
    `📱 *Buka Halaman Jimpitan:*\nhttps://kas02.vercel.app/jimpitan\n\n` +
    `🤝 Terima kasih atas kebersamaan dan partisipasinya. Semoga lingkungan kita selalu aman dan guyub rukun. 🙏` +
    `${testMode ? '\n\n*AKHIR TESTING - abaikan jika bukan jadwal operasional.*' : ''}`
  );
}
function buildApprovalLink(path = '/approval') {
  const base =
    process.env.FRONTEND_BASE_URL ||
    process.env.FRONTEND_URL ||
    process.env.APP_BASE_URL ||
    '';

  if (!base) return '';

  const normalized = String(base).trim().replace(/\/+$/, '');
  return `${normalized}${path}`;
}

function getOperationalDate(now = new Date()) {
  const jakartaTime = getJakartaTimeParts(now);
  const [year, month, day] = jakartaTime.dateIso.split('-').map(Number);
  const opDate = new Date(Date.UTC(year, month - 1, day));
  // Operational day: starts at 21:00, ends at 12:00 (noon) next day
  // So if it's before 12:00, we're still in previous day's operational period
  if (jakartaTime.hour < 12) {
    opDate.setDate(opDate.getDate() - 1);
  }
  return opDate;
}

function getOperationalWeekdayNumber(date) {
  return getJakartaTimeParts(date).shiftDay;
}

function getJakartaTimeParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short'
  });
  const parts = formatter.formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap = {
    Sun: 1,
    Mon: 2,
    Tue: 3,
    Wed: 4,
    Thu: 5,
    Fri: 6,
    Sat: 7
  };
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  return {
    hour,
    minute,
    hourMinute: `${map.hour}:${map.minute}`,
    shiftDay: weekdayMap[map.weekday] || null,
    dateIso: `${map.year}-${map.month}-${map.day}`
  };
}

function getShiftDayLabel(shiftDay) {
  const labels = {
    1: 'Ahad',
    2: 'Senin',
    3: 'Selasa',
    4: 'Rabu',
    5: 'Kamis',
    6: "Jum'at",
    7: 'Sabtu'
  };
  return labels[Number(shiftDay)] || `Hari ${shiftDay}`;
}

async function getShiftAccessContext(userId, roles, operationalDate) {
  const normalizedRoles = (roles || []).map((role) => String(role).trim().toLowerCase());
  const isRoot = normalizedRoles.includes('root');
  const isAdminJimpitan = normalizedRoles.includes('admin jimpitan');
  const isBypassRole = isRoot || isAdminJimpitan;
  const shiftHari = await getUserJimpitanShiftHari(userId);
  const hariOperasional = getOperationalWeekdayNumber(operationalDate);
  const canOperate = isBypassRole || (shiftHari !== null && shiftHari === hariOperasional);

  return {
    shiftHari,
    hariOperasional,
    canOperate,
    isBypassRole
  };
}

function canInputByTime(userRoles = [], now = new Date()) {
  const normalizedRoles = userRoles.map((role) => String(role).trim().toLowerCase());
  const isRoot = normalizedRoles.includes('root');
  console.log('[JIMPITAN][SHIFT] role check', { userRoles, normalizedRoles, isRoot });
  if (isRoot) return true;

  const hour = getJakartaTimeParts(now).hour;
  return hour >= 21 || hour < 6;
}

function calculateNominalSaran(saldo, hariKe) {
  const totalKewajibanHarian = hariKe * BIAYA_HARIAN;

  if (saldo >= TARGET_BULANAN || saldo >= totalKewajibanHarian) {
    return 0;
  }

  const kekuranganHarian = totalKewajibanHarian - saldo;
  const sisaPlafonBulanan = TARGET_BULANAN - saldo;
  let nominalSaran = Math.min(kekuranganHarian, sisaPlafonBulanan);

  if (nominalSaran < BIAYA_HARIAN && nominalSaran > 0) {
    nominalSaran = BIAYA_HARIAN;
  }

  return Math.max(nominalSaran, 0);
}

export async function healthCheck(_req, res) {
  return res.json({ message: 'Jimpitan route OK' });
}

export async function inputJimpitan(req, res) {
  const { warga_id, nominal, target_type, external_participant_id } = req.body;
  const petugas_id = req.user.user_id;
  const roles = req.user.roles || [];
  const debug = process.env.DEBUG_JIMPITAN === 'true';
  const targetType = String(target_type || 'WARGA').trim().toUpperCase();
  const externalId = String(external_participant_id || '').trim();

  if (debug) {
    console.log('[JIMPITAN][INPUT] start', {
      warga_id,
      external_participant_id: externalId,
      targetType,
      nominal,
      petugas_id,
      roles
    });
  }

  const tanggalOperasional = getOperationalDate();
  const effectiveMode = await getEffectiveJimpitanMode(tanggalOperasional.toISOString().slice(0, 10));
  if (effectiveMode.mode === 'SHIFT_TOTAL') {
    return res.status(400).json({
      success: false,
      message: 'Mode Jimpitan saat ini setoran total shift. Input per warga sedang tidak aktif.'
    });
  }

  if (!canInputByTime(roles)) {
    if (debug) console.log('[JIMPITAN][INPUT] reject: outside operational time');
    return res.status(403).json({
      success: false,
      message: 'JAM OPERASIONAL TUTUP: input hanya jam 21.00 - 06.00'
    });
  }

  const access = await getShiftAccessContext(petugas_id, roles, tanggalOperasional);
  if (!access.canOperate) {
    return res.status(403).json({
      success: false,
      message: 'Bukan shift Anda hari ini.'
    });
  }

  const nilaiNominal = Number(nominal || 0);
  if (nilaiNominal < 0) {
    return res.status(400).json({ success: false, message: 'Nominal tidak valid' });
  }

  try {
    if (targetType === 'DONATUR') {
      if (!externalId) return res.status(400).json({ success: false, message: 'external_participant_id wajib untuk donatur' });
      await createJimpitanExternalDraft({
        externalParticipantId: externalId,
        nominal: nilaiNominal,
        tanggal: tanggalOperasional.toISOString().slice(0, 10),
        petugasId: petugas_id
      });
    } else {
      await createJimpitanDraftAndUpdateSaldo({
        wargaId: warga_id,
        nominal: nilaiNominal,
        tanggal: tanggalOperasional.toISOString().slice(0, 10),
        petugasId: petugas_id
      });
      await notifyUser(
        String(warga_id),
        `🧾 <b>Input Jimpitan Tercatat</b>\n` +
        `Tanggal Operasional: <b>${tanggalOperasional.toISOString().slice(0, 10)}</b>\n` +
        `Nominal: <b>${formatRupiah(nilaiNominal)}</b>\n` +
        `Status: <b>DRAFT (menunggu setor/approval)</b>`
      );
    }
    if (debug) {
      console.log('[JIMPITAN][INPUT] success', {
        warga_id,
        nominal: nilaiNominal,
        petugas_id
      });
    }
    return res.json({ success: true, tanggal_operasional: tanggalOperasional });
  } catch (err) {
    if (debug) console.log('[JIMPITAN][INPUT] error', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function inputJimpitanV2Detail(req, res) {
  const { warga_id, nominal, target_type, external_participant_id } = req.body;
  const petugas_id = req.user.user_id;
  const roles = req.user.roles || [];
  const targetType = String(target_type || 'WARGA').trim().toUpperCase();
  const externalId = String(external_participant_id || '').trim();
  const tanggalOperasional = getOperationalDate();

  const effectiveMode = await getEffectiveJimpitanMode(tanggalOperasional.toISOString().slice(0, 10));
  if (effectiveMode.mode !== 'SHIFT_TOTAL') {
    return res.status(400).json({ success: false, message: 'Input by name V2 hanya aktif pada mode Jimpitan V2.' });
  }

  if (!canInputByTime(roles)) {
    return res.status(403).json({
      success: false,
      message: 'JAM OPERASIONAL TUTUP: input hanya jam 21.00 - 06.00'
    });
  }

  const access = await getShiftAccessContext(petugas_id, roles, tanggalOperasional);
  if (!access.canOperate) {
    return res.status(403).json({
      success: false,
      message: 'Bukan shift Anda hari ini.'
    });
  }

  const nilaiNominal = Number(nominal || 0);
  if (!Number.isFinite(nilaiNominal) || nilaiNominal < 0) {
    return res.status(400).json({ success: false, message: 'Nominal tidak valid' });
  }

  try {
    await createJimpitanV2Detail({
      wargaId: targetType === 'DONATUR' ? null : warga_id,
      externalParticipantId: targetType === 'DONATUR' ? externalId : null,
      nominal: nilaiNominal,
      tanggal: tanggalOperasional.toISOString().slice(0, 10),
      petugasId: petugas_id
    });
    const normalizedRoles = roles.map((role) => String(role).trim().toLowerCase());
    if (normalizedRoles.includes('root') || normalizedRoles.includes('admin jimpitan')) {
      await scheduleMonthlyJimpitanGroupShare(tanggalOperasional, 'direct V2 detail notification');
    }

    return res.json({ success: true, tanggal_operasional: tanggalOperasional });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function setorJimpitan(req, res) {
  const petugas_id = req.user.user_id;
  const inputDetailIds = Array.isArray(req.body.detail_ids) ? req.body.detail_ids : null;
  const debug = process.env.DEBUG_JIMPITAN === 'true';

  if (debug) {
    console.log('[JIMPITAN][SETOR] start', {
      petugas_id,
      detail_ids_count: inputDetailIds ? inputDetailIds.length : 0
    });
  }

  const operationalDate = getOperationalDate();
  const effectiveMode = await getEffectiveJimpitanMode(operationalDate.toISOString().slice(0, 10));
  if (effectiveMode.mode === 'SHIFT_TOTAL') {
    return res.status(400).json({
      success: false,
      message: 'Mode Jimpitan saat ini setoran total shift. Gunakan form setor total.'
    });
  }
  const access = await getShiftAccessContext(petugas_id, req.user.roles || [], operationalDate);
  if (!access.canOperate) {
    return res.status(403).json({
      success: false,
      message: 'Bukan shift Anda hari ini.'
    });
  }

  try {
    const batch = await createSetorBatch({ petugasId: petugas_id, detailIds: inputDetailIds, operationalDate });
    if (!batch) {
      if (debug) console.log('[JIMPITAN][SETOR] no draft rows found');
      return res.status(400).json({ success: false, message: 'Tidak ada data draft untuk disetor' });
    }
    if (debug) {
      console.log('[JIMPITAN][SETOR] success', {
        petugas_id,
        batch_id: batch.batch_id,
        total: batch.total,
        total_rumah: batch.total_rumah
      });
    }

    const approvalLink = buildApprovalLink();
    const linkSection = approvalLink
      ? `\n\n🔗 <a href="${approvalLink}">Buka Approval di Web</a>`
      : '';

    await notifyRoles(
      ['Admin Jimpitan', 'root'],
      `🔔 <b>Approval Setoran Jimpitan Dibutuhkan</b>\n` +
      `Petugas: <b>${petugas_id}</b>\n` +
      `Total: <b>${formatRupiah(batch.total)}</b>\n` +
      `Rumah: <b>${batch.total_rumah}</b>` +
      linkSection
    );
    if (!batch.notification_queued) await scheduleMonthlyJimpitanGroupShare(operationalDate, 'setor notification');

    return res.json({
      success: true,
      batch_id: batch.batch_id,
      total: batch.total,
      total_rumah: batch.total_rumah
    });
  } catch (error) {
    if (debug) console.log('[JIMPITAN][SETOR] error', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function setorJimpitanShiftTotal(req, res) {
  const petugas_id = req.user.user_id;
  const roles = req.user.roles || [];
  const nominal = Number(req.body.amount || req.body.nominal || 0);
  const note = String(req.body.note || '').trim();
  const operationalDate = getOperationalDate();
  const operationalDateIso = operationalDate.toISOString().slice(0, 10);

  const effectiveMode = await getEffectiveJimpitanMode(operationalDate.toISOString().slice(0, 10));
  if (effectiveMode.mode !== 'SHIFT_TOTAL') {
    return res.status(400).json({
      success: false,
      message: 'Mode Jimpitan saat ini masih per warga. Setoran total shift belum aktif.'
    });
  }

  if (!canInputByTime(roles)) {
    return res.status(403).json({
      success: false,
      message: 'JAM OPERASIONAL TUTUP: setor shift hanya jam 21.00 - 06.00'
    });
  }

  const access = await getShiftAccessContext(petugas_id, roles, operationalDate);
  if (!access.canOperate) {
    return res.status(403).json({
      success: false,
      message: 'Bukan shift Anda hari ini.'
    });
  }

  if (!Number.isFinite(nominal) || nominal <= 0) {
    return res.status(400).json({ success: false, message: 'Nominal setor harus lebih dari 0' });
  }

  try {
    const batch = await createShiftTotalBatch({
      petugasId: petugas_id,
      totalAmount: nominal,
      operationalDate: operationalDateIso,
      note
    });

    const approvalLink = buildApprovalLink();
    const linkSection = approvalLink ? `\n\n🔗 <a href="${approvalLink}">Buka Approval di Web</a>` : '';

    await notifyRoles(
      ['Admin Jimpitan', 'root'],
      `🔔 <b>Approval Setoran Jimpitan Shift Dibutuhkan</b>\n` +
      `Tanggal: <b>${operationalDateIso}</b>\n` +
      `Total: <b>${formatRupiah(batch.total)}</b>` +
      (note ? `\nCatatan: ${note}` : '') +
      linkSection
    );
    if (!batch.notification_queued) await scheduleMonthlyJimpitanGroupShare(operationalDate, 'setor notification');

    return res.json({
      success: true,
      batch_id: batch.batch_id,
      total: batch.total,
      operational_date: operationalDateIso
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function approveJimpitan(req, res) {
  const { batch_id } = req.body;
  const admin_id = req.user.user_id;

  try {
    await approveJimpitanBatch({ batchId: batch_id, adminId: admin_id });

    const creator = await findBatchCreator(batch_id);
    if (creator) {
      await notifyUser(
        creator.petugas_id,
        `✅ <b>Setoran Jimpitan Disetujui</b>\n` +
        `Batch ID: <b>${batch_id}</b>\n` +
        `Total: <b>${formatRupiah(creator.total_amount)}</b>`
      );
    }

    const wargaInBatch = await listWargaTotalsInBatch(batch_id);
    await Promise.all(
      wargaInBatch.map((row) =>
        notifyUser(
          row.warga_id,
          `✅ <b>Iuran Jimpitan Anda Sudah Disetujui</b>\n` +
          `Batch ID: <b>${batch_id}</b>\n` +
          `Nominal: <b>${formatRupiah(row.total_nominal)}</b>\n` +
          `Status: <b>APPROVED</b>`
        )
      )
    );

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function listJimpitan(req, res) {
  try {
    const operationalDate = getOperationalDate();
    const hariKe = operationalDate.getDate();
    const access = await getShiftAccessContext(req.user.user_id, req.user.roles || [], operationalDate);
    const effectiveMode = await getEffectiveJimpitanMode(operationalDate.toISOString().slice(0, 10));

    const rows = await listJimpitanByOperationalDate(operationalDate.toISOString().slice(0, 10));
    const v2InputStatus = effectiveMode.mode === 'SHIFT_TOTAL'
      ? await getJimpitanV2InputStatus(operationalDate.toISOString().slice(0, 10), req.user.user_id)
      : null;
    const data = rows.map((row) => {
      const saldo = Number(row.saldo || 0);
      const nominalHariIni = Number(row.nominal_hari_ini || 0);
      const totalKewajibanHarian = hariKe * BIAYA_HARIAN;
      const targetType = String(row.target_type || 'WARGA').toUpperCase();
      const isDonatur = targetType === 'DONATUR';

      const lunasByInput = nominalHariIni > 0 || nominalHariIni === 0 && row.petugas;
      const lunasBySaldo = effectiveMode.mode === 'SHIFT_TOTAL'
        ? false
        : !isDonatur && (saldo >= TARGET_BULANAN || saldo >= totalKewajibanHarian);
      const isLunasUI = Boolean(lunasByInput || lunasBySaldo);

      const nominalSaran = effectiveMode.mode === 'SHIFT_TOTAL'
        ? BIAYA_HARIAN
        : isLunasUI ? 0 : (isDonatur ? BIAYA_HARIAN : calculateNominalSaran(saldo, hariKe));
      const detailStatus = String(row.detail_status || '').toUpperCase();
      const batchStatus = String(row.batch_status || '').toUpperCase();
      const canEditNominal = !isDonatur && detailStatus !== '' && detailStatus !== 'APPROVED' && batchStatus !== 'APPROVED';

      return {
        id: row.id,
        nama: row.nama,
        target_type: targetType,
        external_participant_id: row.external_participant_id || null,
        status: isLunasUI ? 'LUNAS' : 'BELUM',
        namaPetugas: lunasByInput ? (row.petugas || '') : (lunasBySaldo ? 'Deposit' : ''),
        isLunas: isLunasUI,
        nominalSaran,
        nominalTerbayar: lunasByInput ? nominalHariIni : (lunasBySaldo ? 1 : 0),
        saldo,
        detailStatus,
        batchStatus,
        canEditNominal
      };
    });

    return res.json({
      success: true,
      operational_date: operationalDate,
      operational_day: access.hariOperasional,
      viewer_shift_day: access.shiftHari,
      can_operate_today: access.canOperate,
      jimpitan_mode: effectiveMode.mode,
      v2_input_status: v2InputStatus,
      data
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getJimpitanMode(req, res) {
  const date = String(req.query.date || req.query.month || '').trim();
  try {
    const effective = await getEffectiveJimpitanMode(date);
    const normalizedRoles = (req.user.roles || []).map((role) => String(role).trim().toLowerCase());
    const isRoot = normalizedRoles.includes('root');
    const history = isRoot ? await getJimpitanModeHistory() : [];
    return res.json({ success: true, data: { effective, history } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function updateJimpitanMode(req, res) {
  const effectiveDate = String(req.body.effective_date || '').trim();
  const mode = String(req.body.mode || '').trim().toUpperCase();
  const note = String(req.body.note || '').trim();
  try {
    const data = await setJimpitanMode({
      effectiveDate,
      mode,
      note,
      createdBy: req.user.user_id
    });
    await delCacheByPrefix('dashboard:warga:');
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getDailyRecapJimpitan(req, res) {
  const rawMonth = String(req.query.month || '').trim();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : new Date().toISOString().slice(0, 7);
  try {
    const roles = (req.user.roles || []).map((role) => String(role).trim().toLowerCase());
    const canReadAll = roles.includes('root') || roles.includes('admin jimpitan') || roles.includes('ketua');
    if (!canReadAll) {
      const access = await getShiftAccessContext(req.user.user_id, req.user.roles || [], getOperationalDate());
      if (!access.canOperate) {
        return res.status(403).json({ success: false, message: 'Bukan petugas shift hari ini.' });
      }
    }
    const data = await getJimpitanDailyRecapByMonth(month);
    return res.json({ success: true, month, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getJimpitanSchedule(_req, res) {
  try {
    const cacheKey = 'jimpitan:schedule:weekly:v1';
    const cached = await getCacheJson(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    const data = await listJimpitanWeeklySchedule();
    const payload = { success: true, data };
    await setCacheJson(cacheKey, payload, 300);
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getJimpitanExternalParticipants(_req, res) {
  try {
    const data = await listJimpitanExternalParticipants();
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getJimpitanMembers(_req, res) {
  try {
    const data = await listJimpitanMembers();
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function updateJimpitanMemberStatus(req, res) {
  const wargaId = String(req.body.warga_id || '').trim();
  const status = String(req.body.status || '').trim().toUpperCase();
  const updatedBy = String(req.user.user_id || '').trim();
  if (!wargaId) return res.status(400).json({ success: false, message: 'warga_id wajib' });
  if (!['ACTIVE', 'INACTIVE'].includes(status)) return res.status(400).json({ success: false, message: 'status tidak valid' });
  try {
    const data = await setJimpitanMemberStatus({ wargaId, status, updatedBy });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function addJimpitanExternalParticipant(req, res) {
  const nama = String(req.body.nama || '').trim();
  const noHp = String(req.body.no_hp || '').trim();
  const keterangan = String(req.body.keterangan || '').trim();
  if (!nama) {
    return res.status(400).json({ success: false, message: 'Nama donatur wajib diisi' });
  }

  try {
    const data = await createJimpitanExternalParticipant({
      nama,
      noHp: noHp || null,
      keterangan: keterangan || null
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function updateJimpitanExternalParticipantStatus(req, res) {
  const id = String(req.params.id || '').trim();
  const isActive = Boolean(req.body.is_active);
  if (!id) {
    return res.status(400).json({ success: false, message: 'id donatur tidak valid' });
  }

  try {
    const data = await setJimpitanExternalParticipantActive({ id, isActive });
    if (!data) return res.status(404).json({ success: false, message: 'Donatur tidak ditemukan' });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function setPetugasShift(req, res) {
  const userId = String(req.body.user_id || '').trim();
  const shiftHariRaw = req.body.shift_hari;
  const shiftHari = shiftHariRaw === null || shiftHariRaw === '' ? null : Number(shiftHariRaw);
  const alias = String(req.body.alias ?? req.body.jimpitan_alias ?? '').trim();

  if (!userId) {
    return res.status(400).json({ success: false, message: 'user_id tidak valid' });
  }

  if (shiftHari !== null && !Number.isInteger(shiftHari)) {
    return res.status(400).json({ success: false, message: 'shift_hari harus integer atau null' });
  }

  try {
    if (shiftHari !== null) {
      const isValidShiftDay = await isValidJimpitanShiftDay(shiftHari);
      if (!isValidShiftDay) {
        return res.status(400).json({ success: false, message: 'shift_hari tidak ada di referensi' });
      }
    }

    const row = await updatePetugasShiftHari({ userId, shiftHari, alias });
    if (!row) {
      return res.status(404).json({ success: false, message: 'User petugas tidak ditemukan' });
    }
    await delCache('jimpitan:schedule:weekly:v1');
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMyJimpitanRouteOrder(req, res) {
  const userId = String(req.user.user_id || '').trim();
  if (!userId) {
    return res.status(401).json({ success: false, message: 'User tidak valid' });
  }

  try {
    const operationalDate = getOperationalDate().toISOString().slice(0, 10);
    const ordered_warga_ids = await getJimpitanRouteOrder({ userId, operationalDate });
    return res.json({ success: true, data: { operational_date: operationalDate, ordered_warga_ids } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMyJimpitanRouteOrder(req, res) {
  const userId = String(req.user.user_id || '').trim();
  const orderedRaw = Array.isArray(req.body.ordered_warga_ids) ? req.body.ordered_warga_ids : null;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'User tidak valid' });
  }
  if (!orderedRaw) {
    return res.status(400).json({ success: false, message: 'ordered_warga_ids wajib berupa array' });
  }

  const ordered_warga_ids = orderedRaw
    .map((id) => String(id || '').trim())
    .filter((id) => id !== '');

  if (ordered_warga_ids.length > 1000) {
    return res.status(400).json({ success: false, message: 'ordered_warga_ids terlalu panjang' });
  }

  try {
    const operationalDate = getOperationalDate().toISOString().slice(0, 10);
    await saveJimpitanRouteOrder({ userId, operationalDate, orderedWargaIds: ordered_warga_ids });
    return res.json({ success: true, data: { operational_date: operationalDate, ordered_warga_ids } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function sendJimpitanShiftReminder(req, res) {
  const configuredSecret = process.env.CRON_SECRET || '';
  const incomingSecret = String(req.headers['x-cron-secret'] || '');
  const authHeader = String(req.headers.authorization || '');
  const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const testMode = String(req.query.test || req.body?.test || '').toLowerCase() === 'true';
  const testShiftDay = testMode ? Number(req.query.shift_day || req.body?.shift_day || 0) : 0;

  if (configuredSecret && incomingSecret !== configuredSecret && bearerSecret !== configuredSecret) {
    return res.status(403).json({ success: false, message: 'Forbidden: invalid cron secret' });
  }
  if (testMode && (!Number.isInteger(testShiftDay) || testShiftDay < 1 || testShiftDay > 7)) {
    return res.status(400).json({ success: false, message: 'shift_day test harus 1 sampai 7' });
  }

  const now = new Date();
  const jakartaTime = getJakartaTimeParts(now);
  const totalMinutes = jakartaTime.hour * 60 + jakartaTime.minute;
  const targetMinutes = 20 * 60 + 30;
  const allowedEarlyMinutes = 0;
  const allowedLateMinutes = 15;
  const isWithinWindow =
    Number.isFinite(totalMinutes) &&
    totalMinutes >= targetMinutes - allowedEarlyMinutes &&
    totalMinutes <= targetMinutes + allowedLateMinutes;

  if (!testMode && !isWithinWindow) {
    return res.json({
      success: true,
      skipped: true,
      message: 'Di luar window reminder 20:30-20:45 WIB',
      current_time_wib: jakartaTime.hourMinute
    });
  }

  const shiftDay = testMode ? testShiftDay : jakartaTime.shiftDay;
  if (!shiftDay) {
    return res.status(500).json({ success: false, message: 'Gagal membaca hari operasional WIB' });
  }
  const reminderDate = jakartaTime.dateIso;
  const reminderType = testMode ? `SHIFT_2030_TEST_${Date.now()}` : 'SHIFT_2030';
  const targetLabel = testMode
    ? getShiftDayLabel(shiftDay)
    : new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(now);

  try {
    const petugas = await listPetugasByShiftDay(shiftDay);
    const telegramRecipients = petugas.filter((row) => String(row.telegram_chat_id || '').trim() !== '');
    // Each petugas receives the reminder through one channel only: Telegram when linked, WA otherwise.
    const waFallbackCandidates = petugas.filter((row) => String(row.telegram_chat_id || '').trim() === '');
    const waSettings = await getWaJimpitanReminderSettings();
    const waEnabled = waSettings.enabled;
    const waMaxRecipients = waSettings.max_recipients;
    const waSelectionMode = waSettings.selection_mode;
    const waRecipientRows = waEnabled
      ? await pickRandomValidWaRecipients(waFallbackCandidates, waSelectionMode === 'all' ? waFallbackCandidates.length : waMaxRecipients, waSelectionMode === 'all' ? null : listUnsentJimpitanWaPhones)
      : [];
    const waRecipients = waRecipientRows.length;
    const totalRecipients = telegramRecipients.length + waRecipients;
    const lock = await lockDailyJimpitanReminder(reminderDate, reminderType, totalRecipients);

    if (!lock) {
      return res.json({
        success: true,
        skipped: true,
        message: 'Reminder hari ini sudah pernah dikirim',
        shift_day: shiftDay,
        total_recipients: totalRecipients
      });
    }

    const telegramResults = await Promise.allSettled(
      telegramRecipients.map((row) => sendTelegramMessage(
        row.telegram_chat_id,
        buildTelegramJimpitanReminderText({ recipient: row, petugas, targetLabel, testMode })
      ))
    );
    const telegramSent = telegramResults.filter((item) => item.status === 'fulfilled' && item.value?.success === true).length;
    const telegramFailed = telegramResults.length - telegramSent;
    const telegramErrors = [];
    telegramResults.forEach((item, index) => {
      if (item.status === 'rejected') {
        telegramErrors.push({
          nama: telegramRecipients[index]?.nama || null,
          message: item.reason?.message || String(item.reason || 'Telegram gagal')
        });
      } else if (item.value?.success !== true) {
        telegramErrors.push({
          nama: telegramRecipients[index]?.nama || null,
          message: item.value?.error || item.value?.reason || 'Telegram tidak mengirim'
        });
      }
    });

    const waResults = [];
    const waGreetings = pickDistinctWaGreetings(waRecipientRows.length);
    for (const [index, recipient] of waRecipientRows.entries()) {
      const recipientId = String(recipient.id || '');
      const colleagues = [...new Set(
        petugas
          .filter((row) => String(row.id) !== recipientId)
          .map((row) => String(row.jimpitan_alias || '').trim() || firstNameOnly(row.nama))
          .filter(Boolean)
      )];
      const waText = buildWaJimpitanReminderText({
        recipient,
        targetLabel,
        testMode,
        greeting: waGreetings[index],
        colleagues
      });
      const result = await sendWaJimpitanReminder({ recipient, text: waText, settings: waSettings });
      if (result?.success === true) await markJimpitanWaPhoneSent(recipient.phone);
      waResults.push({ recipient, result });
    }
    const waSent = waResults.filter((item) => item.result?.success === true).length;
    const isWaDeliveryUncertain = (item) =>
      item.result?.delivery_uncertain === true || item.result?.error === 'timeout';
    const waUncertain = waResults.filter((item) =>
      item.result?.success !== true && isWaDeliveryUncertain(item)
    ).length;
    const waFailed = waResults.filter((item) =>
      item.result?.success !== true && !isWaDeliveryUncertain(item)
    ).length;
    const waErrors = waResults
      .filter((item) => item.result?.success !== true)
      .map((item) => ({
        nama: item.recipient.nama || null,
        no_hp: item.recipient.phone,
        status: isWaDeliveryUncertain(item) ? 'uncertain' : 'failed',
        message: item.result?.error || item.result?.reason || 'WA tidak mengirim'
      }));

    await updateJimpitanReminderDeliveryLog({
      id: lock.id,
      totalTarget: petugas.length,
      totalRecipients,
      telegramRecipients: telegramRecipients.length,
      telegramSent,
      telegramFailed,
      telegramErrors: telegramErrors.slice(0, 5),
      waProvider: waEnabled ? `wa-lab-random-${waMaxRecipients}` : 'off',
      waRecipients,
      waSent,
      waFailed,
      waUncertain,
      waTarget: waRecipientRows.length
        ? waRecipientRows.map((recipient) => ({ nama: recipient.nama || null, no_hp: recipient.phone }))
        : null,
      waErrors: waErrors.slice(0, 5)
    });

    if (!testMode) {
      await notifyRoles(
        ['root'],
        `✅ <b>Reminder Jimpitan Terkirim</b>\n` +
        `Hari: <b>${targetLabel}</b>\n` +
        `Petugas shift: <b>${petugas.length}</b>\n` +
        `Telegram: <b>${telegramSent}/${telegramRecipients.length}</b> gagal <b>${telegramFailed}</b>\n` +
        `WA Lab: <b>${waSent}/${waRecipients}</b> gagal <b>${waFailed}</b>, belum terkonfirmasi <b>${waUncertain}</b>`
      );
    }

    return res.json({
      success: true,
      shift_day: shiftDay,
      total_target: petugas.length,
      total_recipients: totalRecipients,
      telegram_recipients: telegramRecipients.length,
      telegram_sent: telegramSent,
      telegram_failed: telegramFailed,
      telegram_errors: telegramErrors.slice(0, 5),
      wa_provider: waEnabled ? `wa-lab-random-${waMaxRecipients}` : 'off',
      wa_recipient: waRecipientRows[0] ? { nama: waRecipientRows[0].nama, no_hp: waRecipientRows[0].phone } : null,
      wa_recipients_target: waRecipientRows.map((recipient) => ({ nama: recipient.nama, no_hp: recipient.phone })),
      wa_recipients: waRecipients,
      wa_sent: waSent,
      wa_failed: waFailed,
      wa_uncertain: waUncertain,
      wa_errors: waErrors.slice(0, 5),
      test_mode: testMode,
      test_shift_day: testMode ? shiftDay : null
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function topUpJimpitan(req, res) {
  const { warga_id, nominal, note, month_key } = req.body;
  const admin_id = req.user.user_id;
  const monthKey = String(month_key || '').trim();

  const nilaiNominal = Number(nominal || 0);
  if (nilaiNominal <= 0) {
    return res.status(400).json({ success: false, message: 'Nominal topup harus lebih dari 0' });
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    return res.status(400).json({ success: false, message: 'Periode topup tidak valid' });
  }

  try {
    const saldoAkhir = await topUpJimpitanSaldo({
      wargaId: warga_id,
      nominal: nilaiNominal,
      monthKey,
      adminId: admin_id,
      note: note || null
    });

    // Notification happens after the top-up commits. Use one channel only to avoid duplicate alerts.
    try {
      const recipientResult = await pool.query(
        `SELECT nama, telegram_chat_id, no_hp FROM users WHERE id = $1 LIMIT 1`,
        [warga_id]
      );
      const recipient = recipientResult.rows[0];
      if (recipient) {
        const periodLabel = new Date(`${monthKey}-01T00:00:00+07:00`).toLocaleDateString('id-ID', {
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Jakarta'
        });
        const safeName = String(recipient.nama || 'Warga').trim();
        const message = `Halo, Bapak/Ibu ${safeName} 👋\n\n💰 Bayar jimpitan bulan ${periodLabel} sebesar ${formatRupiah(nilaiNominal)}.\n\nTerima kasih.\n🙏 KasRT`;
        const telegramChatId = String(recipient.telegram_chat_id || '').trim();
        if (telegramChatId) {
          const telegramMessage = `Halo, Bapak/Ibu ${escapeTelegramHtml(safeName)} 👋\n\n💰 Bayar jimpitan bulan ${escapeTelegramHtml(periodLabel)} sebesar <b>${escapeTelegramHtml(formatRupiah(nilaiNominal))}</b>.\n\nTerima kasih.\n🙏 KasRT`;
          const result = await sendTelegramMessage(telegramChatId, telegramMessage);
          if (result?.success !== true) {
            console.warn('[JIMPITAN TOPUP] Telegram notification failed; not falling back to WA to avoid duplicate delivery:', result?.error || result?.reason || 'unknown error');
          }
        } else if (recipient.no_hp) {
          const result = await sendWaDirectMessage({ phone: recipient.no_hp, text: message });
          if (result?.success !== true) {
            console.warn('[JIMPITAN TOPUP] WhatsApp notification failed:', result?.error || 'unknown error');
          }
        } else {
          console.warn('[JIMPITAN TOPUP] No Telegram chat ID or phone number for recipient:', warga_id);
        }
      }
    } catch (notificationError) {
      // Notification failures must not turn a successfully committed top-up into a failed API response.
      console.warn('[JIMPITAN TOPUP] Notification error:', notificationError.message);
    }

    return res.json({
      success: true,
      saldo_akhir: saldoAkhir
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getJimpitanTopupHistory(req, res) {
  const monthKey = String(req.query.month || '').trim();
  const limit = Number(req.query.limit || 100);
  try {
    const data = await listJimpitanTopups({ monthKey, limit });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function inputJimpitanV2Income(req, res) {
  const adminId = req.user.user_id;
  const operationalDate = String(req.body.operational_date || '').trim();
  const amount = Number(req.body.amount || req.body.nominal || 0);
  const note = String(req.body.note || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(operationalDate)) {
    return res.status(400).json({ success: false, message: 'Tanggal operasional tidak valid' });
  }
  try {
    const data = await createApprovedShiftTotalIncome({
      adminId,
      totalAmount: amount,
      operationalDate,
      note
    });
    await scheduleMonthlyJimpitanGroupShare(new Date(`${operationalDate}T00:00:00`), 'admin income notification');
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function inputJimpitanV2MonthlyIncome(req, res) {
  const adminId = req.user.user_id;
  const monthKey = String(req.body.month_key || req.body.month || '').trim();
  const amount = Number(req.body.amount || req.body.nominal || 0);
  const note = String(req.body.note || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    return res.status(400).json({ success: false, message: 'Periode rekap bulanan tidak valid' });
  }
  try {
    const data = await createApprovedShiftMonthlyIncome({
      adminId,
      totalAmount: amount,
      monthKey,
      note
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function inputJimpitanOldCashHandover(req, res) {
  const adminId = req.user.user_id;
  const handoverDate = String(req.body.handover_date || '').trim();
  const amount = Number(req.body.amount || req.body.nominal || 0);
  const note = String(req.body.note || '').trim();
  try {
    const data = await createJimpitanOldCashHandover({
      adminId,
      amount,
      handoverDate,
      note
    });
    await scheduleMonthlyJimpitanGroupShare(new Date(`${handoverDate}T00:00:00`), 'old cash notification');
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}


export async function inputJimpitanExpense(req, res) {
  const userId = req.user.user_id;
  const amount = Number(req.body.amount || 0);
  const expenseDate = String(req.body.expense_date || '').trim();
  const description = String(req.body.description || '').trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Nominal pengeluaran harus lebih dari 0' });
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(expenseDate)) {
    return res.status(400).json({ success: false, message: 'Tanggal pengeluaran tidak valid' });
  }
  if (!description) {
    return res.status(400).json({ success: false, message: 'Keperluan pengeluaran wajib diisi' });
  }

  const wallet = await findWalletByName('Kas Jimpitan');
  if (!wallet) {
    return res.status(400).json({ success: false, message: 'Wallet Kas Jimpitan tidak ditemukan' });
  }

  const result = await pool.query(
    `INSERT INTO transactions
       (type, source_wallet_id, amount, status, description, created_by, created_at)
     VALUES ('OUT', $1, $2, 'PENDING', $3, $4, $5::date)
     RETURNING id::text, amount, description, created_at`,
    [wallet.id, amount, `[JIMPITAN_EXPENSE] ${description}`, userId, expenseDate]
  );

  try {
    await notifyRoles(
      ['Ketua', 'Sekretaris', 'root'],
      `🔔 <b>Persetujuan Pengeluaran Kas Jimpitan</b>\nTanggal: <b>${expenseDate}</b>\nNominal: <b>${formatRupiah(amount)}</b>\nKeperluan: <b>${description}</b>\nStatus: <b>PENDING</b>`
    );
  } catch (error) {
    console.error('[JIMPITAN EXPENSE] notification failed:', error.message);
  }

  return res.status(201).json({ success: true, data: result.rows[0], message: 'Pengeluaran diajukan dan menunggu persetujuan Ketua/Sekretaris' });
}


export async function getJimpitanCashLedger(req, res) {
  const year = Number.parseInt(String(req.query?.year || new Date().getFullYear()), 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ success: false, message: 'Tahun tidak valid' });
  }

  const walletsResult = await pool.query(
    `SELECT id FROM wallets WHERE LOWER(TRIM(name)) = LOWER($1)`,
    ['Kas Jimpitan']
  );
  const walletIds = walletsResult.rows.map((row) => row.id);
  if (!walletIds.length) {
    return res.json({ success: true, data: { year, balance: 0, opening_balance: 0, total_in: 0, total_out: 0, closing_balance: 0, rows: [] } });
  }

  const [balanceResult, openingResult, entriesResult] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(CASE
          WHEN t.target_wallet_id = ANY($1::uuid[]) AND t.type IN ('IN', 'TRANSFER') THEN t.amount
          WHEN t.source_wallet_id = ANY($1::uuid[]) AND t.type IN ('OUT', 'TRANSFER') THEN -t.amount
          ELSE 0 END), 0) AS balance
       FROM transactions t
       WHERE t.status = 'APPROVED'
         AND (t.target_wallet_id = ANY($1::uuid[]) OR t.source_wallet_id = ANY($1::uuid[]))`,
      [walletIds]
    ),
    pool.query(
      `SELECT COALESCE(SUM(CASE
          WHEN t.target_wallet_id = ANY($1::uuid[]) AND t.type IN ('IN', 'TRANSFER') THEN t.amount
          WHEN t.source_wallet_id = ANY($1::uuid[]) AND t.type IN ('OUT', 'TRANSFER') THEN -t.amount
          ELSE 0 END), 0) AS opening_balance
       FROM transactions t
       WHERE t.status = 'APPROVED'
         AND t.created_at < MAKE_DATE($2, 1, 1)
         AND (t.target_wallet_id = ANY($1::uuid[]) OR t.source_wallet_id = ANY($1::uuid[]))`,
      [walletIds, year]
    ),
    pool.query(
      `SELECT t.id, t.type, t.amount, t.description, t.created_at, t.approved_at,
              sw.name AS source_wallet_name, tw.name AS target_wallet_name,
              u.nama AS created_by_name, au.nama AS approved_by_name,
              CASE
                WHEN t.target_wallet_id = ANY($1::uuid[]) AND t.type IN ('IN', 'TRANSFER') THEN 'IN'
                WHEN t.source_wallet_id = ANY($1::uuid[]) AND t.type IN ('OUT', 'TRANSFER') THEN 'OUT'
                ELSE NULL
              END AS direction
       FROM transactions t
       LEFT JOIN wallets sw ON sw.id = t.source_wallet_id
       LEFT JOIN wallets tw ON tw.id = t.target_wallet_id
       LEFT JOIN users u ON u.id::text = t.created_by::text
       LEFT JOIN users au ON au.id::text = t.approved_by::text
       WHERE t.status = 'APPROVED'
         AND t.created_at >= MAKE_DATE($2, 1, 1)
         AND t.created_at < MAKE_DATE($2 + 1, 1, 1)
         AND (t.target_wallet_id = ANY($1::uuid[]) OR t.source_wallet_id = ANY($1::uuid[]))
         AND ((t.target_wallet_id = ANY($1::uuid[]) AND t.type IN ('IN', 'TRANSFER'))
           OR (t.source_wallet_id = ANY($1::uuid[]) AND t.type IN ('OUT', 'TRANSFER')))
       ORDER BY t.created_at ASC, t.id ASC`,
      [walletIds, year]
    )
  ]);

  const openingBalance = Number(openingResult.rows[0]?.opening_balance || 0);
  let runningBalance = openingBalance;
  let totalIn = 0;
  let totalOut = 0;
  const rows = entriesResult.rows.map((row) => {
    const amount = Number(row.amount || 0);
    if (row.direction === 'IN') { totalIn += amount; runningBalance += amount; }
    else { totalOut += amount; runningBalance -= amount; }
    return { ...row, amount, balance_after: runningBalance };
  });

  return res.json({
    success: true,
    data: {
      year,
      balance: Number(balanceResult.rows[0]?.balance || 0),
      opening_balance: openingBalance,
      total_in: totalIn,
      total_out: totalOut,
      closing_balance: openingBalance + totalIn - totalOut,
      rows: rows.reverse()
    }
  });
}

export async function getJimpitanV2AdminEntries(_req, res) {
  try {
    const data = await listJimpitanV2AdminEntries({ limit: 100 });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function editNominalJimpitan(req, res) {
  const { warga_id, nominal } = req.body;
  const nilaiNominal = Number(nominal ?? NaN);

  if (!Number.isFinite(nilaiNominal) || nilaiNominal < 0) {
    return res.status(400).json({ success: false, message: 'Nominal tidak valid' });
  }

  try {
    const tanggalOperasional = getOperationalDate().toISOString().slice(0, 10);
    const result = await editNominalJimpitanByAdmin({
      wargaId: warga_id,
      nominalBaru: nilaiNominal,
      tanggalOperasional
    });

    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function resetBulananJimpitan(_req, res) {
  try {
    await resetBulananJimpitanSaldo(TARGET_BULANAN);
    return res.json({ success: true, message: 'Reset bulanan jimpitan selesai' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function ajukanSetorKeBendahara(req, res) {
  const adminId = req.user.user_id;
  const requestedMonth = typeof req.body?.bulan === 'string' ? req.body.bulan.trim() : '';
  const monthPattern = /^\d{4}-\d{2}$/;
  const period = monthPattern.test(requestedMonth)
    ? requestedMonth
    : new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7);

  try {
    const { totalBatch, totalNominal } = await getApprovedBatchRecapByMonth(period);

    if (totalNominal <= 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada rekap jimpitan APPROVED untuk periode ${period}`
      });
    }

    const kasJimpitan = await findWalletByName('Kas Jimpitan');
    const kasIuranWajib = await findWalletByName('Kas Iuran Wajib');
    if (!kasJimpitan || !kasIuranWajib) {
      return res.status(400).json({
        success: false,
        message: 'Wallet Kas Jimpitan/Kas Iuran Wajib tidak ditemukan'
      });
    }

    const tagDescription = `[JIMPITAN_SETOR] Setor kas jimpitan periode ${period} • batch ${totalBatch}`;
    const duplicatePending = await findPendingTaggedTransferByDescription(`[JIMPITAN_SETOR] Setor kas jimpitan periode ${period}`);
    if (duplicatePending) {
      return res.status(400).json({
        success: false,
        message: `Pengajuan setor periode ${period} masih menunggu approval Bendahara`
      });
    }
    await createTransfer({
      fromWallet: kasJimpitan.id,
      toWallet: kasIuranWajib.id,
      amount: totalNominal,
      userId: adminId,
      description: tagDescription
    });

    const bendaharaApprovalLink = buildApprovalLink('/approval/bendahara');
    const linkSection = bendaharaApprovalLink
      ? `\n\n🔗 <a href="${bendaharaApprovalLink}">Buka Approval Bendahara</a>`
      : '';

    await notifyRoles(
      ['Bendahara', 'root'],
      `📦 <b>Pengajuan Setor Jimpitan ke Bendahara</b>\n` +
      `Periode: <b>${period}</b>\n` +
      `Batch APPROVED: <b>${totalBatch}</b>\n` +
      `Total Rekap: <b>${formatRupiah(totalNominal)}</b>\n` +
      `Diajukan oleh Admin Jimpitan ID: <b>${adminId}</b>` +
      linkSection
    );

    return res.json({
      success: true,
      data: {
        periode: period,
        total_batch: totalBatch,
        total_nominal: totalNominal
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function approveSetorJimpitanKeBendahara(req, res) {
  const transactionId = String(req.body.transaction_id || req.body.request_id || '').trim();
  const bendaharaId = String(req.user.user_id || '').trim();

  if (!transactionId) {
    return res.status(400).json({ success: false, message: 'transaction_id tidak valid' });
  }
  if (!bendaharaId) {
    return res.status(401).json({ success: false, message: 'User tidak valid' });
  }

  try {
    const approved = await approvePendingTaggedTransfer({
      transactionId,
      approverId: bendaharaId,
      descriptionPrefix: '[JIMPITAN_SETOR]'
    });
    if (!approved) {
      return res.status(400).json({
        success: false,
        message: 'Transaksi setor jimpitan tidak ditemukan atau sudah diproses'
      });
    }

    await notifyRoles(
      ['Admin Jimpitan', 'root'],
      `✅ <b>Setor Jimpitan Diterima Bendahara</b>\n` +
      `Transaksi ID: <b>${transactionId}</b>`
    );

    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getSetorHistoryJimpitanAdmin(req, res) {
  const adminId = String(req.user.user_id || '').trim();
  const limit = Number(req.query?.limit || 20);
  if (!adminId) {
    return res.status(401).json({ success: false, message: 'User tidak valid' });
  }

  try {
    const rows = await listTaggedTransfersByCreator({
      createdBy: adminId,
      descriptionPrefix: '[JIMPITAN_SETOR]',
      limit
    });
    return res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        amount: Number(row.amount || 0),
        status: row.status,
        description: row.description || '',
        created_at: row.created_at,
        approved_at: row.approved_at,
        approved_by: row.approved_by,
        target_wallet_name: row.target_wallet_name || null
      }))
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

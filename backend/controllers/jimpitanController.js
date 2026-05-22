import { notifyRoles, notifyUser } from '../services/approvalNotifier.js';
import { formatRupiah, sendTelegramMessage } from '../services/telegramService.js';
import {
  approvePendingTaggedTransfer,
  createTransfer,
  findPendingTaggedTransferByDescription,
  findWalletByName,
  listTaggedTransfersByCreator
} from '../models/transactionModel.js';
import {
  approveJimpitanBatch,
  createJimpitanDraftAndUpdateSaldo,
  createSetorBatch,
  editNominalJimpitanByAdmin,
  findBatchCreator,
  getApprovedBatchRecapByMonth,
  getJimpitanRouteOrder,
  getUserJimpitanShiftHari,
  isValidJimpitanShiftDay,
  listPetugasByShiftDay,
  listJimpitanByOperationalDate,
  getJimpitanDailyRecapByMonth,
  listJimpitanWeeklySchedule,
  listWargaTotalsInBatch,
  lockDailyJimpitanReminder,
  resetBulananJimpitanSaldo,
  saveJimpitanRouteOrder,
  topUpJimpitanSaldo,
  updatePetugasShiftHari
} from '../models/jimpitanModel.js';

const TARGET_BULANAN = 15000;
const BIAYA_HARIAN = 500;

function buildApprovalLink() {
  const base =
    process.env.FRONTEND_BASE_URL ||
    process.env.FRONTEND_URL ||
    process.env.APP_BASE_URL ||
    '';
  
  if (!base) return '';
  
  const normalized = String(base).trim().replace(/\/+$/, '');
  return `${normalized}/approval`;
}

function getOperationalDate(now = new Date()) {
  const opDate = new Date(now);
  // Operational day: starts at 21:00, ends at 12:00 (noon) next day
  // So if it's before 12:00, we're still in previous day's operational period
  if (opDate.getHours() < 12) {
    opDate.setDate(opDate.getDate() - 1);
  }
  opDate.setHours(0, 0, 0, 0);
  return opDate;
}

function getOperationalWeekdayNumber(date) {
  return date.getDay() + 1;
}

function getJakartaNow() {
  const now = new Date();
  const jakartaString = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
  return new Date(jakartaString);
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
  
  const hour = now.getHours();
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
  const { warga_id, nominal } = req.body;
  const petugas_id = req.user.user_id;
  const roles = req.user.roles || [];
  const debug = process.env.DEBUG_JIMPITAN === 'true';
  
  if (debug) {
    console.log('[JIMPITAN][INPUT] start', {
      warga_id,
      nominal,
      petugas_id,
      roles
    });
  }
  
  const tanggalOperasional = getOperationalDate();

  if (!canInputByTime(roles)) {
    if (debug) console.log('[JIMPITAN][INPUT] reject: outside operational time');
    return res.status(403).json({
      success: false,
      message: 'JAM OPERASIONAL TUTUP: input hanya jam 21.00 - 06.00 untuk non-admin.'
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
  const access = await getShiftAccessContext(petugas_id, req.user.roles || [], operationalDate);
  if (!access.canOperate) {
    return res.status(403).json({
      success: false,
      message: 'Bukan shift Anda hari ini.'
    });
  }
  
  try {
    const batch = await createSetorBatch({ petugasId: petugas_id, detailIds: inputDetailIds });
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
        `Batch ID: <b>${batch.batch_id}</b>\n` +
        `Petugas ID: <b>${petugas_id}</b>\n` +
        `Total: <b>${formatRupiah(batch.total)}</b>\n` +
        `Rumah: <b>${batch.total_rumah}</b>` +
        linkSection
    );
    
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
    
    const rows = await listJimpitanByOperationalDate(operationalDate.toISOString().slice(0, 10));
    const data = rows.map((row) => {
      const saldo = Number(row.saldo || 0);
      const nominalHariIni = Number(row.nominal_hari_ini || 0);
      const totalKewajibanHarian = hariKe * BIAYA_HARIAN;
      
      const lunasByInput = nominalHariIni > 0 || nominalHariIni === 0 && row.petugas;
      const lunasBySaldo = saldo >= TARGET_BULANAN || saldo >= totalKewajibanHarian;
      const isLunasUI = Boolean(lunasByInput || lunasBySaldo);
      
      const nominalSaran = isLunasUI ? 0 : calculateNominalSaran(saldo, hariKe);
      const detailStatus = String(row.detail_status || '').toUpperCase();
      const batchStatus = String(row.batch_status || '').toUpperCase();
      const canEditNominal = detailStatus !== '' && detailStatus !== 'APPROVED' && batchStatus !== 'APPROVED';
      
      return {
        id: row.id,
        nama: row.nama,
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
      data
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getDailyRecapJimpitan(req, res) {
  const rawMonth = String(req.query.month || '').trim();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : new Date().toISOString().slice(0, 7);
  try {
    const data = await getJimpitanDailyRecapByMonth(month);
    return res.json({ success: true, month, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getJimpitanSchedule(_req, res) {
  try {
    const data = await listJimpitanWeeklySchedule();
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function setPetugasShift(req, res) {
  const userId = String(req.body.user_id || '').trim();
  const shiftHariRaw = req.body.shift_hari;
  const shiftHari = shiftHariRaw === null || shiftHariRaw === '' ? null : Number(shiftHariRaw);

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

    const row = await updatePetugasShiftHari({ userId, shiftHari });
    if (!row) {
      return res.status(404).json({ success: false, message: 'User petugas tidak ditemukan' });
    }
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

  if (configuredSecret && incomingSecret !== configuredSecret && bearerSecret !== configuredSecret) {
    return res.status(403).json({ success: false, message: 'Forbidden: invalid cron secret' });
  }

  const nowJakarta = getJakartaNow();
  const shiftDay = getOperationalWeekdayNumber(nowJakarta);
  const reminderDate = nowJakarta.toISOString().slice(0, 10);
  const reminderType = 'SHIFT_2055';
  const targetLabel = nowJakarta.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  try {
    const petugas = await listPetugasByShiftDay(shiftDay);
    const recipients = petugas.filter((row) => String(row.telegram_chat_id || '').trim() !== '');
    const lockAcquired = await lockDailyJimpitanReminder(reminderDate, reminderType, recipients.length);

    if (!lockAcquired) {
      return res.json({
        success: true,
        skipped: true,
        message: 'Reminder hari ini sudah pernah dikirim',
        shift_day: shiftDay,
        total_recipients: recipients.length
      });
    }

    const text =
      `⏰ <b>Pengingat Jimpitan</b>\n` +
      `Hari operasional: <b>${targetLabel}</b>\n` +
      `Pengambilan jimpitan dimulai pukul <b>21:00 WIB</b>.\n` +
      `Selamat bekerja...`;

    await Promise.all(
      recipients.map((row) => sendTelegramMessage(row.telegram_chat_id, text))
    );

    return res.json({
      success: true,
      shift_day: shiftDay,
      total_target: petugas.length,
      total_recipients: recipients.length
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function topUpJimpitan(req, res) {
  const { warga_id, nominal, note } = req.body;
  const admin_id = req.user.user_id;
  
  const nilaiNominal = Number(nominal || 0);
  if (nilaiNominal <= 0) {
    return res.status(400).json({ success: false, message: 'Nominal topup harus lebih dari 0' });
  }
  
  try {
    const saldoAkhir = await topUpJimpitanSaldo({
      wargaId: warga_id,
      nominal: nilaiNominal,
      adminId: admin_id,
      note: note || null
    });
    
    return res.json({
      success: true,
      saldo_akhir: saldoAkhir
    });
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

    await notifyRoles(
      ['Bendahara', 'root'],
      `📦 <b>Pengajuan Setor Jimpitan ke Bendahara</b>\n` +
        `Periode: <b>${period}</b>\n` +
        `Batch APPROVED: <b>${totalBatch}</b>\n` +
        `Total Rekap: <b>${formatRupiah(totalNominal)}</b>\n` +
        `Diajukan oleh Admin Jimpitan ID: <b>${adminId}</b>`
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

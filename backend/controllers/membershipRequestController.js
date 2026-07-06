import {
  createMembershipRequest,
  getMembershipAdminRoles,
  getMembershipModuleLabel,
  getPendingMembershipRequestById,
  listPendingMembershipRequests,
  normalizeMembershipModule,
  reviewMembershipRequest
} from '../models/membershipRequestModel.js';
import { setInternetMemberActive } from '../models/internetModel.js';
import { setLingkunganMemberActive } from '../models/lingkunganModel.js';
import { setKoperasiMemberActive } from '../models/koperasiModel.js';
import { notifyRoles, notifyUser } from '../services/approvalNotifier.js';

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function userHasAnyRole(req, roleNames) {
  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  const normalized = roles.map((role) => String(role || '').trim().toLowerCase());
  return normalized.includes('root') || roleNames.some((role) => normalized.includes(String(role).trim().toLowerCase()));
}

export async function createMyMembershipRequestHandler(req, res) {
  const moduleKey = normalizeMembershipModule(req.body.module_key);
  const actor = String(req.user.user_id || '').trim();
  const note = String(req.body.note || '').trim();
  const requestType = String(req.body.request_type || 'ACTIVATE').trim().toUpperCase();
  if (!moduleKey) return res.status(400).json({ success: false, message: 'module_key invalid' });
  if (moduleKey === 'tabungan') return res.status(400).json({ success: false, message: 'Keanggotaan tabungan diatur langsung oleh Admin Pembangunan.' });
  if (!['ACTIVATE', 'DEACTIVATE'].includes(requestType)) return res.status(400).json({ success: false, message: 'request_type invalid' });
  const data = await createMembershipRequest({ moduleKey, wargaId: actor, requestedBy: actor, note, requestType });
  const label = getMembershipModuleLabel(moduleKey);
  const actionLabel = requestType === 'DEACTIVATE' ? 'Nonaktif Keanggotaan' : 'Keanggotaan';
  await notifyRoles(
    getMembershipAdminRoles(moduleKey),
    `📝 <b>Request ${actionLabel} ${label}</b>\n` +
      `Warga: <b>${req.user.nama || actor}</b>\n` +
      `Status: <b>PENDING</b>\n\n` +
      `Silakan review di menu Approval ${label}.`
  );
  return res.json({
    success: true,
    data,
    message: requestType === 'DEACTIVATE'
      ? `Permintaan nonaktif ${label} dikirim ke admin.`
      : `Permintaan keanggotaan ${label} dikirim ke admin.`
  });
}

export async function listMembershipRequestsHandler(req, res) {
  const moduleKey = normalizeMembershipModule(req.query.module_key);
  if (!moduleKey) return res.status(400).json({ success: false, message: 'module_key invalid' });
  if (moduleKey === 'tabungan') return res.json({ success: true, data: [] });
  if (!userHasAnyRole(req, getMembershipAdminRoles(moduleKey))) {
    return res.status(403).json({ success: false, message: 'Akses request modul ini ditolak' });
  }
  const data = await listPendingMembershipRequests(moduleKey);
  return res.json({ success: true, data });
}

export async function reviewMembershipRequestHandler(req, res) {
  const requestId = String(req.body.request_id || '').trim();
  const status = String(req.body.status || '').trim().toUpperCase();
  const actor = String(req.user.user_id || '').trim();
  if (!requestId) return res.status(400).json({ success: false, message: 'request_id wajib' });
  if (!['APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ success: false, message: 'status invalid' });

  const pending = await getPendingMembershipRequestById(requestId);
  if (!pending) return res.status(404).json({ success: false, message: 'Request tidak ditemukan atau sudah diproses' });
  if (pending.module_key === 'tabungan') return res.status(400).json({ success: false, message: 'Keanggotaan tabungan diatur langsung oleh Admin Pembangunan.' });
  if (!userHasAnyRole(req, getMembershipAdminRoles(pending.module_key))) {
    return res.status(403).json({ success: false, message: 'Akses approval modul ini ditolak' });
  }

  const reviewed = await reviewMembershipRequest({ requestId, status, reviewedBy: actor });
  if (!reviewed) return res.status(404).json({ success: false, message: 'Request tidak ditemukan atau sudah diproses' });

  const shouldActivate = reviewed.request_type !== 'DEACTIVATE';
  if (status === 'APPROVED') {
    if (reviewed.module_key === 'internet') {
      await setInternetMemberActive({ wargaId: reviewed.warga_id, isActive: shouldActivate, activeFromMonth: currentMonthKey(), updatedBy: actor });
    } else if (reviewed.module_key === 'lingkungan') {
      await setLingkunganMemberActive({ wargaId: reviewed.warga_id, isActive: shouldActivate, activeFromMonth: currentMonthKey(), updatedBy: actor });
    } else if (reviewed.module_key === 'koperasi') {
      await setKoperasiMemberActive({ wargaId: reviewed.warga_id, isActive: shouldActivate });
    }
  }

  const label = getMembershipModuleLabel(reviewed.module_key);
  await notifyUser(
    reviewed.warga_id,
    status === 'APPROVED'
      ? reviewed.request_type === 'DEACTIVATE'
        ? `✅ Request nonaktif <b>${label}</b> disetujui.`
        : `✅ Request keanggotaan <b>${label}</b> disetujui.`
      : reviewed.request_type === 'DEACTIVATE'
        ? `❌ Request nonaktif <b>${label}</b> ditolak.`
        : `❌ Request keanggotaan <b>${label}</b> ditolak.`
  );

  return res.json({ success: true, data: reviewed, message: `Request ${label} berhasil diproses.` });
}

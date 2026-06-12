import {
  listApprovalHistory,
  listPendingAssetRentalPaymentApprovals,
  listPendingSosialReceiptApprovals,
  listPendingSetorBendaharaApprovals,
  listPendingJimpitanBatches,
  listPendingTransactionApprovals
} from '../models/approvalModel.js';

function normalizeRoles(userRoles = []) {
  if (Array.isArray(userRoles)) return userRoles;
  if (typeof userRoles === 'string') {
    return userRoles
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean);
  }
  return [];
}

function hasAnyRole(userRoles = [], expectedRoles = []) {
  const normalized = normalizeRoles(userRoles).map((role) => String(role).toLowerCase());
  return expectedRoles.some((role) => normalized.includes(String(role).toLowerCase()));
}

export async function getPendingApprovals(req, res) {
  const roles = req.user?.roles || [];

  const canApproveJimpitan = hasAnyRole(roles, ['Admin Jimpitan', 'root']);
  const canApproveFinance = hasAnyRole(roles, ['Ketua', 'Sekretaris', 'root']);
  const canApproveSetorHandover = hasAnyRole(roles, ['Bendahara', 'root']);
  const canApproveSosialReceipt = hasAnyRole(roles, ['Admin Sosial', 'root']);

  const sections = [];

  if (canApproveJimpitan) {
    const rows = await listPendingJimpitanBatches();
    sections.push({
      key: 'jimpitan',
      label: 'Approval Jimpitan',
      items: rows
    });
  }

  if (canApproveFinance) {
    const rows = await listPendingTransactionApprovals();
    sections.push({
      key: 'finance',
      label: 'Approval Keuangan',
      items: rows
    });
  }

  if (canApproveSetorHandover) {
    const [jimpitanRows, assetRentalRows] = await Promise.all([
      listPendingSetorBendaharaApprovals(),
      listPendingAssetRentalPaymentApprovals()
    ]);
    sections.push({
      key: 'bendahara_receipt',
      label: 'Penerimaan Bendahara',
      items: [...jimpitanRows, ...assetRentalRows]
    });
  }

  if (canApproveSosialReceipt) {
    const rows = await listPendingSosialReceiptApprovals();
    sections.push({
      key: 'social_receipt',
      label: 'Approval Dana Masuk Sosial',
      items: rows
    });
  }

  const items = sections.flatMap((section) => section.items);
  return res.json({
    success: true,
    data: {
      total_pending: items.length,
      sections,
      items
    }
  });
}

export async function getApprovalHistory(req, res) {
  const roles = req.user?.roles || [];

  const canApproveJimpitan = hasAnyRole(roles, ['Admin Jimpitan', 'root']);
  const canApproveFinance = hasAnyRole(roles, ['Ketua', 'Sekretaris', 'root']);
  const canApproveSetorHandover = hasAnyRole(roles, ['Bendahara', 'root']);
  const canSeeSocialReceiptHistory = hasAnyRole(roles, ['Admin Sosial', 'Ketua', 'Sekretaris', 'root']);

  const page = Math.max(Number.parseInt(String(req.query?.page || '1'), 10) || 1, 1);
  const limitRaw = Number.parseInt(String(req.query?.limit || '10'), 10) || 10;
  const limit = Math.min(Math.max(limitRaw, 1), 50);
  const offset = (page - 1) * limit;

  const { total, rows } = await listApprovalHistory({
    includeJimpitan: canApproveJimpitan,
    includeFinance: canApproveFinance,
    includeHandover: canApproveSetorHandover,
    includeAssetRentalPayment: canApproveSetorHandover,
    includeSocialReceipt: canSeeSocialReceiptHistory,
    limit,
    offset
  });

  const items = rows.map((row) => ({
    kind: row.kind,
    id: row.id,
    title: row.title,
    description: row.description,
    amount: Number(row.amount || 0),
    created_at: row.created_at,
    approved_at: row.approved_at,
    approved_by: row.approved_by,
    approved_by_nama: row.approved_by_nama || null
  }));

  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

  return res.json({
    success: true,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_prev: page > 1,
        has_next: page < totalPages
      }
    }
  });
}

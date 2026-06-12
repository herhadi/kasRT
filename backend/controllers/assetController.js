import {
  confirmAssetRentalPayment,
  createAssetRental,
  listAssetRentals,
  listAssets,
  setAssetActive,
  upsertAsset
} from '../models/assetModel.js';
import { notifyRoles } from '../services/approvalNotifier.js';
import { formatRupiah } from '../services/telegramService.js';

function parsePositiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export async function getAssetManagementData(_req, res) {
  try {
    const [assets, rentals] = await Promise.all([listAssets(), listAssetRentals()]);
    return res.json({ success: true, data: { assets, rentals } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveAsset(req, res) {
  const id = String(req.body.id || '').trim();
  const name = String(req.body.name || '').trim();
  const category = String(req.body.category || '').trim();
  const quantity = Number(req.body.quantity || 0);
  const condition = String(req.body.condition || 'Baik').trim();
  const rentalRate = parsePositiveNumber(req.body.rental_rate, 0);
  const notes = String(req.body.notes || '').trim();
  const isActive = req.body.is_active === undefined ? true : Boolean(req.body.is_active);
  const actor = String(req.user?.user_id || '').trim();

  if (!name) return res.status(400).json({ success: false, message: 'Nama aset wajib diisi' });
  if (!Number.isInteger(quantity) || quantity < 0) {
    return res.status(400).json({ success: false, message: 'Jumlah aset tidak valid' });
  }

  try {
    const asset = await upsertAsset({
      id: id || null,
      name,
      category,
      quantity,
      condition,
      rentalRate,
      notes,
      isActive,
      actor
    });
    return res.json({ success: true, data: asset });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function updateAssetStatus(req, res) {
  const id = String(req.params.id || '').trim();
  const isActive = Boolean(req.body.is_active);
  if (!id) return res.status(400).json({ success: false, message: 'ID aset tidak valid' });

  try {
    const data = await setAssetActive({ id, isActive });
    if (!data) return res.status(404).json({ success: false, message: 'Aset tidak ditemukan' });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function recordAssetRental(req, res) {
  const assetId = String(req.body.asset_id || '').trim();
  const renterName = String(req.body.renter_name || '').trim();
  const renterPhone = String(req.body.renter_phone || '').trim();
  const rentalDate = String(req.body.rental_date || '').trim();
  const returnDate = String(req.body.return_date || '').trim();
  const quantity = Number(req.body.quantity || 0);
  const amount = Number(req.body.amount || 0);
  const notes = String(req.body.notes || '').trim();
  const actor = String(req.user?.user_id || '').trim();

  if (!assetId) return res.status(400).json({ success: false, message: 'Pilih aset terlebih dahulu' });
  if (!renterName) return res.status(400).json({ success: false, message: 'Nama penyewa wajib diisi' });
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(rentalDate)) {
    return res.status(400).json({ success: false, message: 'Tanggal sewa wajib format YYYY-MM-DD' });
  }
  if (returnDate && !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(returnDate)) {
    return res.status(400).json({ success: false, message: 'Tanggal kembali wajib format YYYY-MM-DD' });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ success: false, message: 'Jumlah sewa harus lebih dari 0' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Nominal sewa harus lebih dari 0' });
  }

  try {
    const rental = await createAssetRental({
      assetId,
      renterName,
      renterPhone,
      rentalDate,
      returnDate: returnDate || null,
      quantity,
      amount,
      notes,
      actor
    });
    const frontendUrl = String(
      process.env.FRONTEND_BASE_URL ||
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      ''
    ).replace(/\/$/, '');
    const approvalLink = frontendUrl ? `\n\n🔗 <a href="${frontendUrl}/approval/bendahara">Buka Approval Bendahara</a>` : '';
    await notifyRoles(
      ['Bendahara'],
      `🔔 <b>Penerimaan Sewa Aset Menunggu Bendahara</b>\n` +
        `Penyewa: <b>${renterName}</b>\n` +
        `Nominal: <b>${formatRupiah(amount)}</b>\n` +
        `Tanggal Sewa: <b>${rentalDate}</b>` +
        approvalLink
    );
    return res.json({ success: true, data: rental });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function confirmAssetRentalPaymentHandler(req, res) {
  const rentalId = String(req.params.id || '').trim();
  const actor = String(req.user?.user_id || '').trim();
  if (!rentalId) return res.status(400).json({ success: false, message: 'ID sewa tidak valid' });
  if (!actor) return res.status(401).json({ success: false, message: 'User tidak valid' });

  try {
    const data = await confirmAssetRentalPayment({ rentalId, actor });
    return res.json({ success: true, data, message: 'Pembayaran sewa aset dikonfirmasi dan masuk Kas Sewa Aset' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

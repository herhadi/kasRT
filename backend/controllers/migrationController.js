import {
  getInternetMigrationSummary2025,
  getJimpitanMigrationSummary2025,
  getKoperasiIuranMigrationSummary2025,
  getKoperasiLoanProgressMigrationSummary2025,
  getLingkunganMigrationSummary2025,
  getSosialMigrationSummary2025,
  getTabunganMigrationSummary2025,
  applyOpeningArrears2026FromMigrationIuran,
  listMigrationIuran2025Summary,
  upsertInternetMigrationRows,
  upsertJimpitanMigrationRows,
  upsertKoperasiIuranMigrationRows,
  upsertKoperasiLoanProgress2025,
  upsertLingkunganMigrationRows,
  upsertSosialMigrationRows,
  upsertTabunganMigrationRows,
  upsertIuranWajib2025Rows
} from '../models/migration2025Model.js';

export async function getMigration2025IuranSummary(_req, res) {
  try {
    const rows = await listMigrationIuran2025Summary();
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025Iuran(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    await upsertIuranWajib2025Rows({ rows, actorId });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function applyMigration2025Opening2026(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  try {
    await applyOpeningArrears2026FromMigrationIuran({ actorId });
    return res.json({ success: true, message: 'Opening arrears 2026 berhasil dibangun dari closing 2025.' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025InternetSummary(_req, res) {
  try {
    const rows = await getInternetMigrationSummary2025();
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025Internet(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    await upsertInternetMigrationRows({ rows, actorId });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025LingkunganSummary(_req, res) {
  try {
    const rows = await getLingkunganMigrationSummary2025();
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025Lingkungan(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    await upsertLingkunganMigrationRows({ rows, actorId });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025JimpitanSummary(_req, res) {
  try {
    const rows = await getJimpitanMigrationSummary2025();
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025Jimpitan(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    await upsertJimpitanMigrationRows({ rows, actorId });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025TabunganSummary(_req, res) {
  try {
    const rows = await getTabunganMigrationSummary2025();
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025Tabungan(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    await upsertTabunganMigrationRows({ rows, actorId });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025SosialSummary(_req, res) {
  try {
    const data = await getSosialMigrationSummary2025();
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025Sosial(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    await upsertSosialMigrationRows({ rows, actorId });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025KoperasiIuranSummary(_req, res) {
  try {
    const rows = await getKoperasiIuranMigrationSummary2025();
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025KoperasiIuran(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    await upsertKoperasiIuranMigrationRows({ rows, actorId });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getMigration2025KoperasiLoansSummary(_req, res) {
  try {
    const rows = await getKoperasiLoanProgressMigrationSummary2025();
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function saveMigration2025KoperasiLoans(req, res) {
  const actorId = String(req.user?.user_id || '').trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!actorId) return res.status(401).json({ success: false, message: 'User tidak valid' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'rows wajib diisi' });
  try {
    await upsertKoperasiLoanProgress2025({ rows, actorId });
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

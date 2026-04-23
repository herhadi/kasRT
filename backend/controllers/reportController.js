import {
  getDashboardAdminInternetAggregate,
  getDashboardAdminKoperasiAggregate,
  getDashboardAdminLingkunganAggregate,
  getDashboardAdminPembangunanAggregate,
  getIuranBulananByWarga,
  getJimpitanBulananByWarga,
  getJimpitanHarianByWarga,
  getLaporanBulananByMonth,
  isInternetMember,
  isLingkunganMember
} from '../models/reportModel.js';
import { getDashboardAdminJimpitan } from '../models/jimpitanModel.js';

const JIMPITAN_TARGET_BULANAN = 15000;
const IURAN_WAJIB_TARGET = 30000;
const INTERNET_TARGET_BULANAN = 60000;
const LINGKUNGAN_TARGET_BULANAN = Number(process.env.LINGKUNGAN_TARGET_BULANAN || 60000);
const PEMBANGUNAN_MINIMAL_BULANAN = 5000;

export async function dashboardWarga(req, res) {
  const user_id = req.user.user_id;

  try {
    const jimpitan_hari_ini = await getJimpitanHarianByWarga(user_id);
    const jimpitan_bulan_ini = await getJimpitanBulananByWarga(user_id);
    const iuranRows = await getIuranBulananByWarga(user_id);

    let iuran_wajib_bulan_ini = 0;
    let internet_bulan_ini = 0;
    let lingkungan_bulan_ini = 0;
    let total_optional_bulan_ini = 0;
    const optional_contributions = [];

    iuranRows.forEach((row) => {
      const name = row.name;
      const amount = Number(row.total || 0);
      const isMandatory = row.is_mandatory;

      if (name === 'Iuran Wajib') {
        iuran_wajib_bulan_ini = amount;
        return;
      }

      if (name === 'Jimpitan') {
        return;
      }

      if (name === 'Internet') {
        internet_bulan_ini = amount;
      }

      if (['Lingkungan', 'Sampah', 'Iuran Sampah'].includes(name)) {
        lingkungan_bulan_ini = amount;
      }

      if (!isMandatory) {
        total_optional_bulan_ini += amount;
      }

      optional_contributions.push({
        name,
        is_mandatory: Boolean(isMandatory),
        amount
      });
    });

    const total_kontribusi_bulan_ini =
      jimpitan_bulan_ini + iuran_wajib_bulan_ini + total_optional_bulan_ini;

    const internetMember = await isInternetMember(user_id);
    let internet_status = 'NON_MEMBER';
    if (internetMember) {
      if (internet_bulan_ini < INTERNET_TARGET_BULANAN) internet_status = 'MENUNGGAK';
      else if (internet_bulan_ini === INTERNET_TARGET_BULANAN) internet_status = 'PAS';
      else internet_status = 'LEBIH';
    }

    const lingkunganMember = await isLingkunganMember(user_id);
    let lingkungan_status = 'NON_MEMBER';
    if (lingkunganMember) {
      if (lingkungan_bulan_ini < LINGKUNGAN_TARGET_BULANAN) lingkungan_status = 'MENUNGGAK';
      else if (lingkungan_bulan_ini === LINGKUNGAN_TARGET_BULANAN) lingkungan_status = 'PAS';
      else lingkungan_status = 'LEBIH';
    }

    return res.json({
      success: true,
      data: {
        jimpitan_hari_ini,
        jimpitan_bulan_ini,
        iuran_wajib_bulan_ini,
        optional_contributions,
        total_optional_bulan_ini,
        total_kontribusi_bulan_ini,
        target_kontribusi_dasar: JIMPITAN_TARGET_BULANAN + IURAN_WAJIB_TARGET,
        target_jimpitan_bulanan: JIMPITAN_TARGET_BULANAN,
        target_iuran_wajib: IURAN_WAJIB_TARGET,
        internet_bulan_ini,
        internet_target_bulanan: INTERNET_TARGET_BULANAN,
        internet_is_member: internetMember,
        internet_status,
        lingkungan_bulan_ini,
        lingkungan_target_bulanan: LINGKUNGAN_TARGET_BULANAN,
        lingkungan_is_member: lingkunganMember,
        lingkungan_status
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}

export async function dashboardAdminPembangunan(_req, res) {
  try {
    const aggregate = await getDashboardAdminPembangunanAggregate();

    return res.json({
      success: true,
      data: {
        minimal_setoran_bulanan: PEMBANGUNAN_MINIMAL_BULANAN,
        setoran_bulan_ini: Number(aggregate?.setoran_bulan_ini || 0),
        pengeluaran_bulan_ini: Math.abs(Number(aggregate?.pengeluaran_bulan_ini || 0)),
        total_setoran_semua_waktu: Number(aggregate?.total_setoran_semua_waktu || 0),
        total_pengeluaran_semua_waktu: Math.abs(Number(aggregate?.total_pengeluaran_semua_waktu || 0)),
        saldo_total: Number(aggregate?.saldo_total || 0)
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}

export async function dashboardAdminInternet(_req, res) {
  try {
    const aggregate = await getDashboardAdminInternetAggregate(INTERNET_TARGET_BULANAN);

    const totalAnggota = Number(aggregate?.total_anggota || 0);
    return res.json({
      success: true,
      data: {
        tarif_bulanan: INTERNET_TARGET_BULANAN,
        total_anggota: totalAnggota,
        target_bulan_ini: totalAnggota * INTERNET_TARGET_BULANAN,
        pemasukan_bulan_ini: Number(aggregate?.pemasukan_bulan_ini || 0),
        total_menunggak: Number(aggregate?.total_menunggak || 0),
        total_pas: Number(aggregate?.total_pas || 0),
        total_lebih: Number(aggregate?.total_lebih || 0)
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}

export async function dashboardAdminKoperasi(_req, res) {
  try {
    const aggregate = await getDashboardAdminKoperasiAggregate();

    return res.json({
      success: true,
      data: {
        total_bulan_ini: Number(aggregate?.total_bulan_ini || 0),
        total_semua_waktu: Number(aggregate?.total_semua_waktu || 0),
        total_anggota: Number(aggregate?.total_anggota || 0),
        catatan: 'Modul simpan-pinjam detail (pinjaman, tenor, angsuran) belum diaktifkan pada skema ini.'
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}

export async function dashboardAdminLingkungan(_req, res) {
  try {
    const aggregate = await getDashboardAdminLingkunganAggregate(LINGKUNGAN_TARGET_BULANAN);

    const totalAnggota = Number(aggregate?.total_anggota || 0);
    return res.json({
      success: true,
      data: {
        tarif_bulanan: LINGKUNGAN_TARGET_BULANAN,
        total_anggota: totalAnggota,
        target_bulan_ini: totalAnggota * LINGKUNGAN_TARGET_BULANAN,
        pemasukan_bulan_ini: Number(aggregate?.pemasukan_bulan_ini || 0),
        total_menunggak: Number(aggregate?.total_menunggak || 0),
        total_pas: Number(aggregate?.total_pas || 0),
        total_lebih: Number(aggregate?.total_lebih || 0)
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}

export async function laporanBulanan(req, res) {
  const { bulan } = req.query;

  try {
    const rows = await getLaporanBulananByMonth(bulan);

    let pemasukan = 0;
    let pengeluaran = 0;

    rows.forEach((r) => {
      if (r.type === 'IN') pemasukan += Number(r.total);
      if (r.type === 'OUT') pengeluaran += Number(r.total);
    });

    return res.json({
      success: true,
      data: {
        pemasukan,
        pengeluaran,
        saldo: pemasukan - pengeluaran
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}

export async function dashboardAdminJimpitan(_req, res) {
  try {
    const data = await getDashboardAdminJimpitan();

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}

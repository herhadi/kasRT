import {
  getDashboardAdminInternetAggregate,
  getDashboardAdminKoperasiAggregate,
  getDashboardAdminLingkunganAggregate,
  getDashboardAdminPembangunanAggregate,
  getDashboardBendaharaIuranWajibAggregate,
  getDashboardAdminSosialByMonth,
  getFinanceRecapByMonth,
  getTotalKasSemuaTerkini,
  getTop10PenunggakIuranWajib,
  getTrenIuranWajib6Bulan,
  getIuranBulananByWarga,
  getActiveLoanProgressByWarga,
  getJimpitanBulananByWarga,
  getJimpitanHarianByWarga,
  getLaporanBulananByMonth,
  isInternetMember,
  isLingkunganMember,
  isKoperasiMember
  ,getWargaFinancialSnapshot
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
    const loanProgress = await getActiveLoanProgressByWarga(user_id);
    const snapshot = await getWargaFinancialSnapshot(user_id);
    const totalKasSemuaTerkini = await getTotalKasSemuaTerkini();

    let iuran_wajib_bulan_ini = 0;
    let internet_bulan_ini = 0;
    let lingkungan_bulan_ini = 0;
    let total_optional_bulan_ini = 0;
    const optional_contributions = [];

    const internetMember = await isInternetMember(user_id);
    const lingkunganMember = await isLingkunganMember(user_id);
    const koperasiMember = await isKoperasiMember(user_id);

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

      const isInternetContribution = name === 'Internet';
      const isLingkunganContribution = ['Lingkungan', 'Sampah', 'Iuran Sampah'].includes(name);
      const isKoperasiContribution = name === 'Koperasi';
      const isActiveOptionalMember =
        (!isInternetContribution || internetMember) &&
        (!isLingkunganContribution || lingkunganMember) &&
        (!isKoperasiContribution || koperasiMember);

      if (!isMandatory && isActiveOptionalMember) {
        total_optional_bulan_ini += amount;
        optional_contributions.push({
          name,
          is_mandatory: Boolean(isMandatory),
          amount
        });
      }
    });

    const total_kontribusi_bulan_ini =
      jimpitan_bulan_ini + iuran_wajib_bulan_ini + total_optional_bulan_ini;

    let internet_status = 'NON_MEMBER';
    if (internetMember) {
      if (internet_bulan_ini < INTERNET_TARGET_BULANAN) internet_status = 'MENUNGGAK';
      else if (internet_bulan_ini === INTERNET_TARGET_BULANAN) internet_status = 'PAS';
      else internet_status = 'LEBIH';
    }

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
        lingkungan_status,
        koperasi_is_member: koperasiMember,
        koperasi_has_loan: Boolean(loanProgress),
        koperasi_loan_monthly_installment: loanProgress
          ? Math.round((Number(loanProgress.total_due_all || 0) / Math.max(Number(loanProgress.tenor_months || 1), 1)) * 100) / 100
          : 0,
        koperasi_loan_paid_installments: Number(loanProgress?.paid_installments || 0),
        koperasi_loan_tenor_months: Number(loanProgress?.tenor_months || 0),
        koperasi_loan_current_installment_no: Number(loanProgress?.current_installment_no || 0),
        iuran_tunggakan_bulan_ini: Number(snapshot?.iuran_tunggakan_bulan_ini || 0),
        internet_tunggakan_total: Number(snapshot?.internet_tunggakan_total || 0),
        lingkungan_tunggakan_total: Number(snapshot?.lingkungan_tunggakan_total || 0),
        tabungan_saldo: Number(snapshot?.tabungan_saldo || 0),
        total_kas_semua_terkini: Number(totalKasSemuaTerkini || 0)
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

export async function dashboardAdminBendahara(_req, res) {
  try {
    const [aggregate, top10Penunggak, tren6Bulan] = await Promise.all([
      getDashboardBendaharaIuranWajibAggregate(IURAN_WAJIB_TARGET),
      getTop10PenunggakIuranWajib(IURAN_WAJIB_TARGET),
      getTrenIuranWajib6Bulan(IURAN_WAJIB_TARGET)
    ]);
    const totalWarga = Number(aggregate?.total_warga || 0);
    const targetBulanIni = totalWarga * IURAN_WAJIB_TARGET;
    return res.json({
      success: true,
      data: {
        iuran_wajib_target_bulanan: IURAN_WAJIB_TARGET,
        total_warga: totalWarga,
        target_bulan_ini: targetBulanIni,
        pemasukan_bulan_ini: Number(aggregate?.pemasukan_bulan_ini || 0),
        total_menunggak_bulan_ini: Number(aggregate?.total_menunggak_bulan_ini || 0),
        total_pas_bulan_ini: Number(aggregate?.total_pas_bulan_ini || 0),
        total_lebih_bulan_ini: Number(aggregate?.total_lebih_bulan_ini || 0),
        nominal_tunggakan_bulan_ini: Number(aggregate?.nominal_tunggakan_bulan_ini || 0),
        nominal_tunggakan_akumulatif_tahun_berjalan: Number(aggregate?.nominal_tunggakan_akumulatif_tahun_berjalan || 0),
        top_10_penunggak: top10Penunggak.map((row) => ({
          warga_id: row.warga_id,
          nama: row.nama,
          no_hp: row.no_hp,
          iuran_bulan_ini: Number(row.iuran_bulan_ini || 0),
          tunggakan_bulan_ini: Number(row.tunggakan_bulan_ini || 0),
          iuran_tahun_ini: Number(row.iuran_tahun_ini || 0),
          tunggakan_akumulatif: Number(row.tunggakan_akumulatif || 0)
        })),
        tren_6_bulan: tren6Bulan.map((row) => ({
          bulan: row.bulan,
          total_warga: Number(row.total_warga || 0),
          target: Number(row.target || 0),
          pemasukan: Number(row.pemasukan || 0),
          tunggakan: Number(row.tunggakan || 0)
        }))
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

export async function dashboardAdminSosial(req, res) {
  const month = String(req.query.month || '').trim();
  try {
    const data = await getDashboardAdminSosialByMonth(month);
    return res.json({
      success: true,
      data: {
        saldo_total: Number(data.summary?.saldo_total || 0),
        pemasukan_bulan: Number(data.summary?.pemasukan_bulan || 0),
        pengeluaran_bulan: Number(data.summary?.pengeluaran_bulan || 0),
        expenses: (data.expenses || []).map((row) => ({
          id: row.id,
          amount: Number(row.amount || 0),
          status: row.status,
          description: row.description || '',
          created_at: row.created_at,
          created_by_nama: row.created_by_nama || null
        }))
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}

export async function rekapKeuanganBulanan(req, res) {
  const month = String(req.query.month || '').trim();
  try {
    const rows = await getFinanceRecapByMonth(month);
    return res.json({
      success: true,
      data: rows.map((row) => ({
        wallet_id: row.wallet_id,
        wallet_name: row.wallet_name,
        saldo_akhir: Number(row.saldo_akhir || 0),
        pemasukan_bulan: Number(row.pemasukan_bulan || 0),
        pengeluaran_bulan: Number(row.pengeluaran_bulan || 0)
      }))
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
}

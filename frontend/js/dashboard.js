function formatRupiah(value) {
  return `Rp${new Intl.NumberFormat('id-ID').format(Number(value || 0))}`;
}

function getSession() {
  const userRaw = localStorage.getItem('kasrt_user');
  const token = localStorage.getItem('kasrt_token');

  if (!token || !userRaw) {
    window.location.href = 'login.html';
    return null;
  }

  return { token, user: JSON.parse(userRaw) };
}

function renderUser(user) {
  const welcomeName = document.getElementById('welcomeName');
  const welcomeRoles = document.getElementById('welcomeRoles');

  if (welcomeName) welcomeName.textContent = user.nama || 'Warga';
  if (welcomeRoles) {
    const roles = Array.isArray(user.roles) ? user.roles.join(', ') : '-';
    welcomeRoles.textContent = `Role: ${roles}`;
  }
}

function hasAnyRole(user, roleNames) {
  const roles = Array.isArray(user?.roles) ? user.roles.map((r) => String(r).toLowerCase()) : [];
  return roleNames.some((role) => roles.includes(String(role).toLowerCase()));
}

function renderDate() {
  const dateEl = document.getElementById('todayDate');
  if (!dateEl) return;
  dateEl.textContent = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date());
}

function renderOptionalContributions(list) {
  const container = document.getElementById('optionalList');
  if (!container) return;

  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = `
      <div class="col-12">
        <div class="option-tile">
          <h4>Belum ada kontribusi opsional</h4>
          <p class="mb-0">Kontribusi opsional akan muncul sesuai setoran masing-masing warga.</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = list
    .filter((item) => item.is_mandatory === false)
    .map((item) => {
      const note = item.name === 'Pembangunan' ? 'Minimal Rp5.000 saat rapat RT.' : 'Kontribusi sesuai keputusan warga.';
      return `
        <div class="col-12 col-md-4">
          <div class="option-tile">
            <h4>${item.name}</h4>
            <p class="mb-2">${note}</p>
            <strong>${formatRupiah(item.amount)}</strong>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderInternetStatusForWarga(data) {
  const statusMap = {
    MENUNGGAK: 'Menunggak',
    PAS: 'Pas',
    LEBIH: 'Lebih',
    NON_MEMBER: 'Tidak ikut paket internet'
  };
  const statusLabel = statusMap[data.internet_status] || '-';

  const container = document.getElementById('optionalList');
  if (!container || !data.internet_is_member) return;

  const statusClass = data.internet_status === 'MENUNGGAK'
    ? 'text-danger'
    : data.internet_status === 'LEBIH'
      ? 'text-success'
      : 'text-muted';

  container.insertAdjacentHTML(
    'afterbegin',
    `
      <div class="col-12">
        <div class="option-tile">
          <h4>Status Iuran Internet</h4>
          <p class="mb-2">Tagihan bulanan: ${formatRupiah(data.internet_target_bulanan)}. Dibayar bulan ini: ${formatRupiah(data.internet_bulan_ini)}.</p>
          <strong class="${statusClass}">${statusLabel}</strong>
        </div>
      </div>
    `
  );
}

function updateTelegramStatus(connected) {
  const statusEl = document.getElementById('telegramStatus');
  const hintEl = document.getElementById('telegramHint');
  const btn = document.getElementById('btnActivateTelegram');

  if (connected) {
    statusEl.textContent = 'Telegram sudah terhubung. Anda akan menerima notifikasi approval.';
    hintEl.textContent = 'Jika ingin ganti akun Telegram, klik tombol aktifkan lagi lalu gunakan akun Telegram baru.';
    btn.textContent = 'Hubungkan Ulang';
  } else {
    statusEl.textContent = 'Telegram belum terhubung. Aktifkan agar notifikasi approval masuk otomatis.';
    hintEl.textContent = 'Klik tombol, lalu pada Telegram tekan Start ke bot KasRT.';
    btn.textContent = 'Aktifkan Telegram';
  }
}

async function loadMe(token) {
  const response = await fetch('/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 401) {
    localStorage.removeItem('kasrt_token');
    localStorage.removeItem('kasrt_user');
    window.location.href = 'login.html';
    return null;
  }

  const result = await response.json();
  if (!result.success) return null;
  return result.user;
}

async function loadDashboardData(token) {
  const response = await fetch('/report/dashboard', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 401) {
    localStorage.removeItem('kasrt_token');
    localStorage.removeItem('kasrt_user');
    window.location.href = 'login.html';
    return;
  }

  const result = await response.json();
  if (!result.success) throw new Error('Gagal memuat dashboard');

  const data = result.data;
  document.getElementById('targetJimpitan').textContent = formatRupiah(data.target_jimpitan_bulanan);
  document.getElementById('jimpitanBulanan').textContent = formatRupiah(data.jimpitan_bulan_ini);
  document.getElementById('targetIuranWajib').textContent = formatRupiah(data.target_iuran_wajib);
  document.getElementById('iuranWajibBulanan').textContent = formatRupiah(data.iuran_wajib_bulan_ini);
  document.getElementById('totalKontribusi').textContent = formatRupiah(data.total_kontribusi_bulan_ini);
  document.getElementById('targetDasar').textContent = `Target kontribusi dasar: ${formatRupiah(data.target_kontribusi_dasar)}`;

  renderOptionalContributions(data.optional_contributions);
  renderInternetStatusForWarga(data);
}

async function loadAdminJimpitanDashboardData(token) {
  const response = await fetch('/report/dashboard-admin-jimpitan', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 401) {
    localStorage.removeItem('kasrt_token');
    localStorage.removeItem('kasrt_user');
    window.location.href = 'login.html';
    return;
  }

  const result = await response.json();
  if (!result.success) throw new Error('Gagal memuat dashboard Admin Jimpitan');

  const data = result.data;
  document.getElementById('ajHarian').textContent = formatRupiah(data.pemasukan_harian);
  document.getElementById('ajBulanan').textContent = formatRupiah(data.pemasukan_bulanan);
  document.getElementById('ajBatchPending').textContent = Number(data.total_batch_pending || 0);
  document.getElementById('ajBatchApproved').textContent = Number(data.total_batch_approved || 0);
  document.getElementById('ajRekapBulanLalu').textContent = formatRupiah(data.rekap_bulan_lalu);
  document.getElementById('adminOpsTitle').textContent = 'Operasional Approval';
  document.getElementById('adminOpsLabel1').textContent = 'Batch Pending';
  document.getElementById('adminOpsLabel2').textContent = 'Batch Approved Bulan Ini';
  document.getElementById('adminSummaryLabel').textContent = 'Rekap Bulan Lalu (Siap Setor)';
  document.getElementById('btnAjukanSetorBendahara').classList.remove('d-none');
  document.getElementById('ajSetorHint').textContent = 'Pengajuan ini mengirim notifikasi ke Bendahara/root untuk proses setor rapat RT.';
}

function setupAjukanSetorBendahara(token) {
  const btn = document.getElementById('btnAjukanSetorBendahara');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const period = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Mengirim Pengajuan...';

    try {
      const response = await fetch('/jimpitan/ajukan-setor-bendahara', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ bulan: period })
      });

      const result = await response.json();
      if (!result.success) {
        alert(result.message || 'Gagal mengajukan setor ke Bendahara');
        return;
      }

      alert(
        `Pengajuan setor terkirim untuk periode ${result.data.periode} dengan total ${formatRupiah(result.data.total_nominal)}`
      );
    } catch (_error) {
      alert('Gagal terhubung ke server saat mengajukan setor ke Bendahara');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}

function configureDashboardByRole(user) {
  const isAdminJimpitan = hasAnyRole(user, ['Admin Jimpitan', 'root']);
  const isAdminPembangunan = hasAnyRole(user, ['Admin Pembangunan', 'root']);
  const isAdminInternet = hasAnyRole(user, ['Admin Internet', 'root']);
  const isAdminKoperasi = hasAnyRole(user, ['Admin Koperasi', 'root']);

  const titleEl = document.getElementById('dashboardTitle');
  const subtitleEl = document.getElementById('dashboardSubtitle');
  const wargaSection = document.getElementById('wargaSection');
  const wargaOptionalSection = document.getElementById('wargaOptionalSection');
  const wargaSummarySection = document.getElementById('wargaSummarySection');
  const adminJimpitanSection = document.getElementById('adminJimpitanSection');

  if (isAdminJimpitan || isAdminPembangunan || isAdminInternet || isAdminKoperasi) {
    if (titleEl) {
      titleEl.textContent = isAdminJimpitan
        ? 'Dashboard Admin Jimpitan'
        : isAdminPembangunan
          ? 'Dashboard Admin Pembangunan'
          : isAdminInternet
            ? 'Dashboard Admin Internet'
            : 'Dashboard Admin Koperasi';
    }
    if (subtitleEl) {
      subtitleEl.textContent = isAdminJimpitan
        ? 'Pantau pemasukan, approval setoran, dan rekap operasional jimpitan.'
        : isAdminPembangunan
          ? 'Kelola tabungan pembangunan bulanan dan pantau saldo yang dapat bernilai minus.'
          : isAdminInternet
            ? 'Pantau iuran internet warga: menunggak, pas, atau lebih.'
            : 'Pantau iuran koperasi. Modul simpan-pinjam detail disiapkan bertahap.';
    }
    if (wargaSection) wargaSection.classList.add('d-none');
    if (wargaOptionalSection) wargaOptionalSection.classList.add('d-none');
    if (wargaSummarySection) wargaSummarySection.classList.add('d-none');
    if (adminJimpitanSection) adminJimpitanSection.classList.remove('d-none');
    return {
      mode: isAdminJimpitan
        ? 'admin_jimpitan'
        : isAdminPembangunan
          ? 'admin_pembangunan'
          : isAdminInternet
            ? 'admin_internet'
            : 'admin_koperasi'
    };
  }

  if (adminJimpitanSection) adminJimpitanSection.classList.add('d-none');
  return { mode: 'warga' };
}

async function loadAdminPembangunanDashboardData(token) {
  const response = await fetch('/report/dashboard-admin-pembangunan', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await response.json();
  if (!result.success) throw new Error('Gagal memuat dashboard Admin Pembangunan');

  const data = result.data;
  document.querySelector('#adminJimpitanSection .contrib-card.mandatory h3').textContent = 'Setoran Pembangunan Bulan Ini';
  document.getElementById('ajHarian').textContent = formatRupiah(data.setoran_bulan_ini);
  document.querySelectorAll('#adminJimpitanSection .contrib-card.mandatory h3')[1].textContent = 'Pengeluaran Pembangunan Bulan Ini';
  document.getElementById('ajBulanan').textContent = formatRupiah(data.pengeluaran_bulan_ini);
  document.getElementById('adminOpsTitle').textContent = 'Ringkasan Akumulasi';
  document.getElementById('adminOpsLabel1').textContent = 'Total Setoran';
  document.getElementById('adminOpsLabel2').textContent = 'Total Pengeluaran';
  document.getElementById('ajBatchPending').textContent = formatRupiah(data.total_setoran_semua_waktu);
  document.getElementById('ajBatchApproved').textContent = formatRupiah(data.total_pengeluaran_semua_waktu);
  document.getElementById('adminSummaryLabel').textContent = `Saldo Pembangunan (minimal iuran ${formatRupiah(data.minimal_setoran_bulanan)}/bulan)`;
  document.getElementById('ajRekapBulanLalu').textContent = formatRupiah(data.saldo_total);
  document.getElementById('btnAjukanSetorBendahara').classList.add('d-none');
  document.getElementById('ajSetorHint').textContent = 'Saldo pembangunan boleh minus saat ada pengeluaran kegiatan RT.';
}

async function loadAdminInternetDashboardData(token) {
  const response = await fetch('/report/dashboard-admin-internet', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await response.json();
  if (!result.success) throw new Error('Gagal memuat dashboard Admin Internet');

  const data = result.data;
  document.querySelector('#adminJimpitanSection .contrib-card.mandatory h3').textContent = 'Target Internet Bulan Ini';
  document.getElementById('ajHarian').textContent = formatRupiah(data.target_bulan_ini);
  document.querySelectorAll('#adminJimpitanSection .contrib-card.mandatory h3')[1].textContent = 'Pemasukan Internet Bulan Ini';
  document.getElementById('ajBulanan').textContent = formatRupiah(data.pemasukan_bulan_ini);
  document.getElementById('adminOpsTitle').textContent = `Status Anggota (${formatRupiah(data.tarif_bulanan)}/bulan)`;
  document.getElementById('adminOpsLabel1').textContent = 'Total Menunggak';
  document.getElementById('adminOpsLabel2').textContent = 'Total Pas';
  document.getElementById('ajBatchPending').textContent = Number(data.total_menunggak || 0);
  document.getElementById('ajBatchApproved').textContent = Number(data.total_pas || 0);
  document.getElementById('adminSummaryLabel').textContent = 'Total Anggota Internet';
  document.getElementById('ajRekapBulanLalu').textContent = Number(data.total_anggota || 0);
  document.getElementById('btnAjukanSetorBendahara').classList.add('d-none');
  document.getElementById('ajSetorHint').textContent = `Anggota dengan pembayaran lebih bulan ini: ${Number(data.total_lebih || 0)} warga.`;
}

async function loadAdminKoperasiDashboardData(token) {
  const response = await fetch('/report/dashboard-admin-koperasi', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await response.json();
  if (!result.success) throw new Error('Gagal memuat dashboard Admin Koperasi');

  const data = result.data;
  document.querySelector('#adminJimpitanSection .contrib-card.mandatory h3').textContent = 'Iuran Koperasi Bulan Ini';
  document.getElementById('ajHarian').textContent = formatRupiah(data.total_bulan_ini);
  document.querySelectorAll('#adminJimpitanSection .contrib-card.mandatory h3')[1].textContent = 'Akumulasi Koperasi';
  document.getElementById('ajBulanan').textContent = formatRupiah(data.total_semua_waktu);
  document.getElementById('adminOpsTitle').textContent = 'Keanggotaan Koperasi';
  document.getElementById('adminOpsLabel1').textContent = 'Total Anggota';
  document.getElementById('adminOpsLabel2').textContent = 'Status Modul';
  document.getElementById('ajBatchPending').textContent = Number(data.total_anggota || 0);
  document.getElementById('ajBatchApproved').textContent = 'Persiapan';
  document.getElementById('adminSummaryLabel').textContent = 'Catatan';
  document.getElementById('ajRekapBulanLalu').textContent = '-';
  document.getElementById('btnAjukanSetorBendahara').classList.add('d-none');
  document.getElementById('ajSetorHint').textContent = data.catatan || '';
}

function setupTelegramActivation(token) {
  const btn = document.getElementById('btnActivateTelegram');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Membuat Link...';

    try {
      const response = await fetch('/auth/telegram-activation-link', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const result = await response.json();
      if (!result.success) {
        alert(result.message || 'Gagal membuat link aktivasi Telegram');
        return;
      }

      window.open(result.activation_link, '_blank', 'noopener');
      alert(`Link aktivasi dibuka. Berlaku ${result.expires_in_minutes} menit.`);
    } catch (error) {
      alert('Gagal terhubung ke server saat membuat link aktivasi Telegram');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}

function setupLogout() {
  const btnLogout = document.getElementById('btnLogout');
  if (!btnLogout) return;

  btnLogout.addEventListener('click', () => {
    localStorage.removeItem('kasrt_token');
    localStorage.removeItem('kasrt_user');
    window.location.href = 'login.html';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session) return;

  renderDate();
  setupLogout();
  setupTelegramActivation(session.token);

  const me = await loadMe(session.token);
  if (me) {
    localStorage.setItem('kasrt_user', JSON.stringify(me));
    renderUser(me);
    updateTelegramStatus(Boolean(me.telegram_connected));
  } else {
    renderUser(session.user);
    updateTelegramStatus(Boolean(session.user.telegram_connected));
  }

  const activeUser = me || session.user;
  const { mode } = configureDashboardByRole(activeUser);

  try {
    if (mode === 'admin_jimpitan') {
      await loadAdminJimpitanDashboardData(session.token);
      setupAjukanSetorBendahara(session.token);
    } else if (mode === 'admin_pembangunan') {
      await loadAdminPembangunanDashboardData(session.token);
    } else if (mode === 'admin_internet') {
      await loadAdminInternetDashboardData(session.token);
    } else if (mode === 'admin_koperasi') {
      await loadAdminKoperasiDashboardData(session.token);
    } else {
      await loadDashboardData(session.token);
    }
  } catch (_error) {
    const container = document.getElementById('optionalList');
    if (container && mode === 'warga') {
      container.innerHTML = `
        <div class="col-12">
          <div class="option-tile">
            <h4>Gagal memuat data</h4>
            <p class="mb-0">Periksa koneksi backend atau token login Anda.</p>
          </div>
        </div>
      `;
    }
    if (mode !== 'warga') {
      alert('Gagal memuat data dashboard admin');
    }
  }
});

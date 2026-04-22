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

  const titleEl = document.getElementById('dashboardTitle');
  const subtitleEl = document.getElementById('dashboardSubtitle');
  const wargaSection = document.getElementById('wargaSection');
  const wargaOptionalSection = document.getElementById('wargaOptionalSection');
  const wargaSummarySection = document.getElementById('wargaSummarySection');
  const adminJimpitanSection = document.getElementById('adminJimpitanSection');

  if (isAdminJimpitan) {
    if (titleEl) titleEl.textContent = 'Dashboard Admin Jimpitan';
    if (subtitleEl) subtitleEl.textContent = 'Pantau pemasukan, approval setoran, dan rekap operasional jimpitan.';
    if (wargaSection) wargaSection.classList.add('d-none');
    if (wargaOptionalSection) wargaOptionalSection.classList.add('d-none');
    if (wargaSummarySection) wargaSummarySection.classList.add('d-none');
    if (adminJimpitanSection) adminJimpitanSection.classList.remove('d-none');
    return { isAdminJimpitan: true };
  }

  if (adminJimpitanSection) adminJimpitanSection.classList.add('d-none');
  return { isAdminJimpitan: false };
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
  const { isAdminJimpitan } = configureDashboardByRole(activeUser);

  try {
    if (isAdminJimpitan) {
      await loadAdminJimpitanDashboardData(session.token);
      setupAjukanSetorBendahara(session.token);
    } else {
      await loadDashboardData(session.token);
    }
  } catch (_error) {
    const container = document.getElementById('optionalList');
    if (container && !isAdminJimpitan) {
      container.innerHTML = `
        <div class="col-12">
          <div class="option-tile">
            <h4>Gagal memuat data</h4>
            <p class="mb-0">Periksa koneksi backend atau token login Anda.</p>
          </div>
        </div>
      `;
    }
    if (isAdminJimpitan) {
      alert('Gagal memuat data dashboard Admin Jimpitan');
    }
  }
});

const API_BASE_URL = 'http://localhost:3005';

function formatRupiah(value) {
  return `Rp${new Intl.NumberFormat('id-ID').format(Number(value || 0))}`;
}

function renderUser() {
  const userRaw = localStorage.getItem('kasrt_user');
  const token = localStorage.getItem('kasrt_token');

  if (!token || !userRaw) {
    window.location.href = 'login.html';
    return null;
  }

  const user = JSON.parse(userRaw);
  const welcomeName = document.getElementById('welcomeName');
  const welcomeRoles = document.getElementById('welcomeRoles');

  if (welcomeName) welcomeName.textContent = user.nama || 'Warga';
  if (welcomeRoles) {
    const roles = Array.isArray(user.roles) ? user.roles.join(', ') : '-';
    welcomeRoles.textContent = `Role: ${roles}`;
  }

  return { token, user };
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

async function loadDashboardData(token) {
  const response = await fetch(`${API_BASE_URL}/report/dashboard`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    localStorage.removeItem('kasrt_token');
    localStorage.removeItem('kasrt_user');
    window.location.href = 'login.html';
    return;
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error('Gagal memuat dashboard');
  }

  const data = result.data;

  document.getElementById('targetJimpitan').textContent = formatRupiah(data.target_jimpitan_bulanan);
  document.getElementById('jimpitanBulanan').textContent = formatRupiah(data.jimpitan_bulan_ini);
  document.getElementById('targetIuranWajib').textContent = formatRupiah(data.target_iuran_wajib);
  document.getElementById('iuranWajibBulanan').textContent = formatRupiah(data.iuran_wajib_bulan_ini);
  document.getElementById('totalKontribusi').textContent = formatRupiah(data.total_kontribusi_bulan_ini);
  document.getElementById('targetDasar').textContent = `Target kontribusi dasar: ${formatRupiah(data.target_kontribusi_dasar)}`;

  renderOptionalContributions(data.optional_contributions);
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
  const session = renderUser();
  if (!session) return;

  renderDate();
  setupLogout();

  try {
    await loadDashboardData(session.token);
  } catch (error) {
    const container = document.getElementById('optionalList');
    if (container) {
      container.innerHTML = `
        <div class="col-12">
          <div class="option-tile">
            <h4>Gagal memuat data</h4>
            <p class="mb-0">Periksa koneksi backend atau token login Anda.</p>
          </div>
        </div>
      `;
    }
  }
});

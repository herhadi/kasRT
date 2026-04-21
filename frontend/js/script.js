/* =========================
   KONFIGURASI API
========================= */
const API_URL = "http://localhost:3005";
let currentUser = null;
let authToken = null;
let bootstrapModal; // Modal Input
let confirmLogoutModal; // Modal Logout
let modalTopUpObj;
let adminModalObj;
let modalTopUpFormObj;


/* =========================
   INIT & SESSION
========================= */
document.addEventListener("DOMContentLoaded", function () {
    // HAPUS deklarasi ulang dengan 'let' di sini!
    // Langsung gunakan variabel global yang sudah dideklarasikan di atas

    // Cek elemen modal sebelum inisialisasi
    const modalEl = document.getElementById('modalInput');
    if (modalEl) {
        bootstrapModal = new bootstrap.Modal(modalEl);
    } else {
        console.warn('Elemen modalInput tidak ditemukan');
    }

    const logoutModalEl = document.getElementById('confirmLogoutModal');
    if (logoutModalEl) {
        confirmLogoutModal = new bootstrap.Modal(logoutModalEl);
    } else {
        console.warn('Elemen confirmLogoutModal tidak ditemukan');
    }

    // Proteksi Input PIN agar hanya angka - dengan pengecekan elemen
    ['loginPin', 'regPin1', 'regPin2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', function () {
                this.value = this.value.replace(/[^0-9]/g, '').slice(0, 6);
            });
        }
    });

    // Cek sesi utama dari login.html/index.html (JWT)
    try {
        const sesiJwt = localStorage.getItem('kasrt_user');
        const tokenJwt = localStorage.getItem('kasrt_token');
        const sesiLegacy = localStorage.getItem('sesi_petugas');
        const authOverlay = document.getElementById('authOverlay');
        const sapaanUser = document.getElementById('sapaanUser');

        if (!authOverlay) {
            console.error('Elemen authOverlay tidak ditemukan!');
            return;
        }

        if (sesiJwt && tokenJwt) {
            const dataSesi = JSON.parse(sesiJwt);
            currentUser = {
                id: dataSesi.id,
                nama: dataSesi.nama,
                roles: Array.isArray(dataSesi.roles) ? dataSesi.roles : [],
                role: Array.isArray(dataSesi.roles) ? (dataSesi.roles[0] || "") : ""
            };
            authToken = tokenJwt;
            authOverlay.style.display = 'none';

            const isAdmin = currentUser.roles.includes("Admin") || currentUser.roles.includes("Admin Jimpitan");
            if (isAdmin) {
                const btnAdmin = document.getElementById('btnAdminPanel');
                if (btnAdmin) btnAdmin.style.display = 'inline-block';
            }

            if (sapaanUser) {
                sapaanUser.innerText = "😊 " + currentUser.nama;
            }

            muatData();
        } else if (sesiLegacy) {
            const dataSesi = JSON.parse(sesiLegacy);
            currentUser = dataSesi;
            authOverlay.style.display = 'none';
            if (sapaanUser) {
                sapaanUser.innerText = "😊 " + dataSesi.nama;
            }
            muatData();
        } else {
            authOverlay.style.display = 'block';
        }
    } catch (error) {
        console.error('Error saat cek sesi:', error);
    }
});

/* =========================
   CORE API FUNCTION
========================= */
async function apiCall(action, data = {}) {
    console.log(`🚀 [API Request] Action: ${action}`, data); // DEBUG
    try {
        // Kita tidak pakai google.script.run, kita pakai FETCH
        const response = await fetch(API_URL, {
            method: "POST",
            mode: "cors", // Pastikan mode CORS aktif
            body: JSON.stringify({ action, data })
        });

        // Cek status HTTP (harus 200/302)
        if (!response.ok) {
            console.error(`❌ [HTTP Error] Status: ${response.status}`);
            return { success: false, message: "HTTP Error " + response.status };
        }

        const result = await response.json();
        console.log(`✅ [API Response] Raw:`, result); // DEBUG
        return result;
    } catch (err) {
        console.error("API Error:", err);
        showToast("Gagal terhubung ke server!", "danger");
        return { success: false };
    }
}

/* =========================
   AUTH LOGIC
========================= */

async function lanjutStep2(btn) {
    const inputNoHp = document.getElementById('authNoHp');
    const noHp = inputNoHp ? inputNoHp.value.trim() : "";

    if (!noHp || noHp.length < 10) {
        showToast("Masukkan nomor HP yang valid!", "warning");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Mengecek...`;

    const res = await apiCall("auth", { mode: "check", noHp: noHp });

    if (res && res.success) {
        if (res.exists) {
            // User terdaftar -> ke halaman PIN
            document.getElementById('step1').style.display = 'none';
            document.getElementById('stepLogin').style.display = 'block';
            document.getElementById('sapaNamaLogin').innerText = "Halo, " + (res.user || "Petugas");
        } else {
            // PERUBAHAN DISINI: User tidak ditemukan -> Toast Warning & ke Daftar
            showToast("Nomor HP belum terdaftar. Silakan lengkapi data.", "warning");
            document.getElementById('step1').style.display = 'none';
            document.getElementById('stepDaftar').style.display = 'block';
        }
    } else {
        showToast("Sistem error: " + (res?.message || "Coba lagi nanti"), "error");
    }

    btn.disabled = false;
    btn.innerText = "Lanjut";
}

async function loginFinal(btn) {
    const noHp = document.getElementById('authNoHp').value;
    const pin = document.getElementById('loginPin').value;

    if (pin.length < 4 || pin.length > 6) {
        showToast("PIN minimal 4 angka!", "warning");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Verifikasi...";

    const res = await apiCall("auth", { mode: "login", noHp: noHp, pin: pin });

    if (res.success) {
        const dataSesi = {
            nama: res.user,
            role: res.role,
            noHp: noHp,
            exp: Date.now() + (24 * 60 * 60 * 1000)
        };
        localStorage.setItem('sesi_petugas', JSON.stringify(dataSesi));
        showToast("Login Berhasil!", "success");
        setTimeout(() => location.reload(), 1000);
    } else {
        showToast(res.message || "PIN Salah!", "danger");
        btn.disabled = false;
        btn.innerText = "Masuk Sekarang";
    }
}

async function daftarFinal(btn) {
    const nama = document.getElementById('regNama').value.trim();
    const pin1 = document.getElementById('regPin1').value.trim();
    const pin2 = document.getElementById('regPin2').value.trim();
    const noHp = document.getElementById('authNoHp').value.trim();

    if (!nama || !pin1 || !pin2) {
        showToast("Semua kolom wajib diisi!", "warning");
        return;
    }

    // VALIDASI TAMBAHAN: PIN harus 4 digit
    if (pin1.length < 4 || pin1.length > 6) {
        showToast("PIN minimal 4 digit angka!", "warning");
        return;
    }

    // Validasi PIN Cocok
    if (pin1 !== pin2) {
        showToast("PIN tidak cocok! Pastikan ulangi PIN dengan benar.", "error"); // Toast Merah
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Mendaftar...`;

    // Kirim action "auth" dengan mode "daftar" ke Project B (GAS)
    const res = await apiCall("auth", {
        mode: "daftar",
        nama: nama,
        noHp: noHp,
        pin: pin1
    });

    if (res && res.success) {
        document.getElementById('stepDaftar').style.display = 'none';
        document.getElementById('stepMenunggu').style.display = 'block';
        showToast("Pendaftaran dikirim ke Admin!", "success");
    } else {
        showToast("Pendaftaran gagal: " + res.message, "error");
    }

    btn.disabled = false;
    btn.innerText = "Daftar Petugas";
}


/* =========================
   DATA MANAGEMENT
========================= */

async function muatData() {
    console.log("[UI][JIMPITAN] muatData() start", {
        hasToken: Boolean(authToken),
        currentUser
    });
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.style.display = 'flex';

    try {
        const res = await fetch('/jimpitan/list', {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
        });
        console.log("[UI][JIMPITAN] GET /jimpitan/list status", res.status);
        const json = await res.json();
        console.log("[UI][JIMPITAN] GET /jimpitan/list body", json);

        if (json.success) {
            masterDataWarga = json.data.map(w => ({
                id: w.id,
                nama: w.nama,

                // mapping ke format lama UI kamu
                isLunas: w.status === 'LUNAS',
                nominalTerbayar: Number(w.nominalTerbayar || 0),
                nominalSaran: Number(w.nominalSaran || 0),
                namaPetugas: w.namaPetugas || null
            }));

            updateHeaderTanggal();
            terapkanFilter();
            cekStatusTombolWA();
            cekStatusTombolSetor();
        }

    } catch (err) {
        console.error(err);
        showToast("Gagal ambil data", "danger");
    }

    if (loader) loader.style.display = 'none';
}

function terapkanFilter() {
    const filterValue = document.getElementById('filterStatus').value;
    const container = document.getElementById('kontenWarga');

    // Ambil nama petugas yang sedang login
    const petugasLogin = currentUser ? currentUser.nama : "Petugas Web";

    let html = '';
    let stats = { lunas: 0, kosong: 0, belum: 0, total: 0 };

    masterDataWarga.forEach(w => {
        // 1. HITUNG STATISTIK
        if (w.isLunas) {
            if (w.nominalTerbayar > 0) {
                stats.lunas++;

                // LOGIKA PENTING: Hanya jumlahkan ke TOTAL jika diinput oleh saya sendiri
                if (w.namaPetugas === petugasLogin) {
                    stats.total += w.nominalTerbayar;
                }
            } else {
                stats.kosong++;
            }
        } else {
            stats.belum++;
        }

        // 2. LOGIKA TAMPILAN
        const diinputOrangLain = w.isLunas && w.namaPetugas && w.namaPetugas !== petugasLogin;
        const detailPetugas = diinputOrangLain ? ` (${w.namaPetugas})` : "";

        let cardClass = '';
        let badgeClass = '';
        let badgeText = '';
        let actionKlik = '';

        if (w.isLunas) {
            actionKlik = 'style="pointer-events: none;"';
            if (w.nominalTerbayar > 0) {
                cardClass = 'card-lunas';
                badgeClass = 'badge-lunas';
                if (w.namaPetugas === "Deposit" || w.namaPetugas === "Sistem (Saldo)") {
                    badgeText = `🏦 Deposit${detailPetugas}`;
                } else {
                    badgeText = `✅ Rp ${Number(w.nominalTerbayar).toLocaleString('id-ID')}${detailPetugas}`;
                }
            } else {
                cardClass = 'card-kosong';
                badgeClass = 'badge-kosong';
                badgeText = `⚪ Kosong${detailPetugas}`;
            }
        } else {
            cardClass = 'card-belum';
            badgeClass = 'badge-belum';
            badgeText = '🔴 Rp ' + w.nominalSaran.toLocaleString();
            actionKlik = `onclick="bukaModal('${w.nama}', '${w.id}')"`;
        }

        // 3. FILTER TAMPILAN (Sama seperti sebelumnya)
        let isShow = false;
        if (filterValue === "semua") isShow = true;
        else if (filterValue === "belum" && !w.isLunas) isShow = true;
        else if (filterValue === "sudah" && w.isLunas) isShow = true;

        if (isShow) {
            html += `
                <div class="item-warga">
                    <div class="card kartu-warga ${cardClass}" ${actionKlik}>
                        <div class="card-body-custom">
                            <div class="nama-warga">${w.nama}</div>
                            <div class="badge-status ${badgeClass}">${badgeText}</div>
                        </div>
                    </div>
                </div>`;
        }
    });

    // UPDATE UI
    container.innerHTML = html || '<div class="text-center p-5 text-muted">Tidak ada data.</div>';

    document.getElementById('statLunas').innerText = stats.lunas;
    document.getElementById('statKosong').innerText = stats.kosong;
    document.getElementById('statBelum').innerText = stats.belum;

    // Sekarang akan muncul 26.000 (karena yang 1.000 punya orang lain tidak dijumlahkan)
    document.getElementById('totalPendapatan').innerText = "Rp " + stats.total.toLocaleString('id-ID');
}

async function kirimData(nominal) {
    const sekarang = new Date();
    const jam = sekarang.getHours();
    const roles = currentUser ? (currentUser.roles || [currentUser.role]) : ["Petugas"];
    const normalizedRoles = roles.map(r => String(r).trim().toLowerCase());
    const isBypassShift = normalizedRoles.includes("root") || normalizedRoles.includes("admin") || normalizedRoles.includes("admin jimpitan");
    console.log("[UI][JIMPITAN] role check", { roles, normalizedRoles, isBypassShift, jam });

    if (!isBypassShift && (jam >= 6 && jam < 21)) {
        bootstrapModal.hide();
        showToast("❌ Gagal: Sudah masuk jam istirahat operasional.", "error");
        return;
    }

    const n = parseInt(nominal);

    if (!selectedWargaId) {
        showToast("Warga tidak valid", "danger");
        return;
    }

    bootstrapModal.hide();

    try {
        const payload = {
            warga_id: selectedWargaId,
            nominal: n
        };
        console.log("[UI][JIMPITAN] POST /jimpitan/input payload", payload);

        const response = await fetch('/jimpitan/input', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log("[UI][JIMPITAN] POST /jimpitan/input status/body", response.status, result);
        if (!response.ok || !result.success) {
            throw new Error(result.message || "Gagal simpan");
        }

        showToast("✅ Berhasil disimpan", "success");

        // reload data biar akurat
        muatData();

    } catch (err) {
        console.error(err);
        showToast("Gagal simpan", "danger");
    }
}

/* =========================
   UI HELPERS
========================= */
function showToast(msg, type) {
    const container = document.getElementById('toastContainer');
    // Jika container tidak ada, fallback ke alert biasa
    if (!container) return alert(msg);

    // Pemetaan warna agar sesuai dengan class Bootstrap
    // Jika kita kirim 'error', otomatis diubah jadi 'danger' agar berwarna merah
    let bsType = type;
    if (type === 'error') bsType = 'danger';
    if (type === 'info') bsType = 'primary';

    const id = "ts" + Date.now();

    // text-bg-${bsType} akan menghasilkan text-bg-danger (merah), text-bg-warning (kuning), dll.
    const html = `
        <div id="${id}" class="toast align-items-center text-bg-${bsType} border-0 mb-2" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body fw-bold">
                    ${msg}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>`;

    container.insertAdjacentHTML('beforeend', html);

    const toastEl = document.getElementById(id);
    const toast = new bootstrap.Toast(toastEl, { delay: 3000 }); // Hilang otomatis dalam 3 detik

    toast.show();

    // Hapus elemen dari DOM setelah toast benar-benar hilang agar tidak menumpuk di HTML
    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

let selectedWargaId = null;

function bukaModal(nama, id) {
    const sekarang = new Date();
    const jam = sekarang.getHours();
    const roles = currentUser ? (currentUser.roles || [currentUser.role]) : ["Petugas"];
    const normalizedRoles = roles.map(r => String(r).trim().toLowerCase());
    const isBypassShift = normalizedRoles.includes("root") || normalizedRoles.includes("admin") || normalizedRoles.includes("admin jimpitan");
    console.log("[UI][JIMPITAN] role check", { roles, normalizedRoles, isBypassShift, jam });

    if (!isBypassShift && (jam >= 6 && jam < 21)) {
        showToast("⚠️ Jam operasional tutup. Input dibuka pukul 21.00 WIB", "error");
        return;
    }

    selectedWargaId = id;

    document.getElementById('labelNamaWarga').innerText = nama;

    const warga = masterDataWarga.find(w => w.id === id);

    const infoSaran = document.getElementById('infoSaranWarga');
    if (infoSaran && warga) {
        infoSaran.innerText = `Saran: Rp ${warga.nominalSaran.toLocaleString('id-ID')}`;
    }

    bootstrapModal.show();
}

function showLogoutConfirm() {
    if (confirmLogoutModal) {
        confirmLogoutModal.show();
    } else {
        // Fallback jika modal gagal load, pakai confirm biasa
        if (confirm("Apakah Anda yakin ingin logout?")) {
            logout();
        }
    }
}

function logout() {
    // 1. Tutup modal secara paksa menggunakan instance Bootstrap
    if (confirmLogoutModal) confirmLogoutModal.hide();
    if (bootstrapModal) bootstrapModal.hide();

    // 2. Bersihkan paksa backdrop yang sering tertinggal (penyebab tidak bisa ngetik)
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(el => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';

    // 3. Logika pembersihan data kamu yang sudah ada
    localStorage.clear();
    masterDataWarga = [];
    currentUser.nama = null;

    document.getElementById('authOverlay').style.display = 'block';
    document.getElementById('step1').style.display = 'block';
    document.getElementById('stepLogin').style.display = 'none';
    document.getElementById('stepDaftar').style.display = 'none';
    document.getElementById('stepMenunggu').style.display = 'none';

    document.getElementById('authNoHp').value = '';

    document.getElementById('kontenWarga').innerHTML = '';
    document.getElementById('statLunas').innerText = '0';
    document.getElementById('statKosong').innerText = '0';
    document.getElementById('statBelum').innerText = '0';
    document.getElementById('totalPendapatan').innerText = 'Rp 0';

    showToast("Berhasil keluar", 'info');
}

function tampilkanInputManual() {
    const areaTombol = document.getElementById('areaTombolLainnya');
    const areaInput = document.getElementById('areaInputManual');
    const inputField = document.getElementById('inputCustom');

    areaTombol.style.display = 'none';
    areaInput.style.display = 'block';

    // Otomatis fokus ke input agar user bisa langsung mengetik
    setTimeout(() => inputField.focus(), 200);
}

// Tambahkan ini agar saat pindah ke warga lain, 
// tampilan modal kembali menunjukkan tombol "Nominal Lainnya"
document.getElementById('modalInput').addEventListener('hidden.bs.modal', function () {
    document.getElementById('areaTombolLainnya').style.display = 'block';
    document.getElementById('areaInputManual').style.display = 'none';
    document.getElementById('inputCustom').value = '';
});

function kembaliKeStep1() {
    // Sembunyikan semua kemungkinan layar yang sedang aktif
    document.getElementById('stepDaftar').style.display = 'none';
    document.getElementById('stepLogin').style.display = 'none';
    document.getElementById('stepMenunggu').style.display = 'none';

    // Bersihkan input di form daftar agar fresh jika user masuk lagi
    document.getElementById('regNama').value = '';
    document.getElementById('regPin1').value = '';
    document.getElementById('regPin2').value = '';

    // Tampilkan hanya Step 1
    document.getElementById('step1').style.display = 'block';

    const containerRekap = document.getElementById('containerRekapWA');
    if (containerRekap) containerRekap.style.display = 'none';

    // Opsional: Fokuskan kembali ke input No HP
    setTimeout(() => {
        document.getElementById('authNoHp').focus();
    }, 100);
}

function cekStatusTombolWA() {
    // 1. Tombol hanya muncul jika ada warga yang bayar TUNAI (bukan Deposit/Saldo)
    const adaDataTunai = masterDataWarga.some(w =>
        w.isLunas &&
        Number(w.nominalTerbayar) > 0 &&
        w.namaPetugas !== "Deposit" &&
        w.namaPetugas !== "Sistem (Saldo)"
    );

    const container = document.getElementById('containerRekapWA');

    if (container) {
        // Tombol muncul HANYA jika ada minimal 1 warga yang ditarik tunai oleh petugas
        if (adaDataTunai) {
            container.style.display = 'block';
            container.classList.add('fade-in');
        } else {
            container.style.display = 'none';
        }
    }
}

function kirimRekapWA() {
    if (!masterDataWarga || masterDataWarga.length === 0) {
        showToast("Data warga tidak ditemukan!", "warning");
        return;
    }

    // 1. LOGIKA PENENTUAN TANGGAL OPERASIONAL
    var d = new Date();
    // Jika diklik kapanpun sebelum jam 18:00 (6 sore), 
    // kita asumsikan ingin merekap data operasional semalam.
    if (d.getHours() < 18) {
        d.setDate(d.getDate() - 1);
    }

    var hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    var bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    var tglHeader = hari[d.getDay()] + ", " + d.getDate() + " " + bulan[d.getMonth()] + " " + d.getFullYear();

    var pesan = "📝 *REKAP JIMPITAN WARGA*\n";
    pesan += "📅 *" + tglHeader + "*\n";
    pesan += "━━━━━━━━━━━━━━━\n";

    var totalTunai = 0;      // Khusus uang fisik
    var wargaTunai = 0;      // Hitung orang bayar cash
    var wargaBelum = 0;
    var wargaKosong = 0;
    var wargaDeposit = 0;    // Hitung orang potong saldo

    for (var i = 0; i < masterDataWarga.length; i++) {
        var w = masterDataWarga[i];

        pesan += (i + 1) + ". *" + w.nama.toUpperCase() + "*\n";

        // CEK STATUS BERDASARKAN BACKEND
        if (w.isLunas) {
            // Jika Petugasnya adalah "Deposit" atau "Sistem (Saldo)"
            if (w.namaPetugas === "Deposit" || w.namaPetugas === "Sistem (Saldo)") {
                pesan += "      └─ 🏦 _Lunas (Deposit)_\n";
                wargaDeposit++;
                // JANGAN tambahkan ke totalTunai
            }
            else if (w.nominalTerbayar > 0) {
                pesan += "      └─ ✅ Rp " + Number(w.nominalTerbayar).toLocaleString('id-ID') + "\n";
                totalTunai += Number(w.nominalTerbayar);
                wargaTunai++;
            }
            else {
                pesan += "      └─ ⚪ _Kosong_\n";
                wargaKosong++;
            }
        } else {
            pesan += "      └─ 🔴 _Belum_\n";
            wargaBelum++;
        }
    }

    pesan += "\n━━━━━━━━━━━━━━━\n";
    pesan += "💰 *TOTAL TUNAI: Rp " + totalTunai.toLocaleString('id-ID') + "*\n";

    pesan += "📊 *STATISTIK:*\n";
    pesan += "   ✅ Lunas (Tunai): " + wargaTunai + "\n";
    pesan += "   🏦 Lunas (Deposit): " + wargaDeposit + "\n";
    pesan += "   ⚪ Kosong: " + wargaKosong + "\n";
    pesan += "   🔴 Belum: " + wargaBelum + "\n";
    pesan += "━━━━━━━━━━━━━━━\n";
    pesan += "_Dilaporkan oleh: " + (currentUser ? currentUser.nama : "Petugas Web") + "_\n";

    // Kirim via WhatsApp
    if (navigator.share) {
        // Jika dibuka di HP (Chrome/Safari), akan muncul menu SHARE sistem
        navigator.share({
            title: 'Rekap Jimpitan',
            text: pesan
        })
            .then(() => console.log('Berhasil berbagi'))
            .catch((error) => console.log('Batal berbagi:', error));
    } else {
        // CADANGAN: Jika dibuka di Laptop atau browser tidak support share
        // Masukkan nomor admin utama di sini sebagai tujuan default
        var nomorAdmin = "628561186917";
        var urlWA = "https://api.whatsapp.com/send?phone=" + nomorAdmin + "&text=" + encodeURIComponent(pesan);
        window.open(urlWA, '_blank');
        showToast("Browser tidak mendukung share, diarahkan ke WA Admin.", "info");
    }
}

function cekStatusTombolSetor() {
    const elTotal = document.getElementById('totalPendapatan');
    const btnSetor = document.getElementById('btnSetorUtama');

    if (!elTotal || !btnSetor) return;

    const teks = elTotal.innerText;
    const angka = parseInt(teks.replace(/[^0-9]/g, '')) || 0;

    if (angka > 0) {
        // Aktifkan tombol jika ada uang
        btnSetor.disabled = false;
        btnSetor.classList.remove('opacity-50'); // Agar warna lebih cerah saat aktif
    } else {
        // Matikan tombol jika Rp 0
        btnSetor.disabled = true;
        btnSetor.classList.add('opacity-50'); // Efek visual redup saat mati
    }
}

async function konfirmasiSetor() {
    // Pastikan variabel API_URL sudah didefinisikan di awal script.js
    if (typeof currentUser === 'undefined' || !currentUser.nama) {
        alert("⚠️ Sesi login tidak ditemukan.");
        return;
    }

    const total = document.getElementById('totalPendapatan').innerText;
    if (!confirm(`Setorkan dana ${total} ke Admin?`)) return;

    const btnSetor = document.getElementById('btnSetorUtama');
    const loader = document.getElementById('loading-overlay');

    if (loader) loader.style.display = 'flex';
    btnSetor.disabled = true;

    try {
        console.log("[UI][JIMPITAN] POST /jimpitan/setor payload", {});
        const response = await fetch('/jimpitan/setor', {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
            },
            body: JSON.stringify({})
        });

        const res = await response.json();
        console.log("[UI][JIMPITAN] POST /jimpitan/setor status/body", response.status, res);

        if (loader) loader.style.display = 'none';

        if (res.success) {
            alert("✅ " + res.message);
            btnSetor.innerText = "TERKIRIM";
            btnSetor.classList.replace('btn-primary', 'btn-success');
        } else {
            alert("❌ " + res.message);
            btnSetor.disabled = false;
        }
    } catch (err) {
        if (loader) loader.style.display = 'none';
        btnSetor.disabled = false;
        console.error("Fetch Error:", err);
        alert("⚠️ Terjadi gangguan koneksi ke server.");
    }
}

function updateHeaderTanggal() {
    var d = new Date();
    // Tetap gunakan batas jam 12 siang untuk sinkronisasi data semalam
    if (d.getHours() < 12) {
        d.setDate(d.getDate() - 1);
    }

    var hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    var bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    var tglDisplay = hari[d.getDay()] + ", " + d.getDate() + " " + bulan[d.getMonth()] + " " + d.getFullYear();

    var el = document.getElementById('display-tgl-operasional');
    if (el) {
        // Tampilan baru: Jimpitan Selasa, 24 Februari 2026
        // el.innerText = "🏠 Jimpitan " + tglDisplay;
        el.innerText = tglDisplay;
    }
}

/**
 * Fungsi khusus Admin untuk menambah saldo warga (Deposit)
 */
function adminTopUpSaldo(data) {
    const shWarga = ss.getSheetByName("Warga");
    const dataWarga = shWarga.getDataRange().getValues();
    const nominal = parseInt(data.nominal);

    for (let i = 1; i < dataWarga.length; i++) {
        if (dataWarga[i][1] === data.namaWarga) {
            const cellSaldo = shWarga.getRange(i + 1, 6);
            const saldoLama = parseFloat(dataWarga[i][5]) || 0;

            // Update Saldo
            cellSaldo.setValue(saldoLama + nominal);

            // Kirim Notif ke Telegram para Admin
            const pesan = `💰 <b>ADMIN TOP UP</b>\n🏠 Warga: <b>${data.namaWarga}</b>\n💵 Nominal: Rp ${nominal.toLocaleString('id-ID')}\n👤 Oleh: ${data.adminNama}`;
            notifikasiAdmin(pesan);

            return { success: true, message: `Berhasil menambah saldo ${data.namaWarga}` };
        }
    }
    return { success: false, message: "Nama warga tidak ditemukan" };
}

function menuTopUp() {
    // Tutup modal admin utama
    if (adminModalObj) adminModalObj.hide();

    // Pastikan modal input topup ada di HTML (lihat poin 3)
    if (!modalTopUpObj) {
        modalTopUpObj = new bootstrap.Modal(document.getElementById('modalTopUpForm'));
    }

    // Isi daftar warga ke Select
    const selectWarga = document.getElementById('selectWargaTopUp');
    selectWarga.innerHTML = masterDataWarga.reverse().map(w => `<option value="${w.nama}">${w.nama}</option>`).join('');

    modalTopUpObj.show();
}

async function prosesSimpanTopUp() {
    const nama = document.getElementById('selectWargaTopUp').value;
    const nominal = document.getElementById('inputNominalTopUp').value;
    const btn = document.getElementById('btnEksekusiTopUp');

    if (!nominal || nominal <= 0) return showToast("Masukkan nominal valid!", "warning");

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Memproses...`;

    // Ambil data admin dari sesi login
    const sesi = JSON.parse(localStorage.getItem('sesi_petugas'));

    const res = await apiCall("topUp", {
        namaWarga: nama,
        nominal: nominal,
        adminNama: sesi.nama,
        adminPhone: sesi.noHp
    });

    if (res.success) {
        showToast(res.message, "success");
        modalTopUpObj.hide();
        muatData(); // Refresh data biar saldo berubah
    } else {
        showToast(res.message, "danger");
    }
    btn.disabled = false;
    btn.innerText = "SIMPAN TOP UP";
}

async function prosesTopUp(btn) {
    const nama = document.getElementById('topUpNamaWarga').value;
    const nominal = document.getElementById('topUpNominal').value;

    if (!nominal || nominal <= 0) return showToast("Masukkan nominal valid!", "warning");

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Memproses...`;

    const res = await apiCall("adminTopUp", {
        namaWarga: nama,
        nominal: nominal,
        adminNama: currentUser.nama
    });

    if (res.success) {
        showToast(res.message, "success");
        modalTopUpObj.hide();
        muatData(); // Refresh data agar saldo terbaru muncul
    } else {
        showToast(res.message, "danger");
    }
    btn.disabled = false;
    btn.innerText = "SIMPAN DEPOSIT";
}

function bukaModalAdmin() {
    // Cari elemen modalAdmin di HTML
    const modalEl = document.getElementById('modalAdmin');

    if (!modalEl) {
        return showToast("Elemen modalAdmin tidak ditemukan!", "danger");
    }

    // Inisialisasi hanya jika belum ada
    if (!adminModalObj) {
        adminModalObj = new bootstrap.Modal(modalEl);
    }

    adminModalObj.show();
}

function bukaModalTopUp() {
    // Tutup modal admin utama dulu agar tidak tumpang tindih
    adminModalObj.hide();

    // Isi dropdown nama warga dari masterDataWarga yang sudah ada
    const select = document.getElementById('selectWargaTopUp');
    select.innerHTML = masterDataWarga
        .map(w => `<option value="${w.nama}">${w.nama}</option>`)
        .join('');

    if (!modalTopUpFormObj) {
        modalTopUpFormObj = new bootstrap.Modal(document.getElementById('modalTopUpForm'));
    }
    modalTopUpFormObj.show();
}

async function eksekusiTopUp() {
    const nama = document.getElementById('selectWargaTopUp').value;
    const nominal = document.getElementById('inputNominalTopUp').value;

    // Ambil data admin dari sesi yang tersimpan
    const sesi = JSON.parse(localStorage.getItem('sesi_petugas'));

    const res = await apiCall("topUp", {
        namaWarga: nama,
        nominal: nominal,
        adminNama: sesi.nama,
        adminPhone: sesi.noHp // Ini penting untuk verifikasi Whitelist di backend
    });

    if (res.success) {
        showToast(res.message, "success");
        modalTopUpFormObj.hide();
        muatData();
    } else {
        showToast(res.message, "danger");
    }
}

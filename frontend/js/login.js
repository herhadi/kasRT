const loginForm = document.getElementById('loginForm');
const btnLogin = document.getElementById('btnLogin');
const loginMessage = document.getElementById('loginMessage');

function setMessage(text, kind = 'danger') {
  loginMessage.className = `small mt-3 mb-0 text-${kind}`;
  loginMessage.textContent = text;
}

function saveSession(payload) {
  localStorage.setItem('kasrt_token', payload.token);
  localStorage.setItem('kasrt_user', JSON.stringify(payload.user));
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const no_hp = document.getElementById('no_hp').value.trim();
  const pin = document.getElementById('pin').value.trim();

  if (!no_hp || !pin) {
    setMessage('Nomor HP dan PIN wajib diisi.', 'warning');
    return;
  }

  btnLogin.disabled = true;
  btnLogin.textContent = 'Memproses...';
  setMessage('');

  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ no_hp, pin })
    });

    const result = await response.json();

    if (!result.success) {
      setMessage(result.message || 'Login gagal.', 'danger');
      return;
    }

    saveSession(result);
    setMessage('Login berhasil. Mengarahkan ke dashboard...', 'success');

    setTimeout(() => {
      window.location.href = 'index.html';
    }, 600);
  } catch (error) {
    setMessage('Tidak bisa terhubung ke server.', 'danger');
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = 'Masuk';
  }
});

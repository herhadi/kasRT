export function buildPinResetConfirmationMessage(name, defaultPin = process.env.DEFAULT_USER_PIN) {
  return (
    `✅ PIN KasRT untuk ${name} sudah di-reset ke PIN default: ${String(defaultPin || '').trim()}.\n\n` +
    'Login: https://kas02.vercel.app\n\n' +
    'Segera ganti PIN setelah login.'
  );
}

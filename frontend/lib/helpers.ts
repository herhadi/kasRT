export function formatRupiah(value: number | string) {
  return `Rp ${new Intl.NumberFormat('id-ID').format(Number(value || 0))}`;
}

export function digitsOnly(value: string) {
  return String(value || '').replace(/\D+/g, '');
}

export function formatRupiahInput(value: string | number) {
  const raw = digitsOnly(String(value ?? ''));
  if (!raw) return '';
  return new Intl.NumberFormat('id-ID').format(Number(raw));
}

export function parseRupiahInput(value: string | number) {
  const raw = digitsOnly(String(value ?? ''));
  if (!raw) return 0;
  return Number(raw);
}

export function formatTanggalIndonesia(dateValue: Date | string) {
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(date);
}

export function normalizeDateInputValue(value: unknown, type = 'date') {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  if (!raw) return '';
  if (type === 'month') return raw.slice(0, 7);
  if (type === 'time') return raw.slice(0, 5);
  return raw.slice(0, 10);
}

export function safeNumber(value: unknown) {
  return Number(value || 0);
}

export function normalizePinInput(value: string, maxLength = 6) {
  return digitsOnly(value).slice(0, maxLength);
}

export function isValidPin(value: string, minLength = 4, maxLength = 6) {
  const pin = normalizePinInput(value, maxLength);
  return pin.length >= minLength && pin.length <= maxLength;
}

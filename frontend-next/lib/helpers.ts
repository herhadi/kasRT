export function formatRupiah(value: number | string) {
  return `Rp ${new Intl.NumberFormat('id-ID').format(Number(value || 0))}`;
}

export function formatTanggalIndonesia(dateValue: Date | string) {
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(date);
}

export function safeNumber(value: unknown) {
  return Number(value || 0);
}

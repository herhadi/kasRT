import { formatRupiah } from './telegramService.js';

function parseRecapDate(value) {
  const isoDate = String(value || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || String(value || '').slice(0, 10);
  const date = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatMonthlyJimpitanShare({ month, days = [] }) {
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  const monthLabel = new Date(year, monthNumber - 1, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric'
  });

  const rawDayLines = days.map((row) => {
    const date = parseRecapDate(row.tanggal);
    const dayName = date ? date.toLocaleDateString('id-ID', { weekday: 'long' }) : '-';
    const dayNumber = date ? date.getDate() : String(row.tanggal || '-').slice(8, 10);
    const nominal = Number(row.total_nominal || 0).toLocaleString('id-ID');
    return {
      left: `• ${dayName}, ${dayNumber}`,
      right: nominal,
      hasPending: Boolean(row.has_pending || Number(row.total_pending || 0) > 0)
    };
  });

  const maxLeft = rawDayLines.reduce((max, line) => Math.max(max, line.left.length), 0);
  const maxRight = rawDayLines.reduce((max, line) => Math.max(max, line.right.length), 0);
  const dayLines = rawDayLines.map((line) => {
    const codeLine = `${line.left.padEnd(maxLeft, ' ')} : Rp ${line.right.padStart(maxRight, ' ')}`;
    return `\`${codeLine}\`${line.hasPending ? ' *' : ''}`;
  });

  const grandTotal = days.reduce((total, row) => total + Number(row.total_nominal || 0), 0);
  return (
    `🗓️ *REKAP JIMPITAN ${monthLabel}*\n` +
    '━━━━━━━━━━━━━━━\n' +
    `${dayLines.join('\n')}\n` +
    '━━━━━━━━━━━━━━━\n' +
    `💰 *TOTAL BULANAN: ${formatRupiah(grandTotal)}*`
  );
}

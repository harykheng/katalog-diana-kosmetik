/** "2026-08-14" → "14 Agu 2026". Dipakai untuk catatan "terakhir ambil". */
export function formatShortDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

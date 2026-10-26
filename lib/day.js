/** YYYY-MM-DD in Europe/Oslo, independent of the server's timezone. */

function osloDay(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(safe);
}

function shiftDay(day, delta) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

module.exports = { osloDay, shiftDay };

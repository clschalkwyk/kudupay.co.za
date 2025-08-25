export function toCents(input: string): number {
  if (!input) return 0;
  const s = String(input).trim()
    .replace(/[^0-9.,-]/g, '') // keep digits and separators
    .replace(/,/g, '.'); // normalize commas to dots
  if (s === '' || s === '.' || s === '-.' || s === '-') return 0;
  const num = Number(s);
  if (!Number.isFinite(num)) return 0;
  // Round to 2 decimals and convert to cents
  return Math.round(num * 100);
}

export function formatZAR(cents: number): string {
  const n = Number(cents) || 0;
  const rands = n / 100;
  return rands.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 });
}

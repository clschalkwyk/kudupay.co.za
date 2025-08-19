export function encodeCursor(obj?: any): string | null {
  if (!obj) return null;
  try {
    return Buffer.from(JSON.stringify(obj)).toString('base64');
  } catch {
    return null;
  }
}

export function decodeCursor(input?: string): any | undefined {
  if (!input) return undefined;
  // try base64 → JSON
  try {
    const decoded = Buffer.from(String(input), 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {}
  // try raw JSON
  try {
    return JSON.parse(String(input));
  } catch {}
  // else pass-through (store will handle if valid)
  return input;
}

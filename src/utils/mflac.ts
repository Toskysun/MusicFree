// Utilities for handling Kuwo/QQ .mflac (QMCv2) ekey quirks

export function normalizeEkey(ekey?: string): string {
  const s = String(ekey ?? "").trim();
  // keep last 704 bytes (ekey may be prefixed by digits per API)
  return s.length > 704 ? s.slice(-704) : s;
}

export function isMflacUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const u = url.split('?')[0].toLowerCase();
    return u.endsWith('.mflac') || u.endsWith('.mgg') || u.endsWith('.mflac0');
  } catch {
    return false;
  }
}


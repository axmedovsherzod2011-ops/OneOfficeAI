export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) return path;
  const normalizedBase = base.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}
export function asset(file: string): string {
  const base = typeof document !== 'undefined' ? document.baseURI : '/';
  return new URL(file.replace(/^\/+/, ''), base).href;
}

export const logoUrl = asset('logo.png');

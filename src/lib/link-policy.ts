/** Trust only the exact site family, never a hostname containing its text. */
export function needsExternalNotice(destination: URL, current: URL): boolean {
  if (!['https:', 'http:'].includes(destination.protocol)) return false;
  if (destination.origin === current.origin) return false;
  const host = destination.hostname.toLowerCase().replace(/\.$/, '');
  return host !== 'luen0511.com' && !host.endsWith('.luen0511.com');
}

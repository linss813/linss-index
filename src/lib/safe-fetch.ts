/** 受限的服务端文本请求，供管理员配置的 RSS / Sitemap 使用。 */
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 7_000;
const MAX_REDIRECTS = 4;

function blockedIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224;
}

function blockedIpv6(address: string): boolean {
  const value = address.toLowerCase().split('%')[0];
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(value)) return true;
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    return isIP(mapped) === 4 ? blockedIpv4(mapped) : true;
  }
  return false;
}

function blockedIp(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? blockedIpv4(address) : family === 6 ? blockedIpv6(address) : true;
}

/** 校验协议、端口、主机名和 DNS 解析结果，阻止访问本机及私有网络。 */
export async function assertSafeRemoteUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('URL 格式无效'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只允许 HTTP 或 HTTPS 地址');
  if (url.username || url.password) throw new Error('URL 不能包含账号或密码');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('只允许使用 80 或 443 端口');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('不允许访问本机或局域网地址');
  }
  if (isIP(hostname)) {
    if (blockedIp(hostname)) throw new Error('不允许访问私有或保留地址');
    return url;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((item) => blockedIp(item.address))) {
    throw new Error('域名解析到了私有或保留地址');
  }
  return url;
}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  accept?: string;
}

/** 限制重定向、响应大小和超时时间的文本下载。 */
export async function fetchRemoteText(raw: string, options: SafeFetchOptions = {}): Promise<{ text: string; finalUrl: string; contentType: string }> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let url = await assertSafeRemoteUrl(raw);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: options.accept ?? 'application/xml, text/xml, application/rss+xml, application/atom+xml;q=0.9, */*;q=0.1',
        'User-Agent': 'Luen0511-RSS/1.0 (+https://luen0511.com)',
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirect === MAX_REDIRECTS) throw new Error('远程地址重定向次数过多');
      url = await assertSafeRemoteUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`远程服务返回 HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new Error('远程响应内容过大');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes) throw new Error('远程响应内容过大');
    return {
      text: new TextDecoder().decode(bytes),
      finalUrl: url.href,
      contentType: response.headers.get('content-type') ?? '',
    };
  }
  throw new Error('远程请求失败');
}


/**
 * 管理员登录 API
 * POST /api/admin/login
 * 请求体：{ username, password }
 * 成功返回：{ success: true }
 * 失败返回：{ error: '用户名或密码错误' }
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { verifyCredentials, setSession, logAction } from '../../../lib/auth';

const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空').max(128),
  password: z.string().min(1, '密码不能为空').max(1024),
});

/**
 * 登录失败限流配置与状态
 * 同一 IP 在时间窗口内连续失败超过阈值后临时锁定，防止暴力破解
 * 注意：进程内存存储，重启后重置；单实例部署场景下足够使用
 */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 时间窗口：15 分钟
const RATE_LIMIT_MAX_FAILS = 5;              // 窗口内允许的最大失败次数
const failRecords = new Map<string, { count: number; firstFailAt: number }>();

/**
 * 清理过期的失败记录，避免 Map 无限增长
 */
function pruneFailRecords(): void {
  const now = Date.now();
  for (const [ip, rec] of failRecords) {
    if (now - rec.firstFailAt > RATE_LIMIT_WINDOW_MS) {
      failRecords.delete(ip);
    }
  }
}

/**
 * 检查指定 IP 是否已被限流锁定
 * @param ip 客户端 IP
 * @returns 是否处于锁定状态
 */
function isRateLimited(ip: string): boolean {
  pruneFailRecords();
  const rec = failRecords.get(ip);
  return !!rec && rec.count >= RATE_LIMIT_MAX_FAILS;
}

/**
 * 记录一次指定 IP 的登录失败
 * 窗口内首次失败初始化记录，之后累加计数
 * @param ip 客户端 IP
 */
function recordFail(ip: string): void {
  pruneFailRecords();
  const rec = failRecords.get(ip);
  if (!rec || Date.now() - rec.firstFailAt > RATE_LIMIT_WINDOW_MS) {
    failRecords.set(ip, { count: 1, firstFailAt: Date.now() });
  } else {
    rec.count += 1;
  }
}

/**
 * 清除指定 IP 的失败记录（登录成功时调用）
 * @param ip 客户端 IP
 */
function clearFails(ip: string): void {
  failRecords.delete(ip);
}

export const POST: APIRoute = async ({ request, session, clientAddress }) => {
  // 登录限流：锁定期间直接拒绝，避免暴力破解
  const ip = clientAddress ?? 'unknown';
  if (isRateLimited(ip)) {
    logAction('login_rate_limited', null, null, `ip: ${ip}`, clientAddress);
    return new Response(JSON.stringify({ error: '尝试次数过多，请 15 分钟后再试' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '请求格式错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: '用户名或密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { username, password } = parsed.data;
  const admin = await verifyCredentials(username, password);

  if (!admin) {
    recordFail(ip);
    logAction('login_failed', null, null, `username: ${username}, ip: ${ip}`, clientAddress);
    return new Response(JSON.stringify({ error: '用户名或密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  clearFails(ip);
  await setSession({ session } as any, admin);
  logAction('login', null, admin.id, `username: ${admin.username}`, clientAddress);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

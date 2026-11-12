/**
 * 管理员登出 API
 * POST /api/admin/logout
 * 销毁当前会话并重定向到登录页
 */
import type { APIRoute } from 'astro';
import { destroySession, getSessionAdmin, logAction } from '../../../lib/auth';

export const POST: APIRoute = async ({ session, clientAddress }) => {
  const admin = await getSessionAdmin({ session } as any);
  if (admin) {
    logAction('logout', null, admin.id, null, clientAddress);
  }
  await destroySession({ session } as any);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

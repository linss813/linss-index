/** 单机/多进程安全的 RSS 定时同步。SQLite 租约避免多个 Astro 进程重复执行。 */
import { sqlite } from './db';
import { envConfig } from './env';
import { syncAllRssSources } from '../services/rss-sync';

const schedulerKey = Symbol.for('luen0511.rss.scheduler');
type SchedulerGlobal = typeof globalThis & { [schedulerKey]?: boolean };

async function scheduledSync(): Promise<void> {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + 10 * 60 * 1_000).toISOString();
  let acquired = false;
  try {
    const result = sqlite.prepare(`
      UPDATE rss_sync_state
      SET locked_until = ?, last_started_at = ?, last_error = NULL
      WHERE id = 1 AND (locked_until IS NULL OR locked_until < ?)
    `).run(lockedUntil, now.toISOString(), now.toISOString());
    acquired = result.changes === 1;
  } catch {
    return;
  }
  if (!acquired) return;

  try {
    const result = await syncAllRssSources();
    const error = result.failures.length > 0 ? result.failures.map((item) => `${item.sourceName}: ${item.error}`).join('; ').slice(0, 2_000) : null;
    sqlite.prepare(`UPDATE rss_sync_state SET locked_until = NULL, last_finished_at = ?, last_error = ? WHERE id = 1`)
      .run(new Date().toISOString(), error);
  } catch (error) {
    sqlite.prepare(`UPDATE rss_sync_state SET locked_until = NULL, last_finished_at = ?, last_error = ? WHERE id = 1`)
      .run(new Date().toISOString(), error instanceof Error ? error.message.slice(0, 2_000) : '定时同步失败');
  }
}

/** 首次请求时注册一次定时器；不在页面请求链路中拉取 RSS。 */
export function startRssScheduler(): void {
  if (!envConfig.rssSyncEnabled) return;
  const state = globalThis as SchedulerGlobal;
  if (state[schedulerKey]) return;
  state[schedulerKey] = true;
  const interval = setInterval(() => { void scheduledSync(); }, envConfig.rssSyncIntervalMinutes * 60 * 1_000);
  interval.unref();
}


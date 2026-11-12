import type Database from 'better-sqlite3';
import { portalLinks } from '../config/services';

/** Append once: later admin edits/deletions remain authoritative. */
export function migratePortalLinks(sqlite: Database.Database): number {
  const key = 'migration_portal_links_20261112';
  return sqlite.transaction(() => {
    if (sqlite.prepare('SELECT 1 FROM settings WHERE key=?').get(key)) return 0;
    const canonical = (url: string) => new URL(url, 'https://luen0511.com').href.replace(/\/$/, '');
    const existing = new Set((sqlite.prepare('SELECT url FROM services').all() as {url:string}[]).map(row => canonical(row.url)));
    let order = (sqlite.prepare('SELECT COALESCE(MAX(sort_order),-1) AS n FROM services').get() as {n:number}).n;
    let added = 0;
    const insert = sqlite.prepare('INSERT INTO services (name,description,url,icon,category,display,external,sort_order,enabled) VALUES (?,?,?,?,?,?,?,?,1)');
    for (const link of portalLinks) {
      if (existing.has(canonical(link.url))) continue;
      insert.run(link.name, link.description, link.url, link.icon || 'server', link.category, link.display || 'card', Number(!!link.external), ++order);
      existing.add(canonical(link.url));
      added++;
    }
    sqlite.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run(key, 'done');
    return added;
  })();
}

/** Replace only our placeholder descriptions, once; retain user customizations. */
export function enrichPortalLinks(sqlite: Database.Database): number {
  return sqlite.transaction(() => {
    const key = 'migration_portal_descriptions_20261113';
    if (sqlite.prepare('SELECT 1 FROM settings WHERE key=?').get(key)) return 0;
    let changed = 0;
    for (const link of portalLinks.filter(link => link.url.startsWith('https:'))) {
      const host = new URL(link.url).hostname;
      changed += sqlite.prepare("UPDATE services SET description=?,updated_at=CURRENT_TIMESTAMP WHERE rtrim(url,'/')=? AND (description=? OR description='')").run(link.description,link.url,host).changes;
      const oldNames: Record<string,string> = { 'frame.luen0511.com':'Frame','jz.luen0511.com':'JZ','pinboard.luen0511.com':'Pinboard','video.luen0511.com':'Video' };
      sqlite.prepare("UPDATE services SET name=?,icon=?,updated_at=CURRENT_TIMESTAMP WHERE rtrim(url,'/')=? AND name=?").run(link.name,link.icon,link.url,oldNames[host]);
    }
    sqlite.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run(key,'done');
    return changed;
  })();
}

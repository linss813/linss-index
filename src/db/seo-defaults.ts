import type Database from 'better-sqlite3';
import { siteConfig } from '../config/site';
/** Upgrade untouched defaults without replacing settings written by the owner. */
export function enrichSeoDefaults(sqlite: Database.Database): void {
  sqlite.transaction(()=>{
    for (const key of ['title','og_title']) sqlite.prepare('UPDATE seo SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').run(siteConfig.title,key,'Luen0511 — Personal Server');
    for (const key of ['description','og_description']) sqlite.prepare('UPDATE seo SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').run(siteConfig.description,key,'A small corner of the Internet.');
    sqlite.prepare("UPDATE settings SET value=? WHERE key='site_title' AND value='Luen0511 — Personal Server'").run(siteConfig.title);
    sqlite.prepare("UPDATE settings SET value=? WHERE key='site_description' AND value='A small corner of the Internet.'").run(siteConfig.description);
  })();
}

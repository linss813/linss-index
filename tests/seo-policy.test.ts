import { expect, it } from 'vitest';
import { canonicalUrl, serializeJsonLd } from '../src/lib/seo';
import { needsExternalNotice } from '../src/lib/link-policy';
it('keeps pagination/filter identity while removing tracking and internal parameters',()=>{
  const result=canonicalUrl(new URL('http://localhost/blog/archive/?page=2&category=3&utm_source=x&__linss_internal=secret'),'https://luen0511.com');
  expect(result.href).toBe('https://luen0511.com/blog/archive?page=2&category=3');
  expect(canonicalUrl(new URL('http://localhost/blog?page=1'),'https://luen0511.com').href).toBe('https://luen0511.com/blog');
});
it('escapes untrusted article titles in JSON-LD without breaking JSON',()=>{
 const value={headline:'</script><script>alert(1)</script>'};
 expect(serializeJsonLd(value)).not.toContain('<');
 expect(JSON.parse(serializeJsonLd(value))).toEqual(value);
});
it('allows the domain family but rejects lookalike domains, including from local preview',()=>{
 const current=new URL('http://127.0.0.1:4321');
 for(const host of ['luen0511.com','frame.luen0511.com','jz.luen0511.com','pinboard.luen0511.com','video.luen0511.com']) expect(needsExternalNotice(new URL('https://'+host),current)).toBe(false);
 for(const host of ['evil-luen0511.com','luen0511.com.evil.example','github.com']) expect(needsExternalNotice(new URL('https://'+host),current)).toBe(true);
});
it('upgrades only untouched SEO defaults', async ()=>{
 const {default:Database}=await import('better-sqlite3');
 const {createTables}=await import('../src/db/ddl');
 const {enrichSeoDefaults}=await import('../src/db/seo-defaults');
 const sqlite=new Database(':memory:');createTables(sqlite);
 sqlite.prepare("INSERT INTO seo (key,value) VALUES ('title','我的自定义标题'),('description','A small corner of the Internet.')").run();
 enrichSeoDefaults(sqlite);
 expect(sqlite.prepare("SELECT value FROM seo WHERE key='title'").get()).toEqual({value:'我的自定义标题'});
 expect(sqlite.prepare("SELECT value FROM seo WHERE key='description'").get()).toEqual({value:expect.stringContaining('个人博客')});
 sqlite.close();
});

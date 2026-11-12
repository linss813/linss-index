import { beforeEach,describe,it,expect } from 'vitest';
import { sqlite } from '../src/lib/db';
import { getSidebarState,saveSidebar,sidebarDocument } from '../src/services/sidebars';
beforeEach(()=>sqlite.prepare('DELETE FROM settings WHERE key LIKE ?').run('sidebar_%'));
describe('sidebar publishing',()=>{
 it('keeps saved drafts separate from the public configuration and detects stale edits',()=>{const initial=getSidebarState();const draft=structuredClone(initial.draft);draft.modules[0].title='草稿介绍';const saved=saveSidebar(draft,'save')!;expect(saved.revision).toBe(1);expect(getSidebarState().published.modules[0].title).not.toBe('草稿介绍');expect(saveSidebar(draft,'publish')).toBeNull();const published=saveSidebar(saved,'publish')!;expect(getSidebarState().published.modules[0].title).toBe('草稿介绍');expect(getSidebarState().history.length).toBe(1);expect(published.revision).toBe(2);});
 it('rejects unsafe links and duplicate identities',()=>{const doc=getSidebarState().draft;doc.modules[0].url='javascript:alert(1)';expect(sidebarDocument.safeParse(doc).success).toBe(false);doc.modules[0].url='';doc.modules.push(doc.modules[0]);expect(sidebarDocument.safeParse(doc).success).toBe(false);});
});

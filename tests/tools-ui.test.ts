// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(process.cwd()+'/src/pages/tools.astro','utf8');
beforeEach(()=>{
 document.body.innerHTML=source.slice(source.indexOf('<main'),source.indexOf('</main>')+7);
 history.replaceState(null,'','/tools');
 const script=source.match(/<script>([\s\S]*?)<\/script>/)![1].replace("import QRCode from 'qrcode';",'');
 new Function('QRCode',ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText)({});
});
it('switches tools through the compact mobile selector and preserves deep links',()=>{
 const picker=document.getElementById('toolPicker') as HTMLSelectElement;
 expect(picker.options.length).toBe(14);
 picker.value='uuid';picker.dispatchEvent(new Event('change'));
 expect(document.getElementById('panel-json')!.hidden).toBe(true);
 expect(document.getElementById('panel-uuid')!.hidden).toBe(false);
 expect(location.hash).toBe('#uuid');
});
it('searches the directory, skips hidden items on keyboard navigation, and reports empty results',()=>{
 const search=document.getElementById('toolSearch') as HTMLInputElement;
 search.value='编码';search.dispatchEvent(new Event('input'));
 const tab=document.getElementById('tool-tab-base64')!;
 tab.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
 expect(document.getElementById('tool-tab-url')!.getAttribute('aria-selected')).toBe('true');
 search.value='不存在的工具';search.dispatchEvent(new Event('input'));
 expect(document.getElementById('toolNoResults')!.hidden).toBe(false);
});
it('retains JSON formatting behavior in the rebuilt workspace',()=>{
 const input=document.getElementById('jsonInput') as HTMLTextAreaElement;
 input.value='{"ok":true}';(document.querySelector('[data-json=format]') as HTMLButtonElement).click();
 expect(input.value).toBe('{\n  "ok": true\n}');
 expect(document.getElementById('jsonStatus')!.textContent).toBe('格式化完成');
});

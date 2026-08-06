const fs = require('fs');
function patch(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\(c, cIdx\)/g, '(c: any, cIdx: number)');
  content = content.replace(/\(r, idx\)/g, '(r: any, idx: number)');
  content = content.replace(/\(h, idx\)/g, '(h: any, idx: number)');
  content = content.replace(/\(sl, idx\)/g, '(sl: any, idx: number)');
  content = content.replace(/\(c, idx\)/g, '(c: any, idx: number)');
  content = content.replace(/\(e, idx\)/g, '(e: any, idx: number)');
  content = content.replace(/\(t, idx\)/g, '(t: any, idx: number)');
  fs.writeFileSync(file, content);
}
patch('D:/Code/sugerenciasMun/frontend/src/pages/ConfiguracionMockup/panels/PanelAbm.tsx');
patch('D:/Code/sugerenciasMun/frontend/src/pages/ConfiguracionMockup/panels/PanelArbol.tsx');

// Fix ConfiguracionMockup.tsx
let cfg = fs.readFileSync('D:/Code/sugerenciasMun/frontend/src/pages/ConfiguracionMockup/ConfiguracionMockup.tsx', 'utf8');
cfg = cfg.replace(/n: h\.n \? parseInt\(h\.n\.toString\(\)\.replace\('\.', ''\), 10\) : undefined/g, "n: h.n ? parseInt(h.n.toString().replace('.', ''), 10) : ''");
cfg = cfg.replace(/data\?\.veredicto/g, "(data as any)?.veredicto");
fs.writeFileSync('D:/Code/sugerenciasMun/frontend/src/pages/ConfiguracionMockup/ConfiguracionMockup.tsx', cfg);

const fs = require('fs');
const html = fs.readFileSync('D:/Code/sugerenciasMun/docs/design-sync/Configuracion.dc.html', 'utf8');

const regex = /<div[^>]*class="[^"]*entrar-panel[^"]*"[^>]*id="([^"]+)"/g;
let match;
let count = 0;
while ((match = regex.exec(html)) !== null) {
  count++;
  console.log('Panel ID:', match[1]);
}
if (count === 0) {
  const ids = html.match(/id="([^"]+)"/g);
  if (ids) {
    console.log("IDs found:", [...new Set(ids)].slice(0, 20).join(', '));
  }
}

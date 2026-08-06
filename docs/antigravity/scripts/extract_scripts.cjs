const fs = require('fs');
const html = fs.readFileSync('D:/Code/sugerenciasMun/docs/design-sync/Configuracion.dc.html', 'utf8');

const regex = /<script>([\s\S]*?)<\/script>/g;
let match;
let count = 0;
while ((match = regex.exec(html)) !== null) {
  count++;
  console.log(`--- Script Block ${count} (length: ${match[1].length}) ---`);
  console.log(match[1].substring(0, 1500));
}

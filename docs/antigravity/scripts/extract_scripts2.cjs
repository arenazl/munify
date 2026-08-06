const fs = require('fs');
const html = fs.readFileSync('D:/Code/sugerenciasMun/docs/design-sync/Configuracion.dc.html', 'utf8');

const lastScriptIndex = html.lastIndexOf('<script');
if (lastScriptIndex > -1) {
  const scriptContent = html.substring(lastScriptIndex);
  fs.writeFileSync('D:/Code/sugerenciasMun/frontend/extracted_data.js', scriptContent);
  console.log('Script extracted to extracted_data.js. Length:', scriptContent.length);
} else {
  console.log('No script found');
}

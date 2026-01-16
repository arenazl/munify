const fs = require('fs');

// Leer archivo
const html = fs.readFileSync('C:\\Code\\sugerenciasMun\\PRESENTACION_COMERCIAL.html', 'utf8');

let fixed = html;

// 1. ELIMINAR TODOS LOS GRADIENTES DE TEXTO (hacer texto negro sólido)
fixed = fixed.replace(/bg-gradient-to-r\s+from-\S+\s+(?:via-\S+\s+)?to-\S+\s+bg-clip-text\s+text-transparent/g, 'text-gray-900');
fixed = fixed.replace(/bg-gradient-to-br\s+from-\S+\s+(?:via-\S+\s+)?to-\S+\s+bg-clip-text\s+text-transparent/g, 'text-gray-900');

// 2. Eliminar TODOS los gradientes verde/azul/rojo de fondos -> cambiar a grises neutros
fixed = fixed.replace(/from-green-\d+/g, 'from-gray-100');
fixed = fixed.replace(/to-green-\d+/g, 'to-gray-200');
fixed = fixed.replace(/via-green-\d+/g, 'via-gray-150');

fixed = fixed.replace(/from-blue-\d+/g, 'from-gray-100');
fixed = fixed.replace(/to-blue-\d+/g, 'to-gray-200');
fixed = fixed.replace(/via-blue-\d+/g, 'via-gray-150');

fixed = fixed.replace(/from-red-\d+/g, 'from-gray-100');
fixed = fixed.replace(/to-red-\d+/g, 'to-gray-200');
fixed = fixed.replace(/via-red-\d+/g, 'via-gray-150');

// 3. Borders coloridos -> grises
fixed = fixed.replace(/border-green-\d+/g, 'border-gray-300');
fixed = fixed.replace(/border-blue-\d+/g, 'border-gray-300');
fixed = fixed.replace(/border-red-\d+/g, 'border-gray-300');

// 4. Backgrounds verdes/azules/rojos -> grises
fixed = fixed.replace(/bg-green-\d+/g, 'bg-gray-50');
fixed = fixed.replace(/bg-blue-\d+/g, 'bg-gray-50');
fixed = fixed.replace(/bg-red-\d+/g, 'bg-gray-50');

// 5. Textos verdes/azules -> grises/negros
fixed = fixed.replace(/text-green-\d+/g, 'text-gray-700');
fixed = fixed.replace(/text-blue-\d+/g, 'text-gray-700');

// 6. FIX HEADER: Cambiar textos blancos por negros en el header
// Encontrar el nav y cambiar text-white por text-gray-900
fixed = fixed.replace(
  /<nav class="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b"[^>]*>([\s\S]*?)<\/nav>/,
  (match) => {
    return match.replace(/text-white/g, 'text-gray-900');
  }
);

// 7. Fix botones del header (cambiar gradientes por sólidos)
fixed = fixed.replace(
  /bg-gradient-to-r from-gray-50 via-gray-100 to-gray-100 text-white/g,
  'bg-gray-900 text-white'
);

// 8. Guardar
fs.writeFileSync('C:\\Code\\sugerenciasMun\\PRESENTACION_COMERCIAL.html', fixed, 'utf8');

console.log('✅ Landing page arreglada!');
console.log('   - Gradientes de texto eliminados → texto negro');
console.log('   - Colores verde/azul/rojo eliminados → grises');
console.log('   - Borders coloridos → grises');
console.log('   - Header arreglado → texto negro visible');

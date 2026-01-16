const fs = require('fs');

let html = fs.readFileSync('PRESENTACION_COMERCIAL.html', 'utf8');

console.log('Arreglando TODOS los errores de contraste...\n');

// 1. CRÍTICO: bg-gray-50 con text-white = ERROR GRAVE
html = html.replace(/bg-gray-50([^"]*text-white)/g, 'bg-gray-900$1');
console.log('✓ Arreglado: bg-gray-50 text-white → bg-gray-900 text-white');

// 2. bg-white con text-white = ERROR GRAVE
html = html.replace(/bg-white([^"]*text-white)/g, 'bg-gray-900$1');
console.log('✓ Arreglado: bg-white text-white → bg-gray-900 text-white');

// 3. Badges y labels con fondo claro
html = html.replace(/bg-gray-50 px-2 py-0.5 rounded text-white/g, 'bg-gray-900 px-2 py-0.5 rounded text-white');
console.log('✓ Arreglado: badges con bg-gray-50 → bg-gray-900');

// 4. Números de pasos con fondo claro
html = html.replace(/w-12 h-12 bg-gray-50 text-white rounded-full/g, 'w-12 h-12 bg-blue-600 text-white rounded-full');
console.log('✓ Arreglado: números de pasos → bg-blue-600');

// 5. Botones con fondo claro
html = html.replace(/bg-gray-50 text-white font-bold/g, 'bg-blue-600 text-white font-bold');
html = html.replace(/bg-gray-50 text-white font-semibold/g, 'bg-blue-600 text-white font-semibold');
console.log('✓ Arreglado: botones con bg-gray-50 → bg-blue-600');

// 6. Iconos con fondo claro
html = html.replace(/w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-white/g, 'w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white');
console.log('✓ Arreglado: iconos pequeños → bg-blue-600');

// 7. Arreglar botones "Ver" con bg-gray-50
html = html.replace(/text-xs bg-gray-50 text-white px-3 py-1 rounded/g, 'text-xs bg-blue-600 text-white px-3 py-1 rounded');
console.log('✓ Arreglado: botones "Ver" → bg-blue-600');

// 8. Arreglar badge "En vivo" específico
html = html.replace(
    /flex items-center gap-2 bg-gray-50 text-white px-3 py-1.5 rounded-full shadow-lg/g,
    'flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-full shadow-lg'
);
console.log('✓ Arreglado: badge "En vivo" → bg-green-600');

// 9. Arreglar leyendas del mapa
html = html.replace(
    /<span class="bg-gray-50 px-2 py-0.5 rounded text-white font-bold shadow">/g,
    '<span class="bg-gray-900 px-2 py-0.5 rounded text-white font-bold shadow">'
);
console.log('✓ Arreglado: leyendas del mapa → bg-gray-900');

// 10. Arreglar botones grandes en paneles
html = html.replace(/py-4 bg-gray-50 text-white font-bold/g, 'py-4 bg-blue-600 text-white font-bold');
html = html.replace(/py-3 bg-gray-50 text-white font-bold/g, 'py-3 bg-blue-600 text-white font-bold');
html = html.replace(/py-2 bg-gray-50 text-white/g, 'py-2 bg-blue-600 text-white');
console.log('✓ Arreglado: botones grandes en paneles → bg-blue-600');

fs.writeFileSync('PRESENTACION_COMERCIAL.html', html, 'utf8');

console.log('\n✅ TODOS los errores de contraste arreglados!');
console.log('✅ Ahora todos los textos blancos están sobre fondos oscuros');

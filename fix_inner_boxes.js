const fs = require('fs');

let html = fs.readFileSync('PRESENTACION_COMERCIAL.html', 'utf8');

console.log('Arreglando cajas internas y bordes grises...\n');

// 1. Actualizar TODOS los bg-gray-50 rounded-xl con border-gray-200
html = html.replace(
    /bg-gray-50 rounded-xl p-4 border-l-4 border-gray-200/g,
    'bg-slate-50 rounded-xl p-4 border-l-4 border-slate-300'
);

// 2. Actualizar border-gray-200 restantes
html = html.replace(/border-gray-200/g, 'border-slate-200');

// 3. Actualizar bg-gray-50 simples
html = html.replace(/class="bg-gray-50 /g, 'class="bg-slate-50 ');

// 4. Actualizar rounded-xl p-3 con bg-gray-50
html = html.replace(
    /bg-gray-50 rounded-xl p-3/g,
    'bg-slate-50 rounded-xl p-3'
);

// 5. Actualizar todos los text-gray-700 finales
html = html.replace(/<p class="text-sm text-gray-700">/g, '<p class="text-sm text-slate-700">');

// 6. Actualizar hover:bg-gray-50 en botones
html = html.replace(/hover:bg-gray-50/g, 'hover:bg-blue-700');

// 7. Actualizar badges con bg-slate-100
html = html.replace(
    /bg-slate-100 rounded-xl p-3 opacity-60/g,
    'bg-white rounded-xl p-3 opacity-50 border border-slate-200'
);

fs.writeFileSync('PRESENTACION_COMERCIAL.html', html, 'utf8');

console.log('✅ Cajas internas actualizadas!');
console.log('✅ Todos los border-gray-200 eliminados');
console.log('✅ Todos los bg-gray-50 convertidos a slate');

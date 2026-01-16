const fs = require('fs');

let html = fs.readFileSync('PRESENTACION_COMERCIAL.html', 'utf8');

console.log('Arreglando todos los estilos restantes...\n');

// 1. Reemplazar TODOS los bg-gray-900 en step numbers por colores variados
// Primero los que están en bg-white (aún no actualizados)
html = html.replace(
    /(<div class="bg-white[^>]*>[\s\S]*?)<div class="w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center text-xl font-black">(\d+)<\/div>/g,
    function(match, before, stepNum) {
        const colors = {
            '1': 'blue',
            '2': 'cyan',
            '3': 'purple',
            '4': 'green',
            '5': 'emerald',
            '6': 'blue',
            '7': 'indigo'
        };
        const color = colors[stepNum] || 'blue';
        return `${before}<div class="w-12 h-12 bg-${color}-600 text-white rounded-full flex items-center justify-center text-xl font-black">${stepNum}</div>`;
    }
);

// 2. Reemplazar todos los bg-gray-900 restantes por colores
html = html.replace(
    /bg-gray-900 text-white rounded-full/g,
    'bg-slate-700 text-white rounded-full'
);

// 3. Actualizar TODOS los border-gray-300
html = html.replace(/border-gray-300/g, 'border-slate-200');

// 4. Actualizar TODOS los from-gray-50 to-gray-100
html = html.replace(/from-gray-50 to-gray-100/g, 'from-slate-100 to-slate-50');

// 5. Actualizar todos los bg-white con border-gray-200 a gradientes
html = html.replace(
    /bg-white rounded-2xl p-8 shadow-xl border-2 border-gray-200/g,
    'bg-gradient-to-br from-slate-50 to-white rounded-2xl p-8 shadow-xl border-2 border-slate-200'
);

// 6. Actualizar bg-gray-50 en mockups a bg-white
html = html.replace(
    /<div class="p-6 bg-gray-50 space-y-4">/g,
    '<div class="p-6 bg-white space-y-4">'
);

html = html.replace(
    /<div class="p-6 bg-gray-50 space-y-3">/g,
    '<div class="p-6 bg-white space-y-3">'
);

// 7. Actualizar badges con bg-gray-50
html = html.replace(
    /bg-gray-50 text-red-600 px-3 py-1 rounded-full/g,
    'bg-red-100 text-red-600 px-3 py-1 rounded-full'
);

// 8. Actualizar text-gray-700 a text-slate-700 para mejor contraste
html = html.replace(
    /<p class="text-sm font-semibold text-gray-700">/g,
    '<p class="text-sm font-semibold text-slate-900">'
);

html = html.replace(
    /<p class="font-semibold text-gray-700">/g,
    '<p class="font-semibold text-slate-900">'
);

// 9. Actualizar iconos con bg-gray-50
html = html.replace(
    /w-10 h-10 bg-gray-50 rounded-full/g,
    'w-10 h-10 bg-slate-200 rounded-full'
);

// 10. Actualizar bg-slate-100 en mockups a colores más profesionales
html = html.replace(
    /border-4 border-slate-300 bg-slate-100/g,
    'border-4 border-slate-300 bg-white'
);

// 11. Actualizar botones con bg-gray-900/20
html = html.replace(
    /bg-gray-900\/20 text-white/g,
    'bg-white/30 text-white'
);

// 12. Actualizar bg-slate-100 en otros contextos
html = html.replace(
    /<div class="bg-slate-100 rounded-xl p-3 opacity-60">/g,
    '<div class="bg-white rounded-xl p-3 opacity-50 border border-slate-200">'
);

fs.writeFileSync('PRESENTACION_COMERCIAL.html', html, 'utf8');

console.log('✅ TODOS los estilos restantes actualizados!');
console.log('✅ Step numbers con colores variados');
console.log('✅ Borders actualizados');
console.log('✅ Gradientes grises eliminados');
console.log('✅ Mockups con mejor contraste');

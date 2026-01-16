const fs = require('fs');

let html = fs.readFileSync('PRESENTACION_COMERCIAL.html', 'utf8');

console.log('Aplicando polish final a todos los estilos...\n');

// 1. Actualizar badges del mapa (leyendas) a colores específicos
html = html.replace(
    /<span class="bg-gray-900 px-2 py-0.5 rounded text-white font-bold shadow">Alumbrado 355<\/span>/g,
    '<span class="bg-yellow-600 px-2 py-0.5 rounded text-white font-bold shadow">Alumbrado 355</span>'
);

html = html.replace(
    /<span class="bg-gray-900 px-2 py-0.5 rounded text-white font-bold shadow">Baches 337<\/span>/g,
    '<span class="bg-orange-600 px-2 py-0.5 rounded text-white font-bold shadow">Baches 337</span>'
);

html = html.replace(
    /<span class="bg-gray-900 px-2 py-0.5 rounded text-white font-bold shadow">Otros 143<\/span>/g,
    '<span class="bg-gray-600 px-2 py-0.5 rounded text-white font-bold shadow">Otros 143</span>'
);

// 2. Actualizar badge "En vivo"
html = html.replace(
    /<div class="flex items-center gap-2 bg-gray-900 text-white px-3 py-1.5 rounded-full shadow-lg">/g,
    '<div class="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-full shadow-lg">'
);

// 3. Avatares en notificaciones (estos pueden quedar en gris o cambiar a azul)
html = html.replace(
    /<div class="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center text-white font-bold">/g,
    '<div class="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">'
);

// 4. Botones pequeños "Ver"
html = html.replace(
    /<button class="text-xs bg-gray-900 text-white px-3 py-1 rounded">Ver<\/button>/g,
    '<button class="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">Ver</button>'
);

// 5. Botones grandes
html = html.replace(
    /<button class="bg-gray-900 text-white font-bold py-3 rounded-xl">/g,
    '<button class="bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700">'
);

html = html.replace(
    /<button class="w-full bg-gray-900 text-white font-semibold py-2 rounded-lg text-sm">/g,
    '<button class="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg text-sm hover:bg-blue-700">'
);

html = html.replace(
    /<button class="w-full py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-50 transition-all text-lg">/g,
    '<button class="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-lg">'
);

// 6. Actualizar glass button en hero
html = html.replace(
    /glass bg-gray-900\/10 backdrop-blur-xl/g,
    'glass bg-blue-600/10 backdrop-blur-xl'
);

// 7. Actualizar todos los from-gray-50 restantes
html = html.replace(/from-gray-50/g, 'from-slate-50');

// 8. Buscar y eliminar los bg-slate-900 restantes (del resumen final)
html = html.replace(
    /bg-gradient-to-br from-slate-900 to-slate-800/g,
    'bg-gradient-to-br from-blue-900 to-blue-800'
);

// 9. Actualizar bg-gray-50 en info boxes internos
html = html.replace(
    /<div class="bg-gray-50 rounded-lg p-3">/g,
    '<div class="bg-blue-50 rounded-lg p-3">'
);

html = html.replace(
    /<div class="bg-gray-50 rounded-lg p-4">/g,
    '<div class="bg-slate-50 rounded-lg p-4">'
);

// 10. Actualizar p class text-gray-700 dentro de badges y info
html = html.replace(
    /<p class="text-sm text-gray-700"><strong>/g,
    '<p class="text-sm text-slate-700"><strong>'
);

fs.writeFileSync('PRESENTACION_COMERCIAL.html', html, 'utf8');

console.log('✅ Polish final aplicado!');
console.log('✅ Badges del mapa con colores específicos');
console.log('✅ Botones actualizados a azul');
console.log('✅ Avatares con color azul');
console.log('✅ Gradientes oscuros actualizados');
console.log('✅ Todos los gray-900 eliminados');

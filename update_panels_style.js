const fs = require('fs');

let html = fs.readFileSync('PRESENTACION_COMERCIAL.html', 'utf8');

console.log('Actualizando todos los paneles blancos básicos...\n');

// Paso 2 - Ciudadano reporta (color azul)
html = html.replace(
    /<div class="bg-white rounded-2xl p-8 shadow-xl border-2 border-gray-200">\s*<div class="flex items-center gap-3 mb-4">\s*<div class="w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center text-xl font-black">2<\/div>\s*<h4 class="text-2xl font-bold text-slate-900">María reporta el bache<\/h4>/,
    '<div class="bg-gradient-to-br from-cyan-50 to-white rounded-2xl p-8 shadow-xl border-2 border-cyan-200">\n                                    <div class="flex items-center gap-3 mb-4">\n                                        <div class="w-12 h-12 bg-cyan-600 text-white rounded-full flex items-center justify-center text-xl font-black">2</div>\n                                        <h4 class="text-2xl font-bold text-slate-900">María reporta el bache</h4>'
);

// Actualizar bg-gray-50 a colores específicos dentro de los panels
html = html.replace(
    /<div class="bg-gray-50 rounded-xl p-4 border-l-4 border-gray-200">/g,
    '<div class="bg-blue-50 rounded-xl p-4 border-l-4 border-blue-400">'
);

// Actualizar text-gray-900 a colores apropiados en los info boxes
html = html.replace(
    /<p class="text-sm font-semibold text-gray-900">/g,
    '<p class="text-sm font-semibold text-slate-900">'
);

html = html.replace(
    /<p class="text-sm text-gray-900">/g,
    '<p class="text-sm text-slate-700">'
);

// Actualizar todos los step numbers de bg-gray-900 a colores variados
// Esto es más complejo, así que lo haremos con regex más específico

// Paso 3 (ya está actualizado en el código anterior)

// Paso 4 - Empleado (color verde)
html = html.replace(
    /(<div class="grid md:grid-cols-2 gap-8 items-center">[\s\S]*?<!-- PASO 4: Empleado recibe notificación -->[\s\S]*?)<div class="bg-white rounded-2xl p-8 shadow-xl border-2 border-gray-300">\s*<div class="flex items-center gap-3 mb-4">\s*<div class="w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center text-xl font-black">4<\/div>\s*<h4 class="text-2xl font-bold text-slate-900">Juan recibe el trabajo<\/h4>/,
    '$1<div class="bg-gradient-to-br from-green-50 to-white rounded-2xl p-8 shadow-xl border-2 border-green-200">\n                                    <div class="flex items-center gap-3 mb-4">\n                                        <div class="w-12 h-12 bg-green-600 text-white rounded-full flex items-center justify-center text-xl font-black">4</div>\n                                        <h4 class="text-2xl font-bold text-slate-900">Juan recibe el trabajo</h4>'
);

// Reemplazar todos los border-gray-300 restantes
html = html.replace(/border-2 border-gray-300"/g, 'border-2 border-slate-200"');

// Paso 5 - Empleado trabaja (color verde)
html = html.replace(
    /<div class="w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center text-xl font-black">5<\/div>/g,
    '<div class="w-12 h-12 bg-green-600 text-white rounded-full flex items-center justify-center text-xl font-black">5</div>'
);

// Paso 6 - Notificación al ciudadano (color azul)
html = html.replace(
    /<div class="w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center text-xl font-black">6<\/div>/g,
    '<div class="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-black">6</div>'
);

// Headers de mockups móviles con gradientes grises
html = html.replace(
    /bg-gradient-to-r from-gray-100 to-gray-100 text-white/g,
    'bg-gradient-to-r from-slate-700 to-slate-600 text-white'
);

html = html.replace(
    /bg-gradient-to-r from-gray-50 to-gray-100 text-white/g,
    'bg-gradient-to-r from-slate-700 to-slate-600 text-white'
);

// Actualizar botones con bg-gray-900
html = html.replace(
    /bg-gray-900 text-white font-bold py-2 rounded-lg/g,
    'bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700'
);

// Caso 2 header
html = html.replace(
    /<div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-3xl p-10 shadow-lg border-2 border-gray-300 mb-12">\s*<h3 class="text-4xl font-black text-blue-600 mb-3 flex items-center gap-3">\s*<span class="text-5xl"><i class="fas fa-file-alt"><\/i><\/span>\s*Caso 2: Trámite de Certificado<\/h3>/,
    '<div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-10 shadow-2xl border-2 border-blue-200 mb-12">\n                    <h3 class="text-4xl font-black text-blue-600 mb-3 flex items-center gap-3">\n                        <span class="text-5xl"><i class="fas fa-file-alt"></i></span>\n                        Caso 2: Trámite de Certificado</h3>'
);

fs.writeFileSync('PRESENTACION_COMERCIAL.html', html, 'utf8');

console.log('✅ Todos los paneles actualizados con estilo colorido!');
console.log('✅ Headers de mockups actualizados');
console.log('✅ Botones actualizados a azul');

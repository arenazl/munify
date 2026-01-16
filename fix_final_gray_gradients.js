const fs = require('fs');

let html = fs.readFileSync('PRESENTACION_COMERCIAL.html', 'utf8');

console.log('Eliminando gradientes grises finales...\n');

// 1. Section header icons (hacerlos coloridos)
html = html.replace(
    /(<section[^>]*>[\s\S]*?)<div class="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-100 rounded-2xl/g,
    '$1<div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl'
);

// 2. Cards con gradientes grises
html = html.replace(
    /bg-gradient-to-br from-gray-100 to-gray-100 rounded-2xl p-8 border-2 border-slate-200 hover-lift/g,
    'bg-gradient-to-br from-slate-50 to-white rounded-2xl p-8 border-2 border-slate-200 hover-lift shadow-lg'
);

html = html.replace(
    /bg-gradient-to-br from-gray-100 to-gray-100 rounded-2xl p-6 border-2 border-slate-200/g,
    'bg-gradient-to-br from-slate-50 to-white rounded-2xl p-6 border-2 border-slate-200 shadow-md'
);

// 3. Pricing section header
html = html.replace(
    /bg-gradient-to-br from-gray-100 to-gray-100 rounded-3xl p-10 shadow-lg border-2 border-slate-200 mb-10/g,
    'bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-10 shadow-2xl border-2 border-blue-200 mb-10'
);

// 4. Pricing cards con texto blanco sobre gris (ERROR DE CONTRASTE!)
html = html.replace(
    /bg-gradient-to-br from-gray-100 to-gray-100 text-white rounded-2xl p-8 shadow-xl"/g,
    'bg-gradient-to-br from-slate-700 to-slate-600 text-white rounded-2xl p-8 shadow-xl border-2 border-slate-500"'
);

html = html.replace(
    /bg-gradient-to-br from-gray-100 to-gray-100 text-white rounded-2xl p-8 shadow-xl ring-4 ring-green-200/g,
    'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl p-8 shadow-2xl ring-4 ring-blue-300'
);

// 5. Phone mockup dashboard
html = html.replace(
    /bg-gradient-to-br from-slate-50 via-gray-100 to-gray-100/g,
    'bg-gradient-to-br from-white via-slate-50 to-slate-100'
);

// 6. Dashboard cards dentro del mockup
html = html.replace(
    /<div class="bg-gradient-to-br from-gray-100 to-gray-100 border-2 border-slate-200 rounded-xl p-3 shadow">/g,
    '<div class="bg-white border-2 border-slate-200 rounded-xl p-3 shadow">'
);

// 7. Image placeholders (fondos de imágenes)
html = html.replace(
    /bg-gradient-to-br from-gray-100 via-gray-100 to-gray-100 relative/g,
    'bg-gradient-to-br from-slate-100 via-slate-50 to-white relative'
);

// 8. CTA final section
html = html.replace(
    /bg-gradient-to-br from-slate-50 via-gray-100 to-gray-100 rounded-3xl p-16/g,
    'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-3xl p-16'
);

// 9. Button hover states
html = html.replace(
    /hover:from-slate-50 hover:to-gray-100/g,
    'hover:from-slate-800 hover:to-slate-700'
);

fs.writeFileSync('PRESENTACION_COMERCIAL.html', html, 'utf8');

console.log('✅ Gradientes grises finales eliminados!');
console.log('✅ Icons de secciones ahora son coloridos');
console.log('✅ Cards con mejor contraste');
console.log('✅ Pricing cards actualizadas');
console.log('✅ Mockups con fondos profesionales');

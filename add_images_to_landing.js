const fs = require('fs');

let html = fs.readFileSync('C:\\Code\\sugerenciasMun\\PRESENTACION_COMERCIAL.html', 'utf8');

// 1. Fix gradient-text que quedó (línea 1086)
html = html.replace(/class="text-5xl font-black gradient-text"/g, 'class="text-5xl font-black text-slate-900"');

// 2. Template para imagen decorativa
const imageSection = (imgSrc, alt) => `
        <!-- Imagen decorativa entre secciones -->
        <div class="container mx-auto px-6 py-12">
            <div class="max-w-5xl mx-auto">
                <div class="rounded-3xl overflow-hidden shadow-2xl">
                    <img src="${imgSrc}" alt="${alt}" class="w-full h-96 object-cover">
                </div>
            </div>
        </div>
`;

// 3. Encontrar "Los 4 Actores del Sistema" y agregar imagen ANTES
html = html.replace(
    /(<div class="container mx-auto px-6 py-16">\s*<div class="max-w-7xl mx-auto text-center">\s*<h2 class="text-5xl font-black text-slate-900">Los 4 Actores del Sistema<\/h2>)/,
    imageSection('./assets-landing-equipo-profesional.jpg', 'Equipo profesional trabajando') + '\n        $1'
);

// 4. Encontrar "Flujos Completos de Uso" y agregar imagen ANTES
html = html.replace(
    /(<div class="container mx-auto px-6 py-20">\s*<div class="max-w-7xl mx-auto text-center mb-16">\s*<h2 class="text-5xl font-black [^"]*">Flujos Completos de Uso<\/h2>)/,
    imageSection('./assets-landing-trabajadores-campo.jpg', 'Trabajadores en campo resolviendo problemas') + '\n        $1'
);

// 5. Encontrar "Inversión y Retorno" y agregar imagen ANTES
html = html.replace(
    /(<div class="container mx-auto px-6 py-20">\s*<div class="text-center mb-16">\s*<h2 class="text-5xl font-black text-slate-900">Inversión y Retorno<\/h2>)/,
    imageSection('./assets-landing-oficina-trabajo.jpg', 'Oficina moderna con equipo de trabajo') + '\n        $1'
);

// Guardar
fs.writeFileSync('C:\\Code\\sugerenciasMun\\PRESENTACION_COMERCIAL.html', html, 'utf8');

console.log('✅ Imágenes agregadas a la landing page!');
console.log('   - 3 imágenes decorativas insertadas entre secciones');
console.log('   - gradient-text eliminado de "Flujos Completos de Uso"');

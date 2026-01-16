const fs = require('fs');

// Leer archivo original
const html = fs.readFileSync('C:\\Code\\sugerenciasMun\\PRESENTACION_COMERCIAL_original.html', 'utf8');

let transformed = html;

// 1. Cambiar background del body a blanco puro
transformed = transformed.replace(
    /background: linear-gradient\(to bottom.*?\);/gs,
    'background: #ffffff;'
);

// 2. Reemplazar TODOS los gradientes por colores sólidos Apple

// Eliminar gradientes de texto (convertir a negro)
transformed = transformed.replace(/bg-gradient-to-r from-\S+ via-\S+ to-\S+ bg-clip-text text-transparent/g, 'text-gray-900');

// Gradientes de fondo -> grises o blancos
const gradientPatterns = [
    // Todos los from-indigo, from-purple, from-pink, from-red, from-orange, from-yellow
    [/from-indigo-\d+/g, 'from-gray-50'],
    [/from-purple-\d+/g, 'from-gray-50'],
    [/from-pink-\d+/g, 'from-gray-50'],
    [/from-red-\d+/g, 'from-gray-50'],
    [/from-orange-\d+/g, 'from-gray-50'],
    [/from-yellow-\d+/g, 'from-gray-50'],
    [/from-blue-\d+/g, 'from-gray-50'],
    [/from-cyan-\d+/g, 'from-gray-50'],
    [/from-emerald-\d+/g, 'from-gray-50'],
    [/from-amber-\d+/g, 'from-gray-50'],

    // via-
    [/via-indigo-\d+/g, 'via-gray-100'],
    [/via-purple-\d+/g, 'via-gray-100'],
    [/via-pink-\d+/g, 'via-gray-100'],
    [/via-red-\d+/g, 'via-gray-100'],
    [/via-orange-\d+/g, 'via-gray-100'],
    [/via-blue-\d+/g, 'via-gray-100'],
    [/via-cyan-\d+/g, 'via-gray-100'],

    // to-
    [/to-indigo-\d+/g, 'to-gray-100'],
    [/to-purple-\d+/g, 'to-gray-100'],
    [/to-pink-\d+/g, 'to-gray-100'],
    [/to-red-\d+/g, 'to-gray-100'],
    [/to-orange-\d+/g, 'to-gray-100'],
    [/to-yellow-\d+/g, 'to-gray-100'],
    [/to-blue-\d+/g, 'to-gray-100'],
    [/to-cyan-\d+/g, 'to-gray-100'],
    [/to-emerald-\d+/g, 'to-gray-100'],
    [/to-amber-\d+/g, 'to-gray-100'],
];

gradientPatterns.forEach(([pattern, replacement]) => {
    transformed = transformed.replace(pattern, replacement);
});

// 3. Backgrounds coloridos -> grises
const bgPatterns = [
    [/bg-indigo-\d+/g, 'bg-gray-50'],
    [/bg-purple-\d+/g, 'bg-gray-50'],
    [/bg-pink-\d+/g, 'bg-gray-50'],
    [/bg-red-\d+/g, 'bg-gray-50'],
    [/bg-orange-\d+/g, 'bg-gray-50'],
    [/bg-yellow-\d+/g, 'bg-gray-50'],
    [/bg-amber-\d+/g, 'bg-gray-50'],
    [/bg-cyan-\d+/g, 'bg-gray-50'],
    [/bg-emerald-\d+/g, 'bg-gray-50'],

    // Mantener bg-blue solo si es strong (para botones principales)
    [/bg-blue-([1-4]\d\d)/g, 'bg-gray-50'], // bg-blue-100 a bg-blue-499 -> gris
    [/bg-blue-([5-9]\d\d)/g, 'bg-blue-$1'], // bg-blue-500+ mantener
];

bgPatterns.forEach(([pattern, replacement]) => {
    transformed = transformed.replace(pattern, replacement);
});

// 4. Textos coloridos -> negro/gris
const textPatterns = [
    [/text-indigo-\d+/g, 'text-gray-900'],
    [/text-purple-\d+/g, 'text-gray-900'],
    [/text-pink-\d+/g, 'text-gray-900'],
    [/text-red-\d+/g, 'text-red-600'], // mantener rojos para errores
    [/text-orange-\d+/g, 'text-gray-700'],
    [/text-yellow-\d+/g, 'text-gray-700'],
    [/text-amber-\d+/g, 'text-gray-700'],
    [/text-cyan-\d+/g, 'text-gray-700'],
    [/text-emerald-\d+/g, 'text-green-600'], // mantener verdes para success
    [/text-blue-\d+/g, 'text-blue-600'], // azul Apple para links/acciones
];

textPatterns.forEach(([pattern, replacement]) => {
    transformed = transformed.replace(pattern, replacement);
});

// 5. Borders coloridos -> grises
const borderPatterns = [
    [/border-indigo-\d+/g, 'border-gray-200'],
    [/border-purple-\d+/g, 'border-gray-200'],
    [/border-pink-\d+/g, 'border-gray-200'],
    [/border-orange-\d+/g, 'border-gray-200'],
    [/border-yellow-\d+/g, 'border-gray-200'],
    [/border-amber-\d+/g, 'border-gray-200'],
    [/border-cyan-\d+/g, 'border-gray-200'],
    [/border-blue-([1-3]\d\d)/g, 'border-gray-200'],
];

borderPatterns.forEach(([pattern, replacement]) => {
    transformed = transformed.replace(pattern, replacement);
});

// 6. Eliminar overlays coloridos de imágenes - Simplificar
// Buscar patrones como: <div class="absolute inset-0 bg-gradient-to-r from-red-600/80 to-orange-600/80 ...
transformed = transformed.replace(
    /<div class="absolute inset-0 bg-gradient-to-r from-\w+-\d+\/\d+ (?:via-\w+-\d+\/\d+ )?to-\w+-\d+\/\d+[^>]*>[\s\S]*?<\/div>\s*<\/div>/g,
    '</div>'
);

// Simplificar backgrounds con opacidad alta
transformed = transformed.replace(/\/80/g, '/20'); // Reducir opacidad de overlays
transformed = transformed.replace(/\/70/g, '/10');

// 7. Eliminar efectos especiales
transformed = transformed.replace(/pulse-glow/g, '');
transformed = transformed.replace(/class="blob /g, 'class="');
transformed = transformed.replace(/ animate-pulse/g, '');

// 8. Cambiar paleta en CSS
transformed = transformed.replace(/--primary: #6366f1;/g, '--primary: #0066cc;');
transformed = transformed.replace(/--primary-dark: #4f46e5;/g, '--primary-dark: #0055b3;');
transformed = transformed.replace(/--secondary: #8b5cf6;/g, '--secondary: #6e6e73;');
transformed = transformed.replace(/--accent: #ec4899;/g, '--accent: #d2d2d7;');

// 9. Simplificar sombras fuertes
transformed = transformed.replace(/shadow-2xl/g, 'shadow-lg');

// 10. Eliminar URLs de Unsplash (opcional - comentado porque no tenemos las imágenes de reemplazo aún)
// transformed = transformed.replace(/https:\/\/images\.unsplash\.com[^"']*/g, '/assets/placeholder.jpg');

// Guardar archivo transformado
fs.writeFileSync('C:\\Code\\sugerenciasMun\\PRESENTACION_COMERCIAL.html', transformed, 'utf8');

console.log('✅ Transformación completada!');
console.log('Archivo guardado en: PRESENTACION_COMERCIAL.html');
console.log('');
console.log('Cambios aplicados:');
console.log('- Todos los gradientes coloridos → grises');
console.log('- Backgrounds vibrantes → grises/blancos');
console.log('- Textos coloridos → negro/gris (excepto links)');
console.log('- Borders coloridos → grises');
console.log('- Overlays reducidos a 10-20% opacidad');
console.log('- Efectos especiales eliminados');

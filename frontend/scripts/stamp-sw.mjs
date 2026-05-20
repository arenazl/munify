// Post-build: inyecta un BUILD_ID unico en dist/sw.js para que el browser
// detecte un Service Worker nuevo en cada deploy (sw.js debe diferir
// byte-a-byte para disparar el flujo de update del navegador). Sin esto,
// los browsers que ya tienen el SW cacheado no se enteran de updates y
// los usuarios siguen con el bundle viejo hasta hacer Ctrl+F5 manual.
//
// Cómo funciona:
//   - sw.js tiene un placeholder literal `__BUILD_ID__`.
//   - Después de `vite build`, este script lo reemplaza por un timestamp
//     + 4 caracteres random (suficiente para garantizar unicidad sin
//     depender de git ni nada externo).
//   - El ServiceWorkerUpdater detecta el SW nuevo, muestra el toast
//     "Nueva versión disponible · Actualizar" y al confirmar recarga.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SW_PATH = resolve(__dirname, '..', 'dist', 'sw.js');

if (!existsSync(SW_PATH)) {
  console.warn('[stamp-sw] dist/sw.js no existe — saltando');
  process.exit(0);
}

const content = readFileSync(SW_PATH, 'utf8');
if (!content.includes('__BUILD_ID__')) {
  console.warn('[stamp-sw] placeholder __BUILD_ID__ no encontrado en sw.js — el SW no se va a actualizar automaticamente en este deploy');
  process.exit(0);
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const stamped = content.replace(/__BUILD_ID__/g, stamp);
writeFileSync(SW_PATH, stamped, 'utf8');
console.log(`[stamp-sw] dist/sw.js sellado con BUILD_ID=${stamp}`);

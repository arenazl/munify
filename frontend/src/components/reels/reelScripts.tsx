// ============================================================
// Guiones de los reels de promoción de Munify.
// Cada reel = recorrido por funciones reales de la app con mockups en
// el medio. Duración pensada para Facebook/Instagram Reels (~20-28s).
// Copy en español rioplatense (voseo).
// ============================================================
import type { Reel } from './ReelStage';
import { BRAND } from './reelBrand';
import {
  MockupDashboard, MockupReclamos, MockupMapaCalor, MockupTramite,
  MockupTesoreria, MockupCajas, MockupConciliacion, MockupSueldos,
  MockupCaptura, MockupSeguimiento, MockupWhatsApp, MockupLogros,
} from './ReelMockups';

// 1) TOUR GENERAL — "Tu municipio, en una app"
const tourGeneral: Reel = {
  id: 'tour',
  nombre: 'Tour general',
  desc: 'Recorrido por las pantallas clave: Dashboard, Reclamos, Mapa, Trámites, Tesorería.',
  accent: BRAND.gold,
  scenes: [
    { kind: 'hook', eyebrow: 'Munify', lines: ['Todo tu', 'municipio,'], accentWord: 'en una sola app.' },
    { kind: 'feature', mockup: <MockupDashboard />, chip: 'Dashboard', title: 'Tu gestión, en vivo', desc: 'Reclamos, trámites y métricas en tiempo real.', accent: BRAND.reclamos },
    { kind: 'feature', mockup: <MockupReclamos />, chip: 'Reclamos', title: 'El vecino reclama, vos resolvés', desc: 'Cada reporte llega clasificado y derivado al área.', accent: BRAND.reclamos },
    { kind: 'feature', mockup: <MockupMapaCalor />, chip: 'Mapa de calor', title: 'Dónde están los problemas', desc: 'Visualizá la concentración de reclamos por zona.', accent: '#ef4444' },
    { kind: 'feature', mockup: <MockupTramite />, chip: 'Trámites', title: 'Trámites online', desc: 'Identidad validada con RENAPER, sin filas.', accent: BRAND.tramites },
    { kind: 'feature', mockup: <MockupTesoreria />, chip: 'Tesorería', title: 'La plata, ordenada', desc: 'Pagos, cajas y conciliación en un solo lugar.', accent: BRAND.tesoreria },
    { kind: 'cta', line: 'Tu municipio,', accentWord: 'al día.', sub: 'Pedí tu demo →' },
  ],
};

// 2) VECINO — "El bache ya tiene solución"
const vecino: Reel = {
  id: 'vecino',
  nombre: 'Para el vecino',
  desc: 'El flujo del vecino: foto del problema → IA lo clasifica → seguimiento → puntos.',
  accent: BRAND.reclamos,
  scenes: [
    { kind: 'hook', eyebrow: 'Reclamos', lines: ['El bache de', 'la esquina'], accentWord: 'ya tiene solución.' },
    { kind: 'feature', mockup: <MockupCaptura />, chip: 'En 30 segundos', title: 'Sacás la foto', desc: 'Desde el celu, en el lugar. Eso es todo.', accent: BRAND.reclamos },
    { kind: 'feature', mockup: <MockupWhatsApp />, chip: 'Inteligencia artificial', title: 'La IA lo clasifica', desc: 'Detecta el tipo y lo manda al área correcta.', accent: BRAND.ia },
    { kind: 'feature', mockup: <MockupSeguimiento />, chip: 'Seguimiento', title: 'Lo seguís como un envío', desc: 'Sabés en qué estado está, paso a paso.', accent: BRAND.reclamos },
    { kind: 'feature', mockup: <MockupLogros />, chip: 'Logros', title: 'Sumás puntos', desc: 'Participar de tu ciudad ahora tiene premio.', accent: BRAND.tesoreria },
    { kind: 'cta', line: 'Tu ciudad', accentWord: 'te escucha.', sub: 'Disponible en tu municipio' },
  ],
};

// 3) INTENDENTE — "Tu gestión, en números"
const intendente: Reel = {
  id: 'intendente',
  nombre: 'Para el intendente',
  desc: 'Tablero de control: números que suben, mapa de calor, tasa de resolución, ranking.',
  accent: BRAND.azure,
  scenes: [
    { kind: 'hook', eyebrow: 'Gestión', lines: ['Tu gestión,'], accentWord: 'en números.' },
    { kind: 'stat', value: 1284, label: 'reclamos gestionados', sub: 'este año, sin un solo papel', accent: BRAND.tramites },
    { kind: 'feature', mockup: <MockupDashboard />, chip: 'Dashboard en vivo', title: 'Todo en una pantalla', desc: 'Métricas que se actualizan solas.', accent: BRAND.reclamos },
    { kind: 'stat', value: 87, suffix: '%', label: 'de resolución', sub: 'con tiempo promedio de 3,2 días', accent: BRAND.reclamos },
    { kind: 'feature', mockup: <MockupMapaCalor />, chip: 'Mapa de calor', title: 'Decisiones con datos', desc: 'Mandá las cuadrillas donde más se necesita.', accent: '#ef4444' },
    { kind: 'cta', line: 'Goberná', accentWord: 'con datos.', sub: 'Pedí una demo para tu municipio' },
  ],
};

// 4) TESORERÍA — "Sin planillas"
const tesoreria: Reel = {
  id: 'tesoreria',
  nombre: 'Tesorería',
  desc: 'Módulo financiero: pagos programados, cajas, conciliación bancaria, sueldos.',
  accent: BRAND.tesoreria,
  scenes: [
    { kind: 'hook', eyebrow: 'Tesorería', lines: ['Manejá la plata', 'del municipio'], accentWord: 'sin planillas.' },
    { kind: 'feature', mockup: <MockupTesoreria />, chip: 'Pagos', title: 'Pagos programados', desc: 'Cada egreso cargado, autorizado y trazado.', accent: BRAND.tesoreria },
    { kind: 'feature', mockup: <MockupCajas />, chip: 'Cajas', title: 'Saldos al instante', desc: 'Ingresos y egresos de cada caja, en vivo.', accent: BRAND.reclamos },
    { kind: 'feature', mockup: <MockupConciliacion />, chip: 'Conciliación', title: 'Cuadrá el banco solo', desc: 'Importás el extracto y matchea automático.', accent: BRAND.tramites },
    { kind: 'feature', mockup: <MockupSueldos />, chip: 'Sueldos', title: 'Liquidaciones sin dolor', desc: 'Masa salarial y pagos recurrentes resueltos.', accent: '#8b5cf6' },
    { kind: 'cta', line: 'Adiós,', accentWord: 'Excel.', sub: 'Tesorería municipal, ordenada' },
  ],
};

// 5) IA / WHATSAPP — "Tu municipio atiende 24/7"
const ia: Reel = {
  id: 'ia',
  nombre: 'Atención con IA',
  desc: 'El bot de WhatsApp que atiende, clasifica reclamos y da turnos las 24 horas.',
  accent: BRAND.ia,
  scenes: [
    { kind: 'hook', eyebrow: 'Inteligencia artificial', lines: ['Tu municipio', 'atiende'], accentWord: '24/7.' },
    { kind: 'feature', mockup: <MockupWhatsApp />, chip: 'WhatsApp', title: 'Por donde ya escriben', desc: 'El vecino manda un mensaje. El bot responde.', accent: BRAND.ia },
    { kind: 'feature', mockup: <MockupSeguimiento />, chip: 'Automático', title: 'Clasifica y deriva', desc: 'Crea el reclamo y lo manda al área correcta.', accent: BRAND.reclamos },
    { kind: 'feature', mockup: <MockupTramite />, chip: 'Turnos y trámites', title: 'Resuelve sin humanos', desc: 'Da turnos e inicia trámites solo.', accent: BRAND.tramites },
    { kind: 'stat', value: 0, label: 'esperas en la fila', sub: 'el municipio nunca cierra', accent: BRAND.ia },
    { kind: 'cta', line: 'Atención', accentWord: 'sin esperas.', sub: 'Munify + IA' },
  ],
};

export const REELS: Reel[] = [tourGeneral, vecino, intendente, tesoreria, ia];

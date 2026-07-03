import type { OrdenTrabajo } from '../types';
import { prioridadLabels } from './enums/prioridadOT';
import { otEstadoLabels } from './enums/ordenTrabajo';

// Planilla imprimible de una OT (el "formato" que la cuadrilla lleva al campo).
// Abre una ventana nueva con HTML autocontenido (sin depender del theme de la
// app) y dispara la impresión: el navegador la guarda como PDF o la imprime.

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fecha(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString('es-AR');
}

function fila(label: string, valor: string): string {
  return `<div class="campo"><span class="lbl">${esc(label)}</span><span class="val">${valor}</span></div>`;
}

export function imprimirOrdenTrabajo(ot: OrdenTrabajo, municipioNombre: string): void {
  const responsable = ot.cuadrilla_nombre
    ? `Cuadrilla: ${esc(ot.cuadrilla_nombre)}`
    : (ot.empleado_nombre ? `Responsable: ${esc(ot.empleado_nombre)}` : 'Sin asignar');

  const horario = (ot.hora_inicio || ot.hora_fin)
    ? `${esc((ot.hora_inicio || '').slice(0, 5))}${ot.hora_fin ? ' a ' + esc(ot.hora_fin.slice(0, 5)) : ''}`
    : '—';

  const reclamos = (ot.reclamos || []);
  const reclamosHtml = reclamos.length
    ? `<table class="tabla"><thead><tr><th>#</th><th>Reclamo</th><th>Dirección</th></tr></thead><tbody>${
        reclamos.map(r => `<tr><td>${esc(r.id)}</td><td>${esc(r.titulo)}</td><td>${esc(r.direccion || '—')}</td></tr>`).join('')
      }</tbody></table>`
    : '<p class="vacio">Sin reclamos vinculados.</p>';

  const recursos = (ot.recursos || []);
  const activos = recursos.filter(r => r.tipo === 'reserva');
  const consumibles = recursos.filter(r => r.tipo === 'consumo');
  const materiales = (ot.materiales || []);

  const recursosHtml = (activos.length || consumibles.length || materiales.length)
    ? `<ul class="lista">${
        activos.map(r => `<li><strong>Activo:</strong> ${esc(r.item_nombre)}${r.identificador ? ` (${esc(r.identificador)})` : ''}</li>`).join('') +
        consumibles.map(r => `<li><strong>Material:</strong> ${esc(r.item_nombre)} — ${esc(r.cantidad ?? 1)}${r.unidad ? ' ' + esc(r.unidad) : ''}</li>`).join('') +
        materiales.map(m => `<li><strong>Suelto:</strong> ${esc(m.descripcion)}${m.cantidad > 1 ? ' × ' + esc(m.cantidad) : ''}${m.unidad ? ' ' + esc(m.unidad) : ''}</li>`).join('')
      }</ul>`
    : '<p class="vacio">Sin recursos ni materiales cargados.</p>';

  const cierreHtml = ot.estado === 'completada' && ot.notas_cierre
    ? `<div class="seccion"><h2>Trabajo realizado</h2><p>${esc(ot.notas_cierre)}</p>${
        ot.horas_reales != null ? `<p class="sub">Horas reales: ${esc(ot.horas_reales)}</p>` : ''}</div>`
    : '';

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(ot.numero)} — Orden de Trabajo</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; font-size: 12px; line-height: 1.45; margin: 0; }
  .hoja { max-width: 800px; margin: 0 auto; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a1a1a; padding-bottom: 10px; margin-bottom: 14px; }
  .muni { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
  .doc { text-align: right; }
  .doc .t { font-size: 13px; font-weight: 700; text-transform: uppercase; }
  .doc .n { font-size: 20px; font-weight: 800; font-family: monospace; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 14px; }
  .campo { display: flex; gap: 8px; padding: 3px 0; border-bottom: 1px dotted #ccc; }
  .lbl { font-weight: 600; color: #555; min-width: 90px; text-transform: uppercase; font-size: 10px; letter-spacing: .3px; padding-top: 1px; }
  .val { flex: 1; }
  .seccion { margin-bottom: 14px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #1a1a1a; border-bottom: 1px solid #1a1a1a; padding-bottom: 3px; margin: 0 0 6px; }
  .tabla { width: 100%; border-collapse: collapse; font-size: 11px; }
  .tabla th { text-align: left; background: #f0f0f0; padding: 4px 6px; border: 1px solid #ccc; font-size: 10px; text-transform: uppercase; }
  .tabla td { padding: 4px 6px; border: 1px solid #ccc; vertical-align: top; }
  .lista { margin: 0; padding-left: 18px; }
  .lista li { margin-bottom: 2px; }
  .vacio { color: #888; font-style: italic; margin: 0; }
  .sub { color: #555; font-size: 11px; }
  .desc { white-space: pre-wrap; }
  .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
  .firma { text-align: center; }
  .firma .linea { border-top: 1px solid #1a1a1a; padding-top: 5px; font-size: 10px; text-transform: uppercase; color: #555; }
  .pie { margin-top: 24px; text-align: center; font-size: 9px; color: #999; }
  @media print { .noprint { display: none; } }
</style></head>
<body><div class="hoja">
  <div class="top">
    <div class="muni">${esc(municipioNombre)}</div>
    <div class="doc"><div class="t">Orden de Trabajo</div><div class="n">${esc(ot.numero)}</div></div>
  </div>

  <div class="grid">
    ${fila('Estado', esc(otEstadoLabels[ot.estado] || ot.estado))}
    ${fila('Prioridad', esc(prioridadLabels[ot.prioridad] || ot.prioridad))}
    ${fila('Tipo', esc(ot.tipo_trabajo_nombre || '—'))}
    ${fila('Programada', fecha(ot.fecha_programada))}
    ${fila('Responsable', responsable)}
    ${fila('Horario', horario)}
    ${fila('Horas est.', ot.horas_estimadas != null ? esc(ot.horas_estimadas) : '—')}
    ${fila('Emitida', fecha(ot.created_at ? ot.created_at.slice(0, 10) : null))}
  </div>

  <div class="seccion">
    <h2>${esc(ot.titulo)}</h2>
    <p class="desc">${esc(ot.descripcion || 'Sin descripción.')}</p>
  </div>

  <div class="seccion"><h2>Reclamos vinculados</h2>${reclamosHtml}</div>
  <div class="seccion"><h2>Recursos y materiales</h2>${recursosHtml}</div>
  ${cierreHtml}

  <div class="firmas">
    <div class="firma"><div class="linea">Firma del responsable</div></div>
    <div class="firma"><div class="linea">Firma del supervisor</div></div>
  </div>

  <div class="pie">Generado desde Munify · ${esc(municipioNombre)}</div>
</div>
<script>window.onload = function(){ window.print(); };</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/**
 * Helpers para el camino "Trámite" del Mostrador:
 *   - PDF imprimible con los requisitos del trámite (jsPDF).
 *   - Mensaje de WhatsApp con la lista de requisitos para enviar al vecino.
 *   - Normalizador de teléfono argentino para wa.me.
 *
 * Toda la lógica vive client-side — no hay endpoint específico para esto
 * porque la data del trámite (nombre, costo, requisitos) ya viene del
 * GET /tramites estándar.
 */
import { jsPDF } from 'jspdf';
import type { Tramite } from '../types';

interface VecinoMin {
  nombre: string | null;
  apellido: string | null;
  dni?: string | null;
}

// ============================================================
// Normalización de teléfono (igual que la del backend wa_me.py)
// ============================================================
export function normalizarTelefonoAr(telefono: string): string | null {
  if (!telefono) return null;
  let raw = telefono.replace(/\D/g, '');
  if (!raw) return null;

  // Ya empieza con 54
  if (raw.startsWith('54')) {
    const rest = raw.slice(2);
    if (rest.length === 10 && !rest.startsWith('9')) {
      raw = '549' + rest;
    }
    return raw;
  }

  // Quitar 0 inicial
  if (raw.startsWith('0')) raw = raw.slice(1);

  // Quitar 15 (celu viejo): 11 15 12345678 → 11 12345678
  if (raw.length === 12 && raw.slice(2, 4) === '15') {
    raw = raw.slice(0, 2) + raw.slice(4);
  }

  // Prefijar 549 si tiene 10 dígitos (área + número)
  if (raw.length === 10) raw = '549' + raw;

  return raw.length >= 12 ? raw : null;
}

export function armarWaMeUrl(telefono: string | null | undefined, mensaje: string): string | null {
  if (!telefono) return null;
  const tel = normalizarTelefonoAr(telefono);
  if (!tel) return null;
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
}

// ============================================================
// Mensaje WhatsApp con requisitos
// ============================================================
export function mensajeRequisitosTramite(tramite: Tramite, vecino: VecinoMin): string {
  const nombre = vecino.nombre?.trim() || 'vecino/a';
  const lineas: string[] = [
    `Hola ${nombre}, te paso los requisitos para iniciar el trámite *${tramite.nombre}*:`,
    '',
  ];

  if (tramite.descripcion) {
    lineas.push(tramite.descripcion);
    lineas.push('');
  }

  lineas.push(`💰 Costo: ${tramite.costo ? '$' + tramite.costo.toLocaleString('es-AR') : 'Gratis'}`);
  lineas.push(`⏱️ Tiempo estimado: ${tramite.tiempo_estimado_dias} días`);

  if (tramite.requiere_cenat) {
    lineas.push('');
    lineas.push('⚠️ Requiere CENAT (Agencia Nacional de Seguridad Vial). El comprobante se adjunta aparte.');
  }

  const docs = tramite.documentos_requeridos || [];
  if (docs.length > 0) {
    lineas.push('');
    lineas.push('📋 *Documentación a presentar:*');
    docs.forEach((d, i) => {
      const obligatorio = d.obligatorio ? '' : ' (opcional)';
      lineas.push(`${i + 1}. ${d.nombre}${obligatorio}`);
      if (d.descripcion) lineas.push(`   ${d.descripcion}`);
    });
  }

  lineas.push('');
  lineas.push('Cuando tengas todo listo, acercate a la ventanilla del municipio.');

  return lineas.join('\n');
}

// ============================================================
// PDF imprimible con jsPDF
// ============================================================
export async function generarPdfRequisitos(tramite: Tramite, vecino: VecinoMin): Promise<void> {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });

  const margen = 18;
  const ancho = doc.internal.pageSize.getWidth();
  const anchoUtil = ancho - margen * 2;
  let y = margen;

  // Header
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, ancho, 8, 'F');
  y = margen + 2;

  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text('Requisitos para iniciar trámite', margen, y);
  y += 5;

  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold');
  doc.text(tramite.nombre, margen, y, { maxWidth: anchoUtil });
  y += 9;

  // Vecino destinatario
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  const nombreCompleto = `${vecino.nombre || ''} ${vecino.apellido || ''}`.trim() || '—';
  doc.text(`Para: ${nombreCompleto}`, margen, y);
  if (vecino.dni) {
    doc.text(`DNI: ${vecino.dni}`, ancho - margen - 50, y);
  }
  y += 7;

  // Línea separadora
  doc.setDrawColor(220);
  doc.line(margen, y, ancho - margen, y);
  y += 6;

  // Descripción
  if (tramite.descripcion) {
    doc.setFontSize(11);
    doc.setTextColor(50);
    const descLineas = doc.splitTextToSize(tramite.descripcion, anchoUtil);
    doc.text(descLineas, margen, y);
    y += descLineas.length * 5 + 4;
  }

  // Stat boxes (costo / días)
  doc.setFillColor(245, 247, 250);
  doc.rect(margen, y, anchoUtil, 14, 'F');

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('COSTO', margen + 4, y + 5);
  doc.text('TIEMPO ESTIMADO', margen + anchoUtil / 2 + 4, y + 5);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20);
  doc.text(
    tramite.costo ? `$${tramite.costo.toLocaleString('es-AR')}` : 'Gratis',
    margen + 4,
    y + 11,
  );
  doc.text(`${tramite.tiempo_estimado_dias} días`, margen + anchoUtil / 2 + 4, y + 11);
  y += 18;

  // CENAT warning
  if (tramite.requiere_cenat) {
    doc.setFillColor(255, 247, 237);
    doc.rect(margen, y, anchoUtil, 12, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9);
    doc.text('⚠ Requiere CENAT (ANSV)', margen + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 53, 15);
    doc.text(
      'El pago del CENAT es externo al municipio. Adjuntar comprobante al trámite.',
      margen + 4,
      y + 9,
    );
    y += 16;
  }

  // Lista de documentos
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20);
  doc.text('Documentación a presentar', margen, y);
  y += 7;

  const docs = tramite.documentos_requeridos || [];
  if (docs.length === 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(120);
    doc.text('Este trámite no requiere documentación adicional.', margen, y);
    y += 6;
  } else {
    docs.forEach((d, i) => {
      // Checkbox
      doc.setDrawColor(180);
      doc.rect(margen, y - 3.5, 4, 4);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20);
      const titulo = `${i + 1}. ${d.nombre}${!d.obligatorio ? ' (opcional)' : ''}`;
      doc.text(titulo, margen + 6, y);
      y += 5;

      if (d.descripcion) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        const descLineas = doc.splitTextToSize(d.descripcion, anchoUtil - 6);
        doc.text(descLineas, margen + 6, y);
        y += descLineas.length * 4;
      }
      y += 2;

      // Salto de página si nos quedamos sin espacio
      if (y > 270) {
        doc.addPage();
        y = margen;
      }
    });
  }

  // Footer
  y = doc.internal.pageSize.getHeight() - margen - 6;
  doc.setDrawColor(220);
  doc.line(margen, y, ancho - margen, y);
  y += 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150);
  doc.text(
    `Documento generado el ${new Date().toLocaleDateString('es-AR')} · Munify · Acercate al municipio cuando tengas todo`,
    margen,
    y,
  );

  const filename = `requisitos_${tramite.nombre.toLowerCase().replace(/\s+/g, '_').slice(0, 40)}.pdf`;
  doc.save(filename);
}

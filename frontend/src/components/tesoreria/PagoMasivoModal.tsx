import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, Check, Layers, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { WizardModal, WizardStep } from '../ui/WizardModal';
import { agendaPagosApi } from '../../lib/api';
import type { PagoProgramado } from '../../types';

// Helpers locales (no dependemos de los de TesoreriaAgenda, que no se exportan).
function parseLocalDate(f: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(f || '');
}
function fmtFecha(f: string): string {
  return parseLocalDate(f).toLocaleDateString('es-AR');
}
function fmtFechaLarga(f: string): string {
  return parseLocalDate(f).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'short' });
}
function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}
function totalDe(ps: PagoProgramado[]): number {
  return ps.reduce((s, p) => s + parseFloat(p.monto_pesos || '0'), 0);
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Candidatos a pagar: los pagos pendientes ya filtrados de la agenda. */
  pagos: PagoProgramado[];
  /** Refrescar la agenda tras un pago masivo exitoso. */
  onDone: () => void;
}

/**
 * Pago masivo en 2 fases:
 *  1) Selector de fechas (modal chico con toggles): "Pagar todo" + una por fecha.
 *  2) WizardModal armado en base a las fechas elegidas: un paso por fecha para
 *     destildar pagos puntuales + (si hay más de una fecha) un paso "Resumen".
 *     Cada pago se ejecuta con sus valores por defecto (monto, caja, fecha
 *     programada) vía POST /agenda/ejecutar-masivo. No se puede editar nada.
 */
export function PagoMasivoModal({ open, onClose, pagos, onDone }: Props) {
  const { theme } = useTheme();
  const [fase, setFase] = useState<'fechas' | 'wizard'>('fechas');
  const [fechasSel, setFechasSel] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Arranque limpio cada vez que se abre.
  useEffect(() => {
    if (open) { setFase('fechas'); setFechasSel(new Set()); setChecked(new Set()); setStep(0); }
  }, [open]);

  // Agrupar candidatos por fecha de próximo pago, ordenados.
  const grupos = useMemo(() => {
    const map = new Map<string, PagoProgramado[]>();
    for (const p of pagos) {
      const f = (p.proximo_pago || '').slice(0, 10);
      if (!f) continue;
      if (!map.has(f)) map.set(f, []);
      map.get(f)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [pagos]);

  const cerrar = () => { onClose(); };

  const toggleFecha = (f: string) =>
    setFechasSel(prev => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n; });

  const todasSeleccionadas = grupos.length > 0 && fechasSel.size === grupos.length;
  const toggleTodas = () =>
    setFechasSel(todasSeleccionadas ? new Set() : new Set(grupos.map(g => g[0])));

  const fechasElegidasCount = grupos
    .filter(g => fechasSel.has(g[0]))
    .reduce((s, g) => s + g[1].length, 0);

  const continuarAlWizard = () => {
    const ids = new Set<number>();
    for (const [f, ps] of grupos) if (fechasSel.has(f)) ps.forEach(p => ids.add(p.id));
    setChecked(ids);
    setStep(0);
    setFase('wizard');
  };

  const fechasWizard = useMemo(() => grupos.filter(g => fechasSel.has(g[0])), [grupos, fechasSel]);
  const multi = fechasWizard.length > 1;

  const togglePago = (id: number) =>
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const seleccionados = useMemo(() => pagos.filter(p => checked.has(p.id)), [pagos, checked]);
  const totalSel = totalDe(seleccionados);

  const confirmar = async () => {
    const ids = seleccionados.map(p => p.id);
    if (!ids.length) { toast.error('No hay pagos seleccionados'); return; }
    setSaving(true);
    try {
      const { data } = await agendaPagosApi.ejecutarMasivo(ids);
      if (data.fallidos > 0) toast.warning(`${data.exitosos} pagados, ${data.fallidos} fallaron`);
      else toast.success(`${data.exitosos} ${data.exitosos === 1 ? 'pago realizado' : 'pagos realizados'} · ${fmtMoney(data.monto_total)}`);
      cerrar();
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error en el pago masivo');
    } finally { setSaving(false); }
  };

  if (!open) return null;

  // Checkbox visual reutilizable.
  const checkBox = (on: boolean) => (
    <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: on ? theme.primary : 'transparent', border: `2px solid ${on ? theme.primary : theme.border}` }}>
      {on && <Check className="h-3 w-3" style={{ color: '#fff' }} />}
    </span>
  );

  // ===================== Fase 1: selector de fechas =====================
  if (fase === 'fechas') {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={cerrar}>
        <div className="w-full max-w-md rounded-2xl overflow-hidden animate-in slide-in-from-bottom-2"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }} onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${theme.primary}20` }}>
              <Layers className="h-5 w-5" style={{ color: theme.primary }} />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-bold" style={{ color: theme.text }}>Pago masivo</h3>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Elegí qué fechas pagar</p>
            </div>
          </div>

          <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto">
            {grupos.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: theme.textSecondary }}>
                No hay pagos pendientes para pagar.
              </p>
            ) : (
              <>
                <button onClick={toggleTodas}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.99]"
                  style={{ backgroundColor: todasSeleccionadas ? `${theme.primary}15` : theme.background, border: `1px solid ${todasSeleccionadas ? theme.primary : theme.border}` }}>
                  {checkBox(todasSeleccionadas)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: theme.text }}>Pagar todo</p>
                    <p className="text-[11px]" style={{ color: theme.textSecondary }}>{pagos.length} pagos · {fmtMoney(totalDe(pagos))}</p>
                  </div>
                </button>

                <div className="h-px my-1" style={{ backgroundColor: theme.border }} />

                {grupos.map(([f, ps]) => {
                  const on = fechasSel.has(f);
                  return (
                    <button key={f} onClick={() => toggleFecha(f)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.99]"
                      style={{ backgroundColor: on ? `${theme.primary}12` : theme.background, border: `1px solid ${on ? theme.primary : theme.border}` }}>
                      {checkBox(on)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold capitalize truncate" style={{ color: theme.text }}>{fmtFechaLarga(f)}</p>
                        <p className="text-[11px]" style={{ color: theme.textSecondary }}>{ps.length} {ps.length === 1 ? 'pago' : 'pagos'} · {fmtMoney(totalDe(ps))}</p>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>

          <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: `1px solid ${theme.border}` }}>
            <button onClick={cerrar}
              className="px-4 py-2 rounded-lg text-sm transition-all hover:opacity-80"
              style={{ border: `1px solid ${theme.border}`, color: theme.text }}>Cancelar</button>
            <button onClick={continuarAlWizard} disabled={fechasSel.size === 0}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: theme.primary }}>
              <Wallet className="h-4 w-4" />
              Continuar ({fechasElegidasCount})
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // ===================== Fase 2: wizard =====================
  const stepsFecha: WizardStep[] = fechasWizard.map(([f, ps]) => {
    const selDeFecha = ps.filter(p => checked.has(p.id)).length;
    return {
      id: `fecha-${f}`,
      title: fmtFechaLarga(f),
      description: `${selDeFecha} de ${ps.length} seleccionados`,
      icon: <CalendarClock className="h-4 w-4" />,
      isValid: seleccionados.length > 0,
      content: (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: theme.textSecondary }}>
            Destildá los que no querés pagar. Se pagan con su monto y caja predefinidos.
          </p>
          {ps.map(p => {
            const on = checked.has(p.id);
            return (
              <button key={p.id} onClick={() => togglePago(p.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.99]"
                style={{ backgroundColor: on ? `${theme.primary}12` : theme.background, border: `1px solid ${on ? theme.primary : theme.border}` }}>
                {checkBox(on)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>{p.contacto_nombre}</p>
                  <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>
                    {p.concepto}{p.caja_nombre ? ` · ${p.caja_nombre}` : ''}
                  </p>
                </div>
                <span className="font-bold tabular-nums text-sm flex-shrink-0" style={{ color: theme.text }}>{fmtMoney(p.monto_pesos)}</span>
              </button>
            );
          })}
        </div>
      ),
    };
  });

  const steps: WizardStep[] = [...stepsFecha];
  if (multi) {
    steps.push({
      id: 'resumen',
      title: 'Resumen',
      description: `${seleccionados.length} pagos · ${fmtMoney(totalSel)}`,
      icon: <Check className="h-4 w-4" />,
      isValid: seleccionados.length > 0,
      content: (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
            style={{ backgroundColor: `${theme.primary}12`, border: `1px solid ${theme.primary}30` }}>
            <span className="text-sm font-semibold" style={{ color: theme.text }}>
              {seleccionados.length} {seleccionados.length === 1 ? 'pago a realizar' : 'pagos a realizar'}
            </span>
            <span className="text-base font-bold tabular-nums" style={{ color: theme.primary }}>{fmtMoney(totalSel)}</span>
          </div>
          {seleccionados.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: theme.textSecondary }}>
              Destildaste todos. Volvé a tildar al menos uno para confirmar.
            </p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto rounded-xl" style={{ border: `1px solid ${theme.border}` }}>
              {seleccionados.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2"
                  style={{ borderTop: i > 0 ? `1px solid ${theme.border}` : undefined }}>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                    style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>{fmtFecha(p.proximo_pago)}</span>
                  <span className="flex-1 min-w-0 text-sm truncate" style={{ color: theme.text }}>
                    {p.contacto_nombre} <span style={{ color: theme.textSecondary }}>· {p.concepto}</span>
                  </span>
                  <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: theme.text }}>{fmtMoney(p.monto_pesos)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    });
  }

  return (
    <WizardModal
      open={open}
      onClose={cerrar}
      title="Pago masivo"
      steps={steps}
      currentStep={Math.min(step, steps.length - 1)}
      onStepChange={setStep}
      onComplete={confirmar}
      completeLabel={`Confirmar ${seleccionados.length} ${seleccionados.length === 1 ? 'pago' : 'pagos'}`}
      loading={saving}
      headerBadge={{ icon: <Wallet className="h-3.5 w-3.5" />, label: fmtMoney(totalSel), color: theme.primary }}
    />
  );
}

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { WizardModal, WizardStep } from '../ui/WizardModal';
import { Sheet } from '../ui/Sheet';
import { agendaPagosApi } from '../../lib/api';
import type { PagoProgramado } from '../../types';
import '../../styles/liquidaciones.css';

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
/** Días hasta la fecha (negativo = vencido). */
function diasHasta(f: string): number {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const d = parseLocalDate(f); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoy.getTime()) / 86400000);
}
/** Mensaje de error del backend con fallback (sin `any`). */
function msgError(e: unknown, fallback: string): string {
  const detalle = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detalle === 'string' && detalle ? detalle : fallback;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Candidatos a pagar: los pagos pendientes ya filtrados de la agenda. */
  pagos: PagoProgramado[];
  /** Pagos ya marcados en la grilla. Si vienen, el panel saltea la elección de
   *  días y abre directo el repaso con ésos tildados. */
  preseleccion?: number[];
  /** Refrescar la agenda tras un pago masivo exitoso. `resumen` trae lo que
   *  devolvió el backend, para que la pantalla arme su banner de cierre con
   *  datos reales (nunca estimados). */
  onDone: (resumen?: { cantidad: number; monto: number }) => void;
}

/**
 * Pago masivo en 2 fases:
 *  1) Selector de fechas (modal chico con toggles): "Pagar todo" + una por fecha.
 *  2) WizardModal armado en base a las fechas elegidas: un paso por fecha para
 *     destildar pagos puntuales + (si hay más de una fecha) un paso "Resumen".
 *     Cada pago se ejecuta con sus valores por defecto (monto, caja, fecha
 *     programada) vía POST /agenda/ejecutar-masivo. No se puede editar nada.
 */
export function PagoMasivoModal({ open, onClose, pagos, preseleccion, onDone }: Props) {
  const { theme } = useTheme();
  const [fase, setFase] = useState<'fechas' | 'wizard'>('fechas');
  const [fechasSel, setFechasSel] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Arranque cada vez que se abre. Con pagos ya marcados en la grilla, el
  // panel saltea la elección de días: el usuario ya la hizo ahí.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    const pre = preseleccion || [];
    if (pre.length > 0) {
      const ids = new Set(pre);
      setChecked(ids);
      setFechasSel(new Set(
        pagos.filter(p => ids.has(p.id)).map(p => (p.proximo_pago || '').slice(0, 10)),
      ));
      setFase('wizard');
    } else {
      setFase('fechas'); setFechasSel(new Set()); setChecked(new Set());
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
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
    setFechasSel(prev => {
      const n = new Set(prev);
      if (n.has(f)) n.delete(f); else n.add(f);
      return n;
    });

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
    setChecked(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

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
      onDone({ cantidad: data.exitosos, monto: parseFloat(data.monto_total) || 0 });
    } catch (e) {
      toast.error(msgError(e, 'Error en el pago masivo'));
    } finally { setSaving(false); }
  };

  if (!open) return null;

  // Checkbox visual reutilizable (clases sobre tokens, cero hex).
  const checkBox = (on: boolean) => (
    <span className={on ? 'liq-check liq-check--on' : 'liq-check'} aria-hidden>
      <Check size={12} strokeWidth={3} />
    </span>
  );

  // ===================== Fase 1: elegir qué días =====================
  // Drawer del kit (antes era un modal centrado a mano con portal + hex).
  if (fase === 'fechas') {
    const totalElegido = grupos
      .filter(g => fechasSel.has(g[0]))
      .reduce((sum, g) => sum + totalDe(g[1]), 0);

    return (
      <Sheet
        open={open}
        onClose={cerrar}
        title="Pago masivo"
        description="Una transferencia por cada día que elijas"
        customHeader={
          <div className="rs-head">
            <div className="rs-head-fila">
              <span className="rs-eyebrow">Pagos programados</span>
              <span className="rs-head-icos">
                <button type="button" className="rs-ico-btn" title="Cerrar" aria-label="Cerrar" onClick={cerrar}>
                  <X className="h-4 w-4" />
                </button>
              </span>
            </div>
            <h2 className="rs-titulo">Pago masivo</h2>
            <p className="rs-parrafo">Una transferencia por cada día que elijas.</p>
          </div>
        }
        stickyFooter={
          <div className="flex flex-col gap-2">
            <span className="liq-masivo-total">
              <span className="liq-masivo-total-label">Total a transferir</span>
              <span className="liq-masivo-total-valor">{fmtMoney(totalElegido)}</span>
            </span>
            <span className="liq-masivo-detalle">
              {fechasSel.size === 0
                ? 'Elegí al menos un día'
                : `${fechasSel.size} ${fechasSel.size === 1 ? 'día' : 'días'} · ${fechasElegidasCount} ${fechasElegidasCount === 1 ? 'pago' : 'pagos'}`}
            </span>
            <button type="button" className="rs-cta w-full justify-center"
              onClick={continuarAlWizard} disabled={fechasSel.size === 0}>
              <Wallet className="h-4 w-4" />
              Pagar {fechasElegidasCount} {fechasElegidasCount === 1 ? 'pago' : 'pagos'}
            </button>
          </div>
        }
      >
        {grupos.length === 0 ? (
          <p className="liq-masivo-vacio">No hay pagos pendientes para pagar.</p>
        ) : (
          <>
            <button type="button" onClick={toggleTodas}
              className={todasSeleccionadas ? 'liq-masivo-op liq-masivo-op--on' : 'liq-masivo-op'}>
              {checkBox(todasSeleccionadas)}
              <span className="liq-masivo-cuerpo">
                <span className="liq-masivo-titulo">Pagar todo lo pendiente</span>
                <span className="liq-masivo-detalle">
                  {pagos.length} {pagos.length === 1 ? 'pago' : 'pagos'} · {fmtMoney(totalDe(pagos))}
                </span>
              </span>
            </button>

            <span className="liq-masivo-rotulo">O elegí qué días</span>

            {grupos.map(([f, ps]) => {
              const on = fechasSel.has(f);
              const d = diasHasta(f);
              return (
                <button key={f} type="button" onClick={() => toggleFecha(f)}
                  className={on ? 'liq-masivo-op liq-masivo-op--on' : 'liq-masivo-op'}>
                  {checkBox(on)}
                  <span className="liq-masivo-cuerpo">
                    <span className="liq-masivo-titulo">{fmtFechaLarga(f)}</span>
                    <span className="liq-masivo-detalle">
                      {ps.length} {ps.length === 1 ? 'pago' : 'pagos'}
                      {d < 0 ? ' · vencido' : d === 0 ? ' · vence hoy' : ''}
                    </span>
                  </span>
                  <span className="av2-money av2-tabla-monto">{fmtMoney(totalDe(ps))}</span>
                </button>
              );
            })}
          </>
        )}
      </Sheet>
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

/**
 * ABM de TARJETAS DE CRÉDITO — una sola fuente de verdad.
 *
 * ANTES había DOS mundos de "tarjeta" y el cliente sufría la inconsistencia:
 *   1. esta pantalla, sobre la tabla `tarjetas_credito`, que era sólo una
 *      ETIQUETA sin efecto contable;
 *   2. la caja-tarjeta (`tesoreria_cajas` con código TARJETA), donde de verdad
 *      se acumula la deuda y desde donde la paga el wizard de gastos.
 * Resultado real en producción (San Pedro Norte, 2026-08-28): el vecino cargaba
 * su Visa acá, el wizard se la ofrecía… y dos pasos después le decía que no
 * tenía ninguna tarjeta, porque la caja no existía. Cargar la misma tarjeta en
 * dos lugares no es una configuración: es un bug de diseño.
 *
 * AHORA esta pantalla administra la caja-tarjeta directamente: lo que se crea
 * acá es lo que el wizard ofrece y lo que acumula la deuda. La tabla vieja
 * queda como legado de los gastos ya cargados; nadie escribe más ahí.
 */
import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Plus, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { PagarTarjetaModal } from '../components/tesoreria/PagarTarjetaModal';
import { cajasApi } from '../lib/api';
import type { Caja } from '../types';
import { useReportarTotal } from '../components/abmv2/useEmbed';

/** Una caja con `codigo === 'TARJETA'`. El tipo es el `Caja` del dominio: el
 *  backend ya expone ahí es_tarjeta / limite / deuda_actual calculados. */
type CajaTarjeta = Caja;

const MARCAS: SelectOption[] = [
  { value: 'Visa', label: 'Visa' },
  { value: 'Mastercard', label: 'Mastercard' },
  { value: 'American Express', label: 'American Express' },
  { value: 'Otra', label: 'Otra' },
];

const MARCA_COLOR: Record<string, string> = {
  Visa: '#1a1f71',
  Mastercard: '#eb001b',
  'American Express': '#2e77bc',
  Otra: '#64748b',
};

const plata = (v: string | null | undefined) =>
  '$ ' + (parseFloat(v || '0') || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

/** El nombre guardado es "Visa ····9594": se arma y se desarma acá para que el
 *  form siga teniendo campos separados (es más claro que pedir un texto libre). */
const armarNombre = (denominacion: string, ultimos4: string) =>
  ultimos4.trim() ? `${denominacion.trim()} ····${ultimos4.trim()}` : denominacion.trim();
const partirNombre = (nombre: string) => {
  const m = nombre.match(/^(.*?)\s*·+\s*(\d{2,4})\s*$/);
  return m ? { denominacion: m[1], ultimos_4: m[2] } : { denominacion: nombre, ultimos_4: '' };
};

type FormState = {
  denominacion: string;
  marca: string;
  ultimos_4: string;
  limite: string;
  activo: boolean;
};

const FORM_VACIO: FormState = { denominacion: '', marca: 'Visa', ultimos_4: '', limite: '', activo: true };

export default function TarjetasCredito() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [tarjetas, setTarjetas] = useState<CajaTarjeta[]>([]);
  // El modal de pago necesita las cajas REALES (de donde sale la plata).
  const [todasLasCajas, setTodasLasCajas] = useState<CajaTarjeta[]>([]);
  useReportarTotal(tarjetas.length);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [confirmDel, setConfirmDel] = useState<CajaTarjeta | null>(null);
  const [pagando, setPagando] = useState<CajaTarjeta | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await cajasApi.list({ include_saldos: true });
      const todas = (res.data as CajaTarjeta[]) || [];
      setTodasLasCajas(todas);
      setTarjetas(todas.filter(c => c.es_tarjeta));
    } catch {
      toast.error('Error cargando tarjetas');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return tarjetas;
    return tarjetas.filter(t => t.nombre.toLowerCase().includes(s));
  }, [tarjetas, search]);

  // El guard va DESPUÉS de todos los hooks (React #310).
  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <div className="p-6"><p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p></div>;
  }

  const abrirNueva = () => { setEditId(null); setForm(FORM_VACIO); setSheetOpen(true); };
  const abrirEditar = (t: CajaTarjeta) => {
    const { denominacion, ultimos_4 } = partirNombre(t.nombre);
    const marca = MARCAS.find(m => denominacion.toLowerCase().startsWith(m.value.toLowerCase()));
    setEditId(t.id);
    setForm({
      denominacion,
      marca: marca ? String(marca.value) : 'Otra',
      ultimos_4,
      limite: t.saldo_inicial ? String(parseFloat(t.saldo_inicial)) : '',
      activo: t.activo,
    });
    setSheetOpen(true);
  };

  const guardar = async () => {
    if (!form.denominacion.trim()) { toast.error('Poné el nombre de la tarjeta'); return; }
    if (form.ultimos_4 && !/^\d{2,4}$/.test(form.ultimos_4.trim())) {
      toast.error('Los últimos dígitos van entre 2 y 4 números'); return;
    }
    const payload = {
      nombre: armarNombre(form.denominacion, form.ultimos_4),
      // El código es lo que la convierte en tarjeta: sin esto sería una caja
      // común y el wizard no la ofrecería al pagar con tarjeta.
      codigo: 'TARJETA',
      color: MARCA_COLOR[form.marca] || null,
      icono: 'CreditCard',
      saldo_inicial: form.limite ? String(parseFloat(form.limite)) : '0',
      activo: form.activo,
    };
    try {
      setGuardando(true);
      if (editId) await cajasApi.update(editId, payload);
      else await cajasApi.create(payload);
      toast.success(editId ? 'Tarjeta actualizada' : 'Tarjeta creada');
      setSheetOpen(false);
      await fetchData();
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!confirmDel) return;
    try {
      await cajasApi.delete(confirmDel.id);
      toast.success('Tarjeta eliminada');
      setConfirmDel(null);
      setSheetOpen(false);
      await fetchData();
    } catch {
      toast.error('No se pudo eliminar: puede tener gastos asociados');
    }
  };

  const inputStyle = { backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}` };

  return (
    <>
      <ABMPage
        title="Tarjetas de crédito"
        icon={<CreditCard className="h-5 w-5" />}
        searchPlaceholder="Buscar por nombre o últimos dígitos..."
        searchValue={search}
        onSearchChange={setSearch}
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyMessage="No hay tarjetas cargadas. Agregá la primera: los gastos que pagues con ella se acumulan como deuda y no salen de ninguna caja."
        buttonLabel="Nueva tarjeta"
        buttonIcon={<Plus className="h-4 w-4 mr-1.5" />}
        onAdd={abrirNueva}
      >
        {filtered.map(t => {
          const color = t.color || theme.primary;
          const deuda = parseFloat(t.deuda_actual || '0') || 0;
          const { denominacion, ultimos_4 } = partirNombre(t.nombre);
          return (
            <div
              key={t.id}
              className="rounded-2xl p-5 transition-all"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, opacity: t.activo ? 1 : 0.55 }}
            >
              <div onClick={() => abrirEditar(t)} className="cursor-pointer">
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    <CreditCard className="h-6 w-6" />
                  </div>
                  {deuda > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--pl-amber-strong, #b45309) 18%, transparent)', color: 'var(--pl-amber-strong, #b45309)' }}>
                      con deuda
                    </span>
                  )}
                </div>
                <h3 className="font-bold truncate mb-1" style={{ color: theme.text }}>{denominacion}</h3>
                <p className="text-lg font-mono tracking-widest mb-3" style={{ color: theme.textSecondary }}>
                  ···· {ultimos_4 || '····'}
                </p>

                {/* Lo que el cliente vino a ver: cuánto debe hoy. */}
                <div className="flex items-baseline justify-between text-sm">
                  <span style={{ color: theme.textSecondary }}>Deuda</span>
                  <span className="font-bold" style={{ color: deuda > 0 ? 'var(--pl-amber-strong, #b45309)' : theme.text }}>
                    {plata(t.deuda_actual)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between text-xs mt-1">
                  <span style={{ color: theme.textSecondary }}>Disponible</span>
                  <span style={{ color: theme.textSecondary }}>{plata(t.saldo_actual)}</span>
                </div>
                <div className="flex items-baseline justify-between text-xs mt-1">
                  <span style={{ color: theme.textSecondary }}>Límite</span>
                  <span style={{ color: theme.textSecondary }}>{plata(t.saldo_inicial)}</span>
                </div>
              </div>

              {deuda > 0 && (
                <button
                  onClick={() => setPagando(t)}
                  className="w-full mt-4 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                  style={{ backgroundColor: theme.primary, color: theme.primaryText }}
                >
                  <Wallet className="h-4 w-4" /> Pagar tarjeta
                </button>
              )}
            </div>
          );
        })}
      </ABMPage>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editId ? 'Editar tarjeta' : 'Nueva tarjeta'}
        stickyFooter={
          <div className="flex items-center gap-2">
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
              style={{ backgroundColor: theme.primary, color: theme.primaryText, opacity: guardando ? 0.6 : 1 }}
            >
              {guardando ? 'Guardando...' : (editId ? 'Guardar cambios' : 'Crear tarjeta')}
            </button>
            {editId && (
              <button
                onClick={() => { const t = tarjetas.find(x => x.id === editId); if (t) setConfirmDel(t); }}
                className="px-4 py-2.5 rounded-xl font-semibold text-sm"
                style={{ backgroundColor: 'transparent', color: 'var(--pl-red, #b91c1c)', border: `1px solid ${theme.border}` }}
              >
                Eliminar
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs" style={{ color: theme.textSecondary }}>
            Los gastos que pagues con esta tarjeta se acumulan como <strong>deuda</strong> y no
            salen de ninguna caja. Cuando pagues el resumen, usás “Pagar tarjeta” y ahí sí sale
            de la caja que elijas.
          </p>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: theme.textSecondary }}>Nombre</label>
            <input
              value={form.denominacion}
              onChange={e => setForm({ ...form, denominacion: e.target.value })}
              placeholder="Visa Cordobesa"
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: theme.textSecondary }}>Marca</label>
              <ModernSelect
                value={form.marca}
                onChange={v => setForm({ ...form, marca: v })}
                options={MARCAS}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: theme.textSecondary }}>Últimos dígitos</label>
              <input
                value={form.ultimos_4}
                onChange={e => setForm({ ...form, ultimos_4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="9594"
                inputMode="numeric"
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: theme.textSecondary }}>
              Límite de la tarjeta
            </label>
            <input
              value={form.limite}
              onChange={e => setForm({ ...form, limite: e.target.value.replace(/[^\d.]/g, '') })}
              placeholder="3000000"
              inputMode="decimal"
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={inputStyle}
            />
            <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
              Sirve para mostrar el crédito disponible. No afecta la deuda: esa sale de los gastos.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: theme.text }}>
            <input
              type="checkbox"
              checked={form.activo}
              onChange={e => setForm({ ...form, activo: e.target.checked })}
            />
            Activa (se ofrece al cargar un gasto)
          </label>
        </div>
      </Sheet>

      <ConfirmModal
        isOpen={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={borrar}
        title="Eliminar tarjeta"
        message={`¿Eliminar "${confirmDel?.nombre || ''}"? Si tiene gastos asociados no se va a poder.`}
        confirmText="Eliminar"
        variant="danger"
      />

      <PagarTarjetaModal
        tarjeta={pagando}
        cajas={todasLasCajas}
        onClose={() => setPagando(null)}
        onDone={() => { setPagando(null); fetchData(); }}
      />
    </>
  );
}

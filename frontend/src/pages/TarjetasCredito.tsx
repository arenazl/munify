import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ModernSelect, type SelectOption } from '../components/ui/ModernSelect';
import { tarjetasApi } from '../lib/api';

interface Tarjeta {
  id: number;
  denominacion: string;
  marca: string;
  ultimos_4: string | null;
  dia_cierre: number | null;
  color: string | null;
  icono: string | null;
  orden: number;
  activo: boolean;
}

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

type FormState = {
  denominacion: string;
  marca: string;
  ultimos_4: string;
  dia_cierre: string;
  activo: boolean;
};

const FORM_VACIO: FormState = { denominacion: '', marca: 'Visa', ultimos_4: '', dia_cierre: '', activo: true };

export default function TarjetasCredito() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Tarjeta | null>(null);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <div className="p-6"><p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p></div>;
  }

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await tarjetasApi.list();
      setTarjetas((res.data as Tarjeta[]) || []);
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
    return tarjetas.filter(t =>
      t.denominacion.toLowerCase().includes(s) ||
      t.marca.toLowerCase().includes(s) ||
      (t.ultimos_4 || '').includes(s)
    );
  }, [tarjetas, search]);

  const abrirNueva = () => { setEditId(null); setForm(FORM_VACIO); setSheetOpen(true); };
  const abrirEditar = (t: Tarjeta) => {
    setEditId(t.id);
    setForm({
      denominacion: t.denominacion,
      marca: t.marca,
      ultimos_4: t.ultimos_4 || '',
      dia_cierre: t.dia_cierre != null ? String(t.dia_cierre) : '',
      activo: t.activo,
    });
    setSheetOpen(true);
  };

  const guardar = async () => {
    if (!form.denominacion.trim()) { toast.error('Poné una denominación'); return; }
    if (form.dia_cierre && (Number(form.dia_cierre) < 1 || Number(form.dia_cierre) > 31)) {
      toast.error('El día de cierre debe ser entre 1 y 31'); return;
    }
    const payload = {
      denominacion: form.denominacion.trim(),
      marca: form.marca,
      ultimos_4: form.ultimos_4.trim() || null,
      dia_cierre: form.dia_cierre ? Number(form.dia_cierre) : null,
      activo: form.activo,
    };
    try {
      setGuardando(true);
      if (editId) await tarjetasApi.update(editId, payload);
      else await tarjetasApi.create(payload);
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
      await tarjetasApi.remove(confirmDel.id);
      toast.success('Tarjeta eliminada');
      setConfirmDel(null);
      setSheetOpen(false);
      await fetchData();
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const inputStyle = { backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}` };

  return (
    <>
      <ABMPage
        title="Tarjetas de crédito"
        icon={<CreditCard className="h-5 w-5" />}
        searchPlaceholder="Buscar por denominación, marca o últimos 4..."
        searchValue={search}
        onSearchChange={setSearch}
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyMessage="No hay tarjetas cargadas. Agregá la primera."
        buttonLabel="Nueva tarjeta"
        buttonIcon={<Plus className="h-4 w-4 mr-1.5" />}
        onAdd={abrirNueva}
      >
        {filtered.map(t => {
          const color = t.color || MARCA_COLOR[t.marca] || theme.primary;
          return (
            <div
              key={t.id}
              onClick={() => abrirEditar(t)}
              className="rounded-2xl p-5 cursor-pointer transition-all hover:scale-[1.01]"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, opacity: t.activo ? 1 : 0.55 }}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  <CreditCard className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}20`, color }}>
                  {t.marca}
                </span>
              </div>
              <h3 className="font-bold truncate mb-1" style={{ color: theme.text }}>{t.denominacion}</h3>
              <p className="text-lg font-mono tracking-widest" style={{ color: theme.textSecondary }}>
                ···· {t.ultimos_4 || '····'}
              </p>
              {t.dia_cierre != null && (
                <p className="text-[11px] mt-2" style={{ color: theme.textSecondary }}>
                  Cierra el día {t.dia_cierre}
                </p>
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
            {editId && (
              <button
                onClick={() => setConfirmDel(tarjetas.find(t => t.id === editId) || null)}
                className="px-3 py-2.5 rounded-lg font-medium"
                style={{ color: '#ef4444', border: `1px solid ${theme.border}` }}
              >
                Eliminar
              </button>
            )}
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex-1 py-2.5 rounded-lg font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: theme.primary }}
            >
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Denominación</p>
            <input
              type="text"
              value={form.denominacion}
              onChange={e => setForm({ ...form, denominacion: e.target.value })}
              placeholder="Ej: Visa Tesorería"
              className="w-full px-3 py-2 rounded-lg"
              style={inputStyle}
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Marca</p>
            <ModernSelect value={form.marca} onChange={(v) => setForm({ ...form, marca: v })} options={MARCAS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Últimos 4</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={form.ultimos_4}
                onChange={e => setForm({ ...form, ultimos_4: e.target.value.replace(/\D/g, '') })}
                placeholder="1234"
                className="w-full px-3 py-2 rounded-lg"
                style={inputStyle}
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: theme.textSecondary }}>Día de cierre</p>
              <input
                type="number"
                min={1}
                max={31}
                value={form.dia_cierre}
                onChange={e => setForm({ ...form, dia_cierre: e.target.value })}
                placeholder="Ej: 25"
                className="w-full px-3 py-2 rounded-lg"
                style={inputStyle}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />
            <span className="text-sm" style={{ color: theme.text }}>Activa</span>
          </label>
        </div>
      </Sheet>

      <ConfirmModal
        isOpen={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={borrar}
        title="Eliminar tarjeta"
        message={confirmDel ? `¿Eliminar "${confirmDel.denominacion}"?` : ''}
        confirmText="Eliminar"
        cancelText="Volver"
        variant="danger"
      />
    </>
  );
}

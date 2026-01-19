import { useEffect, useState, useRef } from 'react';
import { ShoppingCart, Calendar, FileText, Plus, DollarSign, X } from 'lucide-react';
import { toast } from 'sonner';
import { comprasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage } from '../components/ui/ABMPage';
import type { Compra } from '../types';

export default function Compras() {
  const { theme } = useTheme();
  const dataLoadedRef = useRef(false);

  // Estado principal
  const [compras, setCompras] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Filtros
  const [filtroActivo, setFiltroActivo] = useState<string>('true');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Sheet states
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingCompra, setEditingCompra] = useState<Compra | null>(null);

  // Form data
  const [formData, setFormData] = useState({
    fecha: '',
    numero: '',
    proveedor: '',
    descripcion: '',
    monto: '',
  });

  // Cargar compras
  const fetchCompras = async () => {
    try {
      const params: any = {};

      if (filtroActivo !== '') {
        params.activo = filtroActivo === 'true';
      }

      if (fechaDesde) {
        params.fecha_desde = fechaDesde;
      }

      if (fechaHasta) {
        params.fecha_hasta = fechaHasta;
      }

      const response = await comprasApi.getAll(params);
      setCompras(response.data);
    } catch (error) {
      console.error('Error fetching compras:', error);
      toast.error('Error al cargar compras');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!dataLoadedRef.current) {
      fetchCompras();
      dataLoadedRef.current = true;
    }
  }, []);

  // Recargar cuando cambian los filtros
  useEffect(() => {
    if (dataLoadedRef.current) {
      fetchCompras();
    }
  }, [filtroActivo, fechaDesde, fechaHasta]);

  // Filtrar por búsqueda local
  const comprasFiltradas = compras.filter((compra) => {
    const searchLower = search.toLowerCase();
    return (
      compra.numero?.toLowerCase().includes(searchLower) ||
      compra.proveedor?.toLowerCase().includes(searchLower) ||
      compra.descripcion?.toLowerCase().includes(searchLower)
    );
  });

  // Handlers
  const handleAdd = () => {
    setEditingCompra(null);
    setFormData({
      fecha: new Date().toISOString().split('T')[0],
      numero: '',
      proveedor: '',
      descripcion: '',
      monto: '',
    });
    setSheetOpen(true);
  };

  const handleEdit = (compra: Compra) => {
    setEditingCompra(compra);
    setFormData({
      fecha: compra.fecha,
      numero: compra.numero || '',
      proveedor: compra.proveedor || '',
      descripcion: compra.descripcion || '',
      monto: compra.monto?.toString() || '',
    });
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!formData.fecha) {
      toast.error('La fecha es requerida');
      return;
    }

    setSaving(true);
    try {
      const data = {
        fecha: formData.fecha,
        numero: formData.numero || undefined,
        proveedor: formData.proveedor || undefined,
        descripcion: formData.descripcion || undefined,
        monto: formData.monto ? parseFloat(formData.monto) : undefined,
      };

      if (editingCompra) {
        await comprasApi.update(editingCompra.id, data);
        toast.success('Compra actualizada correctamente');
      } else {
        await comprasApi.create(data);
        toast.success('Compra creada correctamente');
      }

      setSheetOpen(false);
      fetchCompras();
    } catch (error) {
      console.error('Error saving compra:', error);
      toast.error('Error al guardar compra');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (compra: Compra) => {
    if (!confirm('¿Está seguro de eliminar esta compra?')) {
      return;
    }

    try {
      await comprasApi.delete(compra.id);
      toast.success('Compra eliminada correctamente');
      fetchCompras();
    } catch (error) {
      console.error('Error deleting compra:', error);
      toast.error('Error al eliminar compra');
    }
  };

  const handleToggleActivo = async (compra: Compra) => {
    try {
      await comprasApi.update(compra.id, { activo: !compra.activo });
      toast.success(compra.activo ? 'Compra desactivada' : 'Compra activada');
      fetchCompras();
    } catch (error) {
      console.error('Error toggling activo:', error);
      toast.error('Error al cambiar estado');
    }
  };

  // Formatear fecha
  const formatFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // Formatear monto
  const formatMonto = (monto?: number) => {
    if (!monto) return '-';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(monto);
  };

  return (
    <ABMPage
      title="Compras"
      icon={<ShoppingCart className="h-5 w-5" />}
      buttonLabel="Nueva Compra"
      buttonIcon={<Plus className="h-4 w-4" />}
      onAdd={handleAdd}
      searchPlaceholder="Buscar por número, proveedor o descripción..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={comprasFiltradas.length === 0}
      emptyMessage="No se encontraron compras"
      stickyHeader={true}
      secondaryFilters={
        <div className="flex flex-wrap items-center gap-3">
          {/* Filtro Activo */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium" style={{ color: theme.textSecondary }}>
              Estado:
            </label>
            <select
              value={filtroActivo}
              onChange={(e) => setFiltroActivo(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm focus:ring-2 focus:outline-none"
              style={{
                backgroundColor: theme.background,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            >
              <option value="">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </div>

          {/* Fecha Desde */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium" style={{ color: theme.textSecondary }}>
              Desde:
            </label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: theme.textSecondary }} />
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="pl-9 pr-8 py-1.5 rounded-lg text-sm focus:ring-2 focus:outline-none"
                style={{
                  backgroundColor: theme.background,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                }}
              />
              {fechaDesde && (
                <button
                  onClick={() => setFechaDesde('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-black/10"
                  title="Limpiar fecha desde"
                >
                  <X className="h-3.5 w-3.5" style={{ color: theme.textSecondary }} />
                </button>
              )}
            </div>
          </div>

          {/* Fecha Hasta */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium" style={{ color: theme.textSecondary }}>
              Hasta:
            </label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: theme.textSecondary }} />
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="pl-9 pr-8 py-1.5 rounded-lg text-sm focus:ring-2 focus:outline-none"
                style={{
                  backgroundColor: theme.background,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                }}
              />
              {fechaHasta && (
                <button
                  onClick={() => setFechaHasta('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-black/10"
                  title="Limpiar fecha hasta"
                >
                  <X className="h-3.5 w-3.5" style={{ color: theme.textSecondary }} />
                </button>
              )}
            </div>
          </div>
        </div>
      }
      sheetOpen={sheetOpen}
      sheetTitle={editingCompra ? 'Editar Compra' : 'Nueva Compra'}
      sheetDescription={editingCompra ? 'Modifica los datos de la compra' : 'Completa los datos de la nueva compra'}
      onSheetClose={() => setSheetOpen(false)}
      sheetContent={
        <div className="space-y-4 py-4">
          {/* Fecha */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Fecha <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="date"
              value={formData.fecha}
              onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:outline-none"
              style={{
                backgroundColor: theme.background,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
          </div>

          {/* Número */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Número
            </label>
            <input
              type="text"
              value={formData.numero}
              onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
              placeholder="Número de compra"
              className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:outline-none"
              style={{
                backgroundColor: theme.background,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
          </div>

          {/* Proveedor */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Proveedor
            </label>
            <input
              type="text"
              value={formData.proveedor}
              onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
              placeholder="Nombre del proveedor"
              className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:outline-none"
              style={{
                backgroundColor: theme.background,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Descripción
            </label>
            <textarea
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              placeholder="Descripción de la compra"
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:outline-none resize-none"
              style={{
                backgroundColor: theme.background,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
          </div>

          {/* Monto */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
              Monto
            </label>
            <input
              type="number"
              value={formData.monto}
              onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
              placeholder="0.00"
              step="0.01"
              className="w-full px-3 py-2 rounded-lg text-sm focus:ring-2 focus:outline-none"
              style={{
                backgroundColor: theme.background,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            />
          </div>
        </div>
      }
      sheetFooter={
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setSheetOpen(false)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: theme.background,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: theme.primary,
              color: '#ffffff',
            }}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      }
    >
      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {comprasFiltradas.map((compra) => (
          <div
            key={compra.id}
            className="rounded-xl p-4 transition-all hover:shadow-lg cursor-pointer"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              opacity: compra.activo ? 1 : 0.6,
            }}
            onClick={() => handleEdit(compra)}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${theme.primary}15` }}
                >
                  <ShoppingCart className="h-5 w-5" style={{ color: theme.primary }} />
                </div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: theme.text }}>
                    {compra.numero || `Compra #${compra.id}`}
                  </div>
                  <div className="text-xs" style={{ color: theme.textSecondary }}>
                    {formatFecha(compra.fecha)}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleActivo(compra);
                  }}
                  className="p-1.5 rounded-lg transition-colors text-xs font-medium"
                  style={{
                    backgroundColor: compra.activo ? `${theme.primary}15` : `${theme.textSecondary}15`,
                    color: compra.activo ? theme.primary : theme.textSecondary,
                  }}
                  title={compra.activo ? 'Desactivar' : 'Activar'}
                >
                  {compra.activo ? 'Activo' : 'Inactivo'}
                </button>
              </div>
            </div>

            {/* Proveedor */}
            {compra.proveedor && (
              <div className="mb-2">
                <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>
                  Proveedor:{' '}
                </span>
                <span className="text-sm" style={{ color: theme.text }}>
                  {compra.proveedor}
                </span>
              </div>
            )}

            {/* Descripción */}
            {compra.descripcion && (
              <div className="mb-3">
                <p className="text-sm line-clamp-2" style={{ color: theme.textSecondary }}>
                  {compra.descripcion}
                </p>
              </div>
            )}

            {/* Monto */}
            <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: theme.border }}>
              <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>
                Monto
              </span>
              <span className="text-sm font-semibold" style={{ color: theme.text }}>
                {formatMonto(compra.monto)}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-3 pt-3 border-t" style={{ borderColor: theme.border }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(compra);
                }}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor: `${theme.primary}15`,
                  color: theme.primary,
                }}
              >
                Editar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(compra);
                }}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor: '#ef444415',
                  color: '#ef4444',
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </ABMPage>
  );
}

import { useEffect, useState, useRef } from 'react';
import { ShoppingCart, Calendar, FileText, Plus, DollarSign, X } from 'lucide-react';
import { toast } from 'sonner';
import { pedidosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage } from '../components/ui/ABMPage';
import type { Pedido } from '../types';

export default function Pedidos() {
  const { theme } = useTheme();
  const dataLoadedRef = useRef(false);

  // Estado principal
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Filtros
  const [filtroActivo, setFiltroActivo] = useState<string>('true');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Sheet states
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPedido, setEditingPedido] = useState<Pedido | null>(null);

  // Form data
  const [formData, setFormData] = useState({
    fecha: '',
    numero: '',
    descripcion: '',
    monto: '',
  });

  // Cargar pedidos
  const fetchPedidos = async () => {
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

      const response = await pedidosApi.getAll(params);
      setPedidos(response.data);
    } catch (error) {
      console.error('Error fetching pedidos:', error);
      toast.error('Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!dataLoadedRef.current) {
      fetchPedidos();
      dataLoadedRef.current = true;
    }
  }, []);

  // Recargar cuando cambian los filtros
  useEffect(() => {
    if (dataLoadedRef.current) {
      fetchPedidos();
    }
  }, [filtroActivo, fechaDesde, fechaHasta]);

  // Filtrar por búsqueda local
  const pedidosFiltrados = pedidos.filter((pedido) => {
    const searchLower = search.toLowerCase();
    return (
      pedido.numero?.toLowerCase().includes(searchLower) ||
      pedido.descripcion?.toLowerCase().includes(searchLower)
    );
  });

  // Handlers
  const handleAdd = () => {
    setEditingPedido(null);
    setFormData({
      fecha: new Date().toISOString().split('T')[0],
      numero: '',
      descripcion: '',
      monto: '',
    });
    setSheetOpen(true);
  };

  const handleEdit = (pedido: Pedido) => {
    setEditingPedido(pedido);
    setFormData({
      fecha: pedido.fecha,
      numero: pedido.numero || '',
      descripcion: pedido.descripcion || '',
      monto: pedido.monto?.toString() || '',
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
        descripcion: formData.descripcion || undefined,
        monto: formData.monto ? parseFloat(formData.monto) : undefined,
      };

      if (editingPedido) {
        await pedidosApi.update(editingPedido.id, data);
        toast.success('Pedido actualizado correctamente');
      } else {
        await pedidosApi.create(data);
        toast.success('Pedido creado correctamente');
      }

      setSheetOpen(false);
      fetchPedidos();
    } catch (error) {
      console.error('Error saving pedido:', error);
      toast.error('Error al guardar pedido');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pedido: Pedido) => {
    if (!confirm('¿Está seguro de eliminar este pedido?')) {
      return;
    }

    try {
      await pedidosApi.delete(pedido.id);
      toast.success('Pedido eliminado correctamente');
      fetchPedidos();
    } catch (error) {
      console.error('Error deleting pedido:', error);
      toast.error('Error al eliminar pedido');
    }
  };

  const handleToggleActivo = async (pedido: Pedido) => {
    try {
      await pedidosApi.update(pedido.id, { activo: !pedido.activo });
      toast.success(pedido.activo ? 'Pedido desactivado' : 'Pedido activado');
      fetchPedidos();
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
      title="Pedidos"
      icon={<ShoppingCart className="h-5 w-5" />}
      buttonLabel="Nuevo Pedido"
      buttonIcon={<Plus className="h-4 w-4" />}
      onAdd={handleAdd}
      searchPlaceholder="Buscar por número o descripción..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      isEmpty={pedidosFiltrados.length === 0}
      emptyMessage="No se encontraron pedidos"
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
      sheetTitle={editingPedido ? 'Editar Pedido' : 'Nuevo Pedido'}
      sheetDescription={editingPedido ? 'Modifica los datos del pedido' : 'Completa los datos del nuevo pedido'}
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
              placeholder="Número de pedido"
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
              placeholder="Descripción del pedido"
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
        {pedidosFiltrados.map((pedido) => (
          <div
            key={pedido.id}
            className="rounded-xl p-4 transition-all hover:shadow-lg cursor-pointer"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              opacity: pedido.activo ? 1 : 0.6,
            }}
            onClick={() => handleEdit(pedido)}
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
                    {pedido.numero || `Pedido #${pedido.id}`}
                  </div>
                  <div className="text-xs" style={{ color: theme.textSecondary }}>
                    {formatFecha(pedido.fecha)}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleActivo(pedido);
                  }}
                  className="p-1.5 rounded-lg transition-colors text-xs font-medium"
                  style={{
                    backgroundColor: pedido.activo ? `${theme.primary}15` : `${theme.textSecondary}15`,
                    color: pedido.activo ? theme.primary : theme.textSecondary,
                  }}
                  title={pedido.activo ? 'Desactivar' : 'Activar'}
                >
                  {pedido.activo ? 'Activo' : 'Inactivo'}
                </button>
              </div>
            </div>

            {/* Descripción */}
            {pedido.descripcion && (
              <div className="mb-3">
                <p className="text-sm line-clamp-2" style={{ color: theme.textSecondary }}>
                  {pedido.descripcion}
                </p>
              </div>
            )}

            {/* Monto */}
            <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: theme.border }}>
              <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>
                Monto
              </span>
              <span className="text-sm font-semibold" style={{ color: theme.text }}>
                {formatMonto(pedido.monto)}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-3 pt-3 border-t" style={{ borderColor: theme.border }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(pedido);
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
                  handleDelete(pedido);
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

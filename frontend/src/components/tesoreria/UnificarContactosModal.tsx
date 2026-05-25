import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  GitMerge, Loader2, CheckCircle2, MapPin, Phone, Mail, Wallet,
  ChevronRight, SkipForward,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { ModernSelect } from '../ui/ModernSelect';
import { PrimaryButton } from '../ui/PrimaryButton';
import { useTheme } from '../../contexts/ThemeContext';
import { contactosApi } from '../../lib/api';
import {
  TIPO_CONTACTO_LABELS_SINGULAR as TIPO_LABELS,
  TIPO_CONTACTO_COLORS as TIPO_COLORS,
} from '../../lib/contactoIcons';
import type { TipoContacto } from '../../types';

// ============================================================
// Types
// ============================================================

interface ContactoDuplicado {
  id: number;
  nombre: string;
  apellido: string | null;
  tipo: TipoContacto;
  dni: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  alias_pago: string | null;
  subtipo: string | null;
  cantidad_gastos: number;
  total_gastado: string;
  cantidad_pagos_prog: number;
}

interface Grupo {
  score: number;
  contactos: ContactoDuplicado[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Callback que se dispara despues de cada merge exitoso, para que
   *  el padre refresque la lista principal de contactos. */
  onMerged?: () => void;
}

// ============================================================
// Componente
// ============================================================

export function UnificarContactosModal({ open, onClose, onMerged }: Props) {
  const { theme } = useTheme();

  const [loading, setLoading] = useState(false);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set()); // claves de grupos saltados en esta sesion
  // Por grupo: { keepId, tipoFinal }
  const [keepByGroup, setKeepByGroup] = useState<Record<string, number>>({});
  const [tipoByGroup, setTipoByGroup] = useState<Record<string, TipoContacto | ''>>({});
  // Overrides por grupo y campo: cuando hay conflicto (ej. dos teléfonos
  // distintos) el user elige cuál se queda. Default = el del ganador.
  // Forma: overridesByGroup[groupKey][field] = valor elegido.
  const [overridesByGroup, setOverridesByGroup] = useState<Record<string, Record<string, string>>>({});

  // Cartel de confirmacion
  const [confirmGroupKey, setConfirmGroupKey] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const groupKey = (g: Grupo) => g.contactos.map(c => c.id).sort().join('-');

  // ============ Fetch al abrir ============
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    contactosApi.duplicados(0.8)
      .then(res => {
        const data = res.data as Grupo[];
        setGrupos(data || []);
        // Default: el primero del grupo (que ya viene ordenado por mas
        // actividad desc) queda como ganador.
        const initialKeep: Record<string, number> = {};
        const initialTipo: Record<string, TipoContacto | ''> = {};
        (data || []).forEach(g => {
          const k = groupKey(g);
          initialKeep[k] = g.contactos[0].id;
          initialTipo[k] = '';
        });
        setKeepByGroup(initialKeep);
        setTipoByGroup(initialTipo);
        setOverridesByGroup({});
        setSkipped(new Set());
      })
      .catch(() => {
        toast.error('Error detectando duplicados');
        setGrupos([]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  // ============ Filtro de grupos visibles ============
  const visibles = useMemo(
    () => grupos.filter(g => !skipped.has(groupKey(g))),
    [grupos, skipped]
  );

  // ============ Handlers ============
  const handleSkip = (g: Grupo) => {
    setSkipped(prev => new Set(prev).add(groupKey(g)));
  };

  const handleAskConfirm = (g: Grupo) => {
    setConfirmGroupKey(groupKey(g));
  };

  const grupoEnConfirm = useMemo(
    () => visibles.find(g => groupKey(g) === confirmGroupKey) || null,
    [visibles, confirmGroupKey]
  );

  const handleConfirmMerge = async () => {
    if (!grupoEnConfirm) return;
    const key = groupKey(grupoEnConfirm);
    const keepId = keepByGroup[key];
    const mergeIds = grupoEnConfirm.contactos.filter(c => c.id !== keepId).map(c => c.id);
    const tipoFinal = tipoByGroup[key] || undefined;

    // Overrides solo de campos en conflicto donde el user eligio un valor
    // distinto al que el ganador YA tiene (sino backend hace lo mismo).
    const overrides: Record<string, string> = {};
    const groupOverrides = overridesByGroup[key] || {};
    const ganador = grupoEnConfirm.contactos.find(c => c.id === keepId);
    for (const [field, valor] of Object.entries(groupOverrides)) {
      const valGanador = ganador ? (ganador as unknown as Record<string, unknown>)[field] : '';
      if (valor !== valGanador) {
        overrides[field] = valor;
      }
    }

    setMerging(true);
    try {
      const res = await contactosApi.merge({
        keep_id: keepId,
        merge_ids: mergeIds,
        tipo_final: tipoFinal,
        overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      });
      const { gastos_reapuntados, pagos_prog_reapuntados, merged_count } = res.data as {
        gastos_reapuntados: number;
        pagos_prog_reapuntados: number;
        merged_count: number;
      };
      toast.success(
        `Se unificaron ${merged_count + 1} contactos. ` +
        `${gastos_reapuntados} gasto${gastos_reapuntados === 1 ? '' : 's'} y ` +
        `${pagos_prog_reapuntados} pago${pagos_prog_reapuntados === 1 ? '' : 's'} programado${pagos_prog_reapuntados === 1 ? '' : 's'} reapuntado${pagos_prog_reapuntados === 1 ? '' : 's'}.`
      );
      // Sacamos ese grupo del listado actual
      setGrupos(prev => prev.filter(g => groupKey(g) !== key));
      setConfirmGroupKey(null);
      onMerged?.();
    } catch {
      toast.error('Error al unificar contactos');
    } finally {
      setMerging(false);
    }
  };

  // ============ Helpers: detectar conflictos campo-por-campo ============

  // Campos que se intentan fusionar. Si en el grupo hay >= 2 valores distintos
  // no vacios para un mismo campo, es CONFLICTO y el user elige.
  // Si hay 1 solo valor, se auto-completa (queda automatico).
  const CONFLICT_FIELDS: { key: keyof ContactoDuplicado; label: string }[] = [
    { key: 'telefono', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'alias_pago', label: 'Alias de pago' },
    { key: 'dni', label: 'DNI' },
    { key: 'subtipo', label: 'Subtipo' },
  ];

  // Devuelve los campos del grupo que tienen mas de un valor distinto.
  // Para cada uno: las opciones unicas + el ID del contacto que aporta cada valor.
  const getConflictsForGroup = (g: Grupo) => {
    const out: { field: string; label: string; opciones: { valor: string; deContactoId: number }[] }[] = [];
    for (const f of CONFLICT_FIELDS) {
      const seen = new Map<string, number>(); // valor -> contactoId (primer aporte)
      for (const c of g.contactos) {
        const raw = (c as unknown as Record<string, unknown>)[f.key as string];
        const v = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim();
        if (v && !seen.has(v)) seen.set(v, c.id);
      }
      if (seen.size >= 2) {
        out.push({
          field: f.key as string,
          label: f.label,
          opciones: Array.from(seen.entries()).map(([valor, deContactoId]) => ({ valor, deContactoId })),
        });
      }
    }
    return out;
  };

  // Resuelve el valor "actual" para un campo: override del user, sino el del ganador,
  // sino el primero de los otros que lo tenga.
  const resolveCurrentValue = (g: Grupo, keepId: number, field: string): string => {
    const key = groupKey(g);
    const override = overridesByGroup[key]?.[field];
    if (override !== undefined) return override;
    const ganador = g.contactos.find(c => c.id === keepId);
    const ganadorVal = ganador ? (ganador as unknown as Record<string, unknown>)[field] : null;
    if (typeof ganadorVal === 'string' && ganadorVal.trim()) return ganadorVal;
    // Auto-merge: si no, el primer otro contacto que tenga valor
    for (const c of g.contactos) {
      if (c.id === keepId) continue;
      const v = (c as unknown as Record<string, unknown>)[field];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return '';
  };

  const setOverride = (g: Grupo, field: string, valor: string) => {
    const k = groupKey(g);
    setOverridesByGroup(prev => ({
      ...prev,
      [k]: { ...(prev[k] || {}), [field]: valor },
    }));
  };

  // ============ Preview del impacto (para el cartel) ============
  const previewImpacto = useMemo(() => {
    if (!grupoEnConfirm) return null;
    const key = groupKey(grupoEnConfirm);
    const keepId = keepByGroup[key];
    const merged = grupoEnConfirm.contactos.filter(c => c.id !== keepId);
    const ganador = grupoEnConfirm.contactos.find(c => c.id === keepId)!;
    const gastosMovidos = merged.reduce((acc, c) => acc + c.cantidad_gastos, 0);
    const totalMovido = merged.reduce((acc, c) => acc + parseFloat(c.total_gastado || '0'), 0);
    const pagosProgMovidos = merged.reduce((acc, c) => acc + c.cantidad_pagos_prog, 0);
    return { ganador, merged, gastosMovidos, totalMovido, pagosProgMovidos };
  }, [grupoEnConfirm, keepByGroup]);

  // ============ Render helpers ============
  const tipoOptions = (Object.keys(TIPO_LABELS) as TipoContacto[]).map(t => ({
    value: t,
    label: TIPO_LABELS[t],
    color: TIPO_COLORS[t],
  }));

  const renderContactoRow = (c: ContactoDuplicado, isKeep: boolean, onSelect: () => void) => {
    const total = parseFloat(c.total_gastado || '0');
    const tipoColor = TIPO_COLORS[c.tipo] || theme.primary;
    return (
      <div
        key={c.id}
        onClick={onSelect}
        className="rounded-xl p-3 cursor-pointer transition-all hover:scale-[1.005]"
        style={{
          backgroundColor: isKeep ? `${theme.primary}10` : theme.card,
          border: `2px solid ${isKeep ? theme.primary : theme.border}`,
        }}
      >
        <div className="flex items-start gap-3">
          {/* Radio */}
          <div
            className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
            style={{
              border: `2px solid ${isKeep ? theme.primary : theme.border}`,
              backgroundColor: isKeep ? theme.primary : 'transparent',
            }}
          >
            {isKeep && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>

          {/* Datos */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" style={{ color: theme.text }}>
                {c.nombre} {c.apellido || ''}
              </span>
              <span
                className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${tipoColor}25`, color: tipoColor }}
              >
                {TIPO_LABELS[c.tipo]}
              </span>
              {isKeep && (
                <span
                  className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                  style={{ backgroundColor: theme.primary, color: '#fff' }}
                >
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Mantener
                </span>
              )}
            </div>

            {/* Stats: gastos + pagos prog */}
            <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: theme.textSecondary }}>
              <span className="inline-flex items-center gap-1">
                <Wallet className="h-3 w-3" />
                {c.cantidad_gastos} gasto{c.cantidad_gastos === 1 ? '' : 's'}
                {total > 0 && ` · $${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
              </span>
              {c.cantidad_pagos_prog > 0 && (
                <span>· {c.cantidad_pagos_prog} pago{c.cantidad_pagos_prog === 1 ? '' : 's'} prog.</span>
              )}
            </div>

            {/* Datos de contacto disponibles */}
            <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: theme.textSecondary }}>
              {c.telefono && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-2.5 w-2.5" />
                  {c.telefono}
                </span>
              )}
              {c.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-2.5 w-2.5" />
                  {c.email}
                </span>
              )}
              {c.direccion && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-2.5 w-2.5" />
                  {c.direccion.substring(0, 30)}{c.direccion.length > 30 ? '…' : ''}
                </span>
              )}
              {c.alias_pago && (
                <span className="font-mono">{c.alias_pago}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============ Render principal ============
  return (
    <>
      <Modal open={open} onClose={onClose} size="3xl" title="Unificar contactos duplicados">
        <div className="space-y-4">
          {/* Info banner */}
          <div
            className="p-3 rounded-xl text-sm"
            style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30`, color: theme.text }}
          >
            Detectamos contactos con nombres parecidos (similitud ≥ 80%, ignorando tildes y mayúsculas).
            Por cada grupo, elegí cuál mantener; los demás se fusionan en ese. Si hay datos en conflicto
            (ej. dos teléfonos), abajo elegís con cuál te quedás. Los datos únicos (que solo uno tiene)
            pasan automáticamente al ganador. Los gastos y pagos programados se reapuntan.
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
            </div>
          ) : visibles.length === 0 ? (
            <div className="text-center py-8" style={{ color: theme.textSecondary }}>
              <CheckCircle2 className="h-12 w-12 mx-auto mb-2" style={{ color: '#10b981' }} />
              <p className="font-semibold text-base" style={{ color: theme.text }}>
                {grupos.length === 0 ? 'No encontramos duplicados' : 'Listo, todos los grupos resueltos'}
              </p>
              <p className="text-xs mt-1">
                {grupos.length === 0
                  ? 'Tus contactos parecen estar bien.'
                  : 'Podés cerrar el modal o reabrirlo si querés volver a chequear.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs uppercase font-bold" style={{ color: theme.textSecondary }}>
                {visibles.length} grupo{visibles.length === 1 ? '' : 's'} para revisar
              </p>
              {visibles.map(g => {
                const key = groupKey(g);
                const keepId = keepByGroup[key];
                const tipoFinal = tipoByGroup[key] || '';
                const scorePct = Math.round(g.score * 100);
                return (
                  <div
                    key={key}
                    className="rounded-xl p-4"
                    style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className="text-[10px] uppercase font-bold px-2 py-0.5 rounded inline-flex items-center gap-1"
                        style={{
                          backgroundColor: scorePct === 100 ? '#10b98125' : `${theme.primary}25`,
                          color: scorePct === 100 ? '#10b981' : theme.primary,
                        }}
                      >
                        <GitMerge className="h-3 w-3" />
                        {scorePct === 100 ? 'Coincidencia exacta' : `Similitud ${scorePct}%`}
                      </span>
                      <span className="text-xs" style={{ color: theme.textSecondary }}>
                        {g.contactos.length} contactos
                      </span>
                    </div>

                    <div className="space-y-2 mb-3">
                      {g.contactos.map(c =>
                        renderContactoRow(c, c.id === keepId, () =>
                          setKeepByGroup(prev => ({ ...prev, [key]: c.id }))
                        )
                      )}
                    </div>

                    {/* Resolver conflictos campo-por-campo. Solo se muestra
                        si al menos un campo tiene >= 2 valores distintos.
                        Los datos unicos (que solo uno tiene) NO aparecen
                        aca — se autocompletan en el merge. */}
                    {(() => {
                      const conflicts = getConflictsForGroup(g);
                      if (conflicts.length === 0) return null;
                      return (
                        <div
                          className="rounded-lg p-3 mb-3 space-y-2"
                          style={{ backgroundColor: theme.card, border: `1px dashed #f59e0b60` }}
                        >
                          <p className="text-[10px] uppercase font-bold flex items-center gap-1.5" style={{ color: '#f59e0b' }}>
                            <GitMerge className="h-3 w-3" />
                            Resolver conflictos · datos que difieren entre los contactos
                          </p>
                          <div className="space-y-2">
                            {conflicts.map(conf => {
                              const current = resolveCurrentValue(g, keepId, conf.field);
                              return (
                                <div key={conf.field} className="grid grid-cols-[110px_1fr] gap-2 items-start">
                                  <span className="text-xs font-semibold pt-1" style={{ color: theme.textSecondary }}>
                                    {conf.label}:
                                  </span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {conf.opciones.map(op => {
                                      const isSel = current === op.valor;
                                      const aporta = g.contactos.find(c => c.id === op.deContactoId);
                                      const aportaLabel = aporta ? `${aporta.nombre} ${aporta.apellido || ''}`.trim() : '';
                                      return (
                                        <button
                                          key={op.valor}
                                          type="button"
                                          onClick={() => setOverride(g, conf.field, op.valor)}
                                          className="px-2.5 py-1 rounded-md text-xs transition-all hover:scale-[1.02] active:scale-[0.98]"
                                          style={{
                                            backgroundColor: isSel ? `${theme.primary}20` : theme.backgroundSecondary,
                                            color: isSel ? theme.primary : theme.text,
                                            border: `1.5px solid ${isSel ? theme.primary : theme.border}`,
                                          }}
                                          title={`Aporta: ${aportaLabel}`}
                                        >
                                          {isSel && <CheckCircle2 className="h-3 w-3 inline mr-1" />}
                                          {op.valor}
                                          <span className="opacity-60 ml-1.5">· {aportaLabel}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Tipo final opcional */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs whitespace-nowrap" style={{ color: theme.textSecondary }}>
                        Tipo final:
                      </span>
                      <div className="flex-1 max-w-xs">
                        <ModernSelect
                          value={tipoFinal}
                          onChange={(v) => setTipoByGroup(prev => ({ ...prev, [key]: v as TipoContacto | '' }))}
                          options={[
                            { value: '', label: 'Mantener el del ganador' },
                            ...tipoOptions,
                          ]}
                          placeholder="Mantener el del ganador"
                        />
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleSkip(g)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                        style={{
                          backgroundColor: 'transparent',
                          color: theme.textSecondary,
                          border: `1px solid ${theme.border}`,
                        }}
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        Saltar (no son duplicados)
                      </button>
                      <PrimaryButton onClick={() => handleAskConfirm(g)} size="sm">
                        <GitMerge className="h-3.5 w-3.5" />
                        Unificar este grupo
                        <ChevronRight className="h-3.5 w-3.5" />
                      </PrimaryButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Cartel de confirmacion con preview del impacto */}
      <ConfirmModal
        isOpen={!!confirmGroupKey && !!previewImpacto}
        onClose={() => setConfirmGroupKey(null)}
        onConfirm={handleConfirmMerge}
        loading={merging}
        title="¿Confirmás unificar?"
        variant="warning"
        confirmText="Sí, unificar"
        cancelText="Cancelar"
        message={
          previewImpacto ? (
            <div className="space-y-2">
              <p>
                Vas a fusionar <b>{previewImpacto.merged.length + 1} contactos</b> en{' '}
                <b>{previewImpacto.ganador.nombre} {previewImpacto.ganador.apellido || ''}</b>.
              </p>
              <div
                className="rounded-lg p-3 text-sm"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
              >
                <p className="font-semibold mb-1" style={{ color: theme.text }}>Esto va a:</p>
                <ul className="space-y-0.5" style={{ color: theme.textSecondary }}>
                  <li>
                    Reapuntar <b>{previewImpacto.gastosMovidos}</b> gasto{previewImpacto.gastosMovidos === 1 ? '' : 's'}
                    {previewImpacto.totalMovido > 0 && (
                      <> (<b>${previewImpacto.totalMovido.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</b>)</>
                    )}
                  </li>
                  {previewImpacto.pagosProgMovidos > 0 && (
                    <li>Reapuntar <b>{previewImpacto.pagosProgMovidos}</b> pago{previewImpacto.pagosProgMovidos === 1 ? '' : 's'} programado{previewImpacto.pagosProgMovidos === 1 ? '' : 's'}</li>
                  )}
                  <li>Desactivar <b>{previewImpacto.merged.length}</b> contacto{previewImpacto.merged.length === 1 ? '' : 's'} (no se eliminan, quedan ocultos)</li>
                  <li>Completar campos vacíos del ganador con info de los duplicados (teléfono, email, dirección, etc.)</li>
                </ul>
              </div>
            </div>
          ) : ''
        }
      />
    </>
  );
}

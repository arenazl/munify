/**
 * PanelAsignacion — quién atiende cada cosa (canvas Configuracion.dc.html).
 *
 * UN nivel en los dos mundos (decisión del dueño 2026-08-13):
 *   categoría de reclamo → dependencia / categoría de trámite → dependencia.
 *
 * Lista PLANA con el listado ENTERO siempre a la vista (default "Todas": acá
 * no se esconde nada), y en cada fila el combo canónico del kit
 * (ModernSelect searchable) con el listado entero de secretarías. El botón
 * verde del header dispara la autoasignación con IA del mundo activo.
 */
import { useMemo, useState } from 'react';
import { Glifo } from '../../../components/abmv2/Glifo';
import { ModernSelect } from '../../../components/ui/ModernSelect';
import type { FilaAsignacion, ModoAsignacion } from '../data/datosRealesConfig';

export interface PanelAsignacionProps {
  modo: ModoAsignacion;
  onModo: (m: ModoAsignacion) => void;
  conteoReclamos: number | null;
  conteoTramites: number | null;
  filas: FilaAsignacion[];
  /** Listado entero de secretarías asignables (opciones de cada combo). */
  deps: { id: number; nombre: string; color: string | null }[];
  /** Asigna (depId) o quita (null) la dependencia de una fila. */
  onAsignar: (fila: FilaAsignacion, depId: number | null) => void;
  /** Mientras guarda, los combos quedan deshabilitados. */
  guardando: boolean;
  /** Primera carga de un mundo: skeleton ADENTRO de la tabla (el shell queda). */
  cargando?: boolean;
  labelIA: string;
  aplicandoIA: boolean;
  onIA: () => void;
  pie: string;
  resumen: string;
}

const TONOS = {
  rojo: { punto: 'var(--pl-red-700)' },
  verde: { punto: 'var(--pl-green)' },
} as const;

export default function PanelAsignacion({
  modo, onModo, conteoReclamos, conteoTramites, filas, deps,
  onAsignar, guardando, cargando = false, labelIA, aplicandoIA, onIA, pie, resumen,
}: PanelAsignacionProps) {
  const [busqueda, setBusqueda] = useState('');
  const [chip, setChip] = useState<'todas' | 'sin' | 'con'>('todas');

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (chip === 'sin' && f.depId) return false;
      if (chip === 'con' && !f.depId) return false;
      if (!q) return true;
      return f.nombre.toLowerCase().includes(q) || (f.depNombre ?? '').toLowerCase().includes(q);
    });
  }, [filas, busqueda, chip]);

  const sinAsignar = filas.filter((f) => !f.depId);
  const asignadas = filas.filter((f) => f.depId);

  const opciones = useMemo(
    () => [
      { value: '', label: 'Sin dependencia' },
      ...deps.map((d) => ({
        value: String(d.id),
        label: d.nombre,
        color: d.color || undefined,
        emphasized: true,
      })),
    ],
    [deps],
  );

  const chips: { id: 'todas' | 'sin' | 'con'; label: string; n: number; tono: 'rojo' | 'verde' | null }[] = [
    { id: 'todas', label: 'Todas', n: filas.length, tono: null },
    { id: 'sin', label: 'Sin asignar', n: sinAsignar.length, tono: 'rojo' },
    { id: 'con', label: 'Asignadas', n: asignadas.length, tono: 'verde' },
  ];

  return (
    <div className="entrar-panel" style={{ marginTop: '16px' }}>
      {/* --- Segmented Reclamos | Trámites + buscador + IA --- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', rowGap: '10px' }}>
        <div role="tablist" aria-label="Mundo a asignar" style={{ display: 'flex', gap: '2px', padding: '3px', background: 'var(--pl-surface-3)', borderRadius: '10px', flex: '0 0 auto' }}>
          {([
            { id: 'reclamos' as const, label: 'Reclamos', n: conteoReclamos },
            { id: 'tramites' as const, label: 'Trámites', n: conteoTramites },
          ]).map((t) => {
            const activo = modo === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => onModo(t.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px', height: '32px', padding: '0 14px',
                  borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: activo ? 'var(--pl-surface)' : 'transparent',
                  boxShadow: activo ? '0 1px 2px var(--pl-border-strong)' : 'none',
                  fontSize: '12.5px', fontWeight: 600,
                  color: activo ? 'var(--pl-text)' : 'var(--pl-text-muted)',
                }}
              >
                {t.label}
                <span className="av2-tnum" style={{ fontSize: '11.5px', color: 'var(--pl-text-faint)' }}>{t.n ?? '—'}</span>
              </button>
            );
          })}
        </div>

        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 220px', minWidth: 0, height: '34px', padding: '0 12px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '10px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--pl-text-faint)" strokeWidth="2" strokeLinecap="round" style={{ flex: '0 0 15px' }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar categoría o dependencia"
            aria-label="Buscar categoría o dependencia"
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: '12.5px', color: 'var(--pl-text)' }}
          />
        </span>

        <button
          type="button"
          onClick={onIA}
          disabled={aplicandoIA}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '34px', padding: '0 14px', borderRadius: '10px', border: 'none', background: 'var(--pl-green)', cursor: aplicandoIA ? 'wait' : 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto', opacity: aplicandoIA ? 0.7 : 1 }}
          onMouseEnter={(e) => { if (!aplicandoIA) e.currentTarget.style.background = 'var(--pl-green-600)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--pl-green)'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--pl-on-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 15px' }}>
            <path d="m12 3 1.7 4.6L18 9.5l-4.3 1.9L12 16l-1.7-4.6L6 9.5l4.3-1.9z" />
            <path d="m18.5 16.5.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
          </svg>
          <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--pl-on-accent)' }}>
            {aplicandoIA ? 'Asignando…' : labelIA}
          </span>
        </button>
      </div>

      {/* --- Chips de filtro (reales: filtran; default = Todas) --- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--pl-border)', flexWrap: 'wrap', rowGap: '8px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)', marginRight: '2px' }}>FILTRAR</span>
        {chips.map((c) => {
          const activo = chip === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setChip(c.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px', height: '30px', padding: '0 12px', borderRadius: '999px',
                border: `1px solid ${activo ? 'var(--pl-border-strong)' : 'var(--pl-border)'}`,
                background: activo ? 'var(--pl-surface)' : 'transparent', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: c.tono ? TONOS[c.tono].punto : 'var(--pl-text-faint)' }}></span>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: activo ? 'var(--pl-text)' : 'var(--pl-text-2)' }}>{c.label}</span>
              <span className="av2-tnum" style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--pl-text-faint)' }}>{cargando ? '—' : c.n}</span>
            </button>
          );
        })}
      </div>

      {/* --- Tabla plana: categoría | uso | combo de dependencia --- */}
      <div style={{ marginTop: '12px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '12px', overflowX: 'auto' }}>
        <div style={{ boxSizing: 'border-box', display: 'grid', minWidth: '540px', gridTemplateColumns: 'minmax(180px, 1.5fr) 90px minmax(210px, 1.35fr)', alignItems: 'center', gap: '14px', padding: '10px 16px', background: 'var(--pl-surface-2)', borderBottom: '1px solid var(--pl-border)', borderRadius: '12px 12px 0 0' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>CATEGORÍA</span>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)', textAlign: 'right' }}>{modo === 'reclamos' ? 'RECLAMOS' : 'TIPOS'}</span>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>QUIÉN LOS ATIENDE</span>
        </div>

        {cargando && [0, 1, 2, 3].map((i) => (
          <div key={i} className="av2-skeleton" style={{ height: '44px', margin: '10px 16px', borderRadius: '10px' }} aria-busy />
        ))}

        {!cargando && visibles.length === 0 && (
          <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: '12.5px', color: 'var(--pl-text-muted)' }}>
            Nada que mostrar con este filtro.
          </div>
        )}

        {!cargando && visibles.map((r) => (
          <div
            key={r.id}
            style={{ boxSizing: 'border-box', display: 'grid', minWidth: '540px', gridTemplateColumns: 'minmax(180px, 1.5fr) 90px minmax(210px, 1.35fr)', alignItems: 'center', gap: '14px', padding: '8px 16px', borderBottom: '1px solid var(--pl-border)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-surface-2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: '30px', height: '30px', borderRadius: '9px', background: `${r.color}15`, flex: '0 0 30px' }}>
                <Glifo glifo={r.glifo} size={16} color={r.color} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nombre}</span>
                {!r.depId && (
                  <span style={{ display: 'block', fontSize: '10.5px', color: 'var(--pl-red-700)', marginTop: '1px', whiteSpace: 'nowrap' }}>sin dependencia</span>
                )}
              </span>
            </span>
            <span style={{ textAlign: 'right', minWidth: 0 }}>
              <span className="av2-tnum" style={{ display: 'block', fontFamily: 'var(--pl-font-display)', fontSize: '13px', fontWeight: 700, color: r.uso === 0 ? 'var(--pl-text-faint)' : 'var(--pl-text)', whiteSpace: 'nowrap' }}>
                {r.uso === 0 && modo === 'reclamos' ? '—' : r.uso}
              </span>
              <span style={{ display: 'block', fontSize: '10.5px', color: 'var(--pl-text-faint)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                {r.uso === 0 && modo === 'reclamos' ? 'sin usar' : r.usoNota}
              </span>
            </span>
            <span style={{ minWidth: 0 }}>
              <ModernSelect
                variant="v2"
                searchable
                disabled={guardando}
                value={r.depId && !r.depMixta ? String(r.depId) : ''}
                onChange={(v) => onAsignar(r, v ? Number(v) : null)}
                options={opciones}
                placeholder={r.depMixta ? 'Varias oficinas' : 'Asignar…'}
              />
            </span>
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--pl-surface-2)', borderRadius: '0 0 12px 12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--pl-text-muted)', minWidth: 0 }}>{pie}</span>
          <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: 'var(--pl-text-faint)', whiteSpace: 'nowrap' }}>{resumen}</span>
        </div>
      </div>
    </div>
  );
}

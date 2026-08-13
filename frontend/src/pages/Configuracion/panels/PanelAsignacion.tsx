/**
 * PanelAsignacion — quién atiende cada cosa (canvas Configuracion.dc.html).
 *
 * Dos mundos en un segmented: Reclamos (categoría → dependencia) y Trámites
 * (categoría de trámite → dependencia, arrastrando sus tipos). Arriba las
 * huérfanas en un bloque rojo; abajo UN GRUPO POR DEPENDENCIA — el nodo de la
 * dependencia es SOLO LECTURA (acá no se editan dependencias), lo editable
 * son las filas de adentro.
 *
 * La celda de la derecha es un BOTÓN: asignada = outline con la dependencia
 * (click cambia/quita), huérfana = punteado verde "Asignar…". El botón verde
 * del header dispara la autoasignación con IA (endpoint existente, aplica el
 * mapa completo del mundo activo).
 */
import { useMemo, useState } from 'react';
import { Glifo } from '../../../components/abmv2/Glifo';
import type { FilaAsignacion, ModoAsignacion } from '../data/datosRealesConfig';

export interface PanelAsignacionProps {
  modo: ModoAsignacion;
  onModo: (m: ModoAsignacion) => void;
  conteoReclamos: number | null;
  conteoTramites: number | null;
  filas: FilaAsignacion[];
  /** Nodo readonly por dependencia: [muniDepId, nombre, color]. */
  depsNodo: { id: number; nombre: string; color: string | null }[];
  labelIA: string;
  aplicandoIA: boolean;
  onIA: () => void;
  /** Abre el picker para asignar / cambiar / quitar. */
  onElegir: (fila: FilaAsignacion) => void;
  pie: string;
  resumen: string;
}

const TONOS = {
  rojo: { punto: 'var(--pl-red-700)', col: 'var(--pl-red-700)', bg: 'color-mix(in srgb, var(--pl-red-700) 6%, var(--pl-surface))' },
  verde: { punto: 'var(--pl-green)', col: 'var(--pl-green-700)', bg: 'var(--pl-green-050)' },
} as const;

export default function PanelAsignacion({
  modo, onModo, conteoReclamos, conteoTramites, filas, depsNodo,
  labelIA, aplicandoIA, onIA, onElegir, pie, resumen,
}: PanelAsignacionProps) {
  const [busqueda, setBusqueda] = useState('');
  const [chip, setChip] = useState<'sin' | 'con' | 'todas'>('sin');

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

  /* Grupos: huérfanas en rojo arriba; después el nodo READONLY de cada
     dependencia con sus filas. Las deps sin filas visibles no se dibujan. */
  const grupos = useMemo(() => {
    const out: { id: string; titulo: string; detalle: string; tono: 'rojo' | 'verde'; depColor?: string | null; filas: FilaAsignacion[] }[] = [];
    const huerfanas = visibles.filter((f) => !f.depId);
    if (huerfanas.length) {
      out.push({
        id: 'sin-dep',
        titulo: 'SIN DEPENDENCIA',
        detalle: modo === 'reclamos'
          ? 'los reclamos que entren por acá no se asignan a nadie'
          : 'el turnero no puede reservar turnos para estos trámites',
        tono: 'rojo',
        filas: huerfanas,
      });
    }
    depsNodo.forEach((d) => {
      const propias = visibles.filter((f) => f.depId === d.id);
      if (!propias.length) return;
      out.push({
        id: `dep-${d.id}`,
        titulo: d.nombre.toUpperCase(),
        detalle: `${propias.length} categoría${propias.length === 1 ? '' : 's'} · el nodo es solo lectura`,
        tono: 'verde',
        depColor: d.color,
        filas: propias,
      });
    });
    return out;
  }, [visibles, depsNodo, modo]);

  const chips: { id: 'sin' | 'con' | 'todas'; label: string; n: number; tono: 'rojo' | 'verde' | null }[] = [
    { id: 'sin', label: 'Sin asignar', n: sinAsignar.length, tono: 'rojo' },
    { id: 'con', label: 'Asignadas', n: asignadas.length, tono: 'verde' },
    { id: 'todas', label: 'Todas', n: filas.length, tono: null },
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
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--pl-surface)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 15px' }}>
            <path d="m12 3 1.7 4.6L18 9.5l-4.3 1.9L12 16l-1.7-4.6L6 9.5l4.3-1.9z" />
            <path d="m18.5 16.5.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
          </svg>
          <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--pl-surface)' }}>
            {aplicandoIA ? 'Asignando…' : labelIA}
          </span>
        </button>
      </div>

      {/* --- Chips de filtro (reales: filtran) --- */}
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
              <span className="av2-tnum" style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--pl-text-faint)' }}>{c.n}</span>
            </button>
          );
        })}
      </div>

      {/* --- Tabla agrupada --- */}
      <div style={{ marginTop: '12px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '12px', overflowX: 'auto', overflowY: 'hidden' }}>
        <div style={{ boxSizing: 'border-box', display: 'grid', minWidth: '560px', gridTemplateColumns: 'minmax(200px, 1.5fr) 96px minmax(190px, 1.35fr)', alignItems: 'center', gap: '14px', padding: '10px 16px', background: 'var(--pl-surface-2)', borderBottom: '1px solid var(--pl-border)' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>CATEGORÍA</span>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)', textAlign: 'right' }}>{modo === 'reclamos' ? 'RECLAMOS' : 'TIPOS'}</span>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>QUIÉN LOS ATIENDE</span>
        </div>

        {grupos.length === 0 && (
          <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: '12.5px', color: 'var(--pl-text-muted)' }}>
            Nada que mostrar con este filtro.
          </div>
        )}

        {grupos.map((g) => (
          <div key={g.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: TONOS[g.tono].bg, borderTop: '1px solid var(--pl-border)', borderBottom: '1px solid var(--pl-border)' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: g.depColor ?? TONOS[g.tono].punto, flex: '0 0 7px' }}></span>
              <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', color: TONOS[g.tono].col }}>{g.titulo}</span>
              <span style={{ fontSize: '11.5px', color: 'var(--pl-text-faint)', minWidth: 0 }}>{g.detalle}</span>
            </div>

            {g.filas.map((r) => (
              <div
                key={r.id}
                style={{ boxSizing: 'border-box', display: 'grid', minWidth: '560px', gridTemplateColumns: 'minmax(200px, 1.5fr) 96px minmax(190px, 1.35fr)', alignItems: 'center', gap: '14px', padding: '10px 16px', borderBottom: '1px solid var(--pl-border)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-surface-2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: '30px', height: '30px', borderRadius: '9px', background: `${r.color}15`, flex: '0 0 30px' }}>
                    <Glifo glifo={r.glifo} size={16} color={r.color} />
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pl-text)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nombre}</span>
                </span>
                <span style={{ textAlign: 'right', minWidth: 0 }}>
                  <span className="av2-tnum" style={{ display: 'block', fontFamily: 'var(--pl-font-display)', fontSize: '13px', fontWeight: 700, color: r.uso === 0 ? 'var(--pl-text-faint)' : 'var(--pl-text)', whiteSpace: 'nowrap' }}>
                    {r.uso === 0 && modo === 'reclamos' ? '—' : r.uso}
                  </span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: 'var(--pl-text-faint)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                    {r.uso === 0 && modo === 'reclamos' ? 'sin usar' : r.usoNota}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  {r.depId ? (
                    <button
                      type="button"
                      onClick={() => onElegir(r)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, height: '34px', padding: '0 11px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '10px', cursor: 'pointer' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--pl-green-200)'; e.currentTarget.style.background = 'var(--pl-green-050)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--pl-border)'; e.currentTarget.style.background = 'var(--pl-surface)'; }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: r.depMixta ? 'var(--pl-amber)' : (r.depColor ?? 'var(--pl-green)'), flex: '0 0 6px' }}></span>
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: r.depMixta ? 'var(--pl-amber-strong)' : 'var(--pl-text)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.depNombre}
                      </span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--pl-text-muted)" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: 'auto', flex: '0 0 13px' }}>
                        <path d="m7 9 5 5 5-5" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onElegir(r)}
                      title="Elegir la dependencia que atiende esta categoría"
                      style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: 1, minWidth: 0, height: '34px', padding: '0 11px', background: 'var(--pl-surface)', border: '1px dashed var(--pl-green-200)', borderRadius: '10px', cursor: 'pointer' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-green-050)'; e.currentTarget.style.borderColor = 'var(--pl-green)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--pl-surface)'; e.currentTarget.style.borderColor = 'var(--pl-green-200)'; }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--pl-green-700)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 13px' }}>
                        <path d="m12 3 1.7 4.6L18 9.5l-4.3 1.9L12 16l-1.7-4.6L6 9.5l4.3-1.9z" />
                      </svg>
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--pl-green-700)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Asignar…
                      </span>
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--pl-surface-2)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--pl-text-muted)', minWidth: 0 }}>{pie}</span>
          <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: 'var(--pl-text-faint)', whiteSpace: 'nowrap' }}>{resumen}</span>
        </div>
      </div>
    </div>
  );
}
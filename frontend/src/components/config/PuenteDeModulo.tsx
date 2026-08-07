/**
 * PuenteDeModulo — la pantalla "puente" del canvas para los ajustes que VIVEN
 * en otro módulo (Vecinos, Inventario).
 *
 * No dibuja una tabla: dice qué se configura acá al lado (links a otros
 * ajustes de Configuración), por qué el módulo vive donde vive, y abre el
 * módulo real. Opcionalmente muestra una mini-lista SOLO LECTURA con un dato
 * real que invite a ir (lo que está bajo el mínimo, por ejemplo). Sin dato
 * real no se muestra nada: un bloque con números de muestra acá sería peor
 * que el hueco.
 */
import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ExternalLink } from 'lucide-react';

export interface LinkDeAjuste {
  label: string;
  nota: string;
  /** tab/sub de Configuración adonde salta. */
  grupoId: string;
  ajusteId: string;
}

export interface FilaSoloLectura {
  nombre: string;
  sub?: string;
  valor: string;
  /** Token o color de entidad para el valor. */
  valorColor?: string;
}

export interface PuenteDeModuloProps {
  configuraAca: LinkDeAjuste[];
  viveEn: {
    titulo: string;
    motivo: string;
    checklist: string[];
    botonLabel: string;
    ruta: string;
  };
  lista?: {
    titulo: string;
    filas: FilaSoloLectura[];
  };
  /** Navegación interna de Configuración (cambia tab/sub sin recargar). */
  onIrAlAjuste: (grupoId: string, ajusteId: string) => void;
  children?: ReactNode;
}

export function PuenteDeModulo({ configuraAca, viveEn, lista, onIrAlAjuste }: PuenteDeModuloProps) {
  const navigate = useNavigate();

  return (
    <div className="entrar-panel" style={{ marginTop: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
        {/* --- Se configura acá --- */}
        <div style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '12px', padding: '18px 20px', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>SE CONFIGURA ACÁ</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px' }}>
            {configuraAca.map((l) => (
              <button
                key={l.ajusteId}
                type="button"
                onClick={() => onIrAlAjuste(l.grupoId, l.ajusteId)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '9px', border: '1px solid transparent', background: 'transparent', cursor: 'pointer', textAlign: 'left', minWidth: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-surface-2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pl-text)' }}>{l.label}</span>
                  <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--pl-text-muted)', marginTop: '2px' }}>{l.nota}</span>
                </span>
                <ArrowRight size={14} color="var(--pl-text-faint)" style={{ flex: '0 0 14px' }} />
              </button>
            ))}
          </div>
        </div>

        {/* --- Vive en su módulo --- */}
        <div style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '12px', padding: '18px 20px', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>{viveEn.titulo.toUpperCase()}</span>
          <p style={{ margin: '10px 0 0', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--pl-text-2)', textWrap: 'pretty' }}>{viveEn.motivo}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '12px' }}>
            {viveEn.checklist.map((c) => (
              <span key={c} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--pl-text-2)' }}>
                <Check size={13} color="var(--pl-green-600)" style={{ flex: '0 0 13px' }} />
                {c}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate(viveEn.ruta)}
            className="av2-btn-primario"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', marginTop: '14px' }}
          >
            {viveEn.botonLabel}
            <ExternalLink size={14} />
          </button>
        </div>
      </div>

      {/* --- Mini-lista SOLO LECTURA (solo con datos reales) --- */}
      {lista && lista.filas.length > 0 && (
        <div style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '12px', padding: '16px 20px', marginTop: '12px', minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>{lista.titulo.toUpperCase()}</span>
            <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--pl-text-muted)', background: 'var(--pl-surface-3)', padding: '2px 7px', borderRadius: '5px' }}>SOLO LECTURA</span>
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: '8px' }}>
            {lista.filas.map((f) => (
              <span key={f.nombre} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: '1px solid var(--pl-border)', minWidth: 0 }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--pl-text)' }}>{f.nombre}</span>
                  {f.sub && <span style={{ display: 'block', fontSize: '11px', color: 'var(--pl-text-muted)' }}>{f.sub}</span>}
                </span>
                <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '13px', fontWeight: 700, color: f.valorColor ?? 'var(--pl-text)', fontFeatureSettings: "'tnum'" }}>{f.valor}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PuenteDeModulo;

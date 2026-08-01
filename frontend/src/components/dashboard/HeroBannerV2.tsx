/**
 * HeroBannerV2 — banner principal del Dashboard (rediseño v2, Claude Design).
 *
 * Con portada del muni: la foto va detrás del contenido, bien suave
 * (saturate(0.85)) y con los dos veils encima (--pl-hero-veil +
 * --pl-hero-fade) — la ciudad apenas se percibe bajo el acento, como la
 * referencia. El gradiente (--pl-hero-gradient) queda SOLO como fallback
 * cuando el muni no tiene portada. Eyebrow en caps, H1 display (solo el
 * nombre del muni, sin "Municipalidad de" — eso ya lo dice el eyebrow),
 * sub y botones (sólido "Conocé {marca}" + outline "Pulso del día"), con
 * el STRIP de stats integrado abajo (grid con separadores hairline).
 *
 * Polimórfico: estilos en styles/dashboard-v2.css sobre tokens --pl-*.
 * Inline SOLO valores runtime (opacity de la portada configurada por el muni).
 */
import { MapPin, Sparkles } from 'lucide-react';

export interface HeroStripKpi {
  etiqueta: string;
  valor: string | number;
  /** Pinta el número en ámbar (ej: "En riesgo de SLA" > 0). */
  amber?: boolean;
}

interface HeroBannerV2Props {
  /** Eyebrow en caps (ej: "MUNICIPALIDAD · VISTA CONSOLIDADA"). */
  eyebrow: string;
  titulo: string;
  sub?: string;
  /** Portada propia del muni; sin foto el hero usa el gradiente del acento. */
  fotoUrl?: string | null;
  /** Opacity configurada por el muni para su portada (tema_config). */
  fotoOpacity?: number;
  kpis: HeroStripKpi[];
  /** Botones del hero; null los oculta (roles sin modo presentación). */
  acciones?: {
    conoceLabel: string;
    onConoce: () => void;
    onPulso: () => void;
  } | null;
}

export function HeroBannerV2({ eyebrow, titulo, sub, fotoUrl, fotoOpacity, kpis, acciones }: HeroBannerV2Props) {
  return (
    <section className="dv2-hero" aria-label={titulo}>
      {fotoUrl && (
        <div className="dv2-hero-media" aria-hidden="true">
          <img
            src={fotoUrl}
            alt=""
            className="dv2-hero-img"
            style={fotoOpacity != null ? { opacity: fotoOpacity } : undefined}
          />
          <div className="dv2-hero-veil" />
          <div className="dv2-hero-fade" />
        </div>
      )}

      <div className="dv2-hero-top">
        <div className="dv2-hero-info">
          <div className="dv2-hero-eyebrow">
            <MapPin className="dv2-hero-eyebrow-icono" aria-hidden="true" />
            {eyebrow}
          </div>
          <h1 className="dv2-hero-titulo">{titulo}</h1>
          {sub && <p className="dv2-hero-sub">{sub}</p>}
        </div>

        {acciones && (
          <div className="dv2-hero-acciones">
            <button
              type="button"
              className="dv2-hero-btn"
              onClick={acciones.onConoce}
              title="Recorrido guiado del producto"
            >
              <Sparkles className="dv2-hero-btn-icono" aria-hidden="true" />
              {acciones.conoceLabel}
            </button>
            <button
              type="button"
              className="dv2-hero-btn dv2-hero-btn--outline"
              onClick={acciones.onPulso}
              title="Modo televisor — slides en pantalla completa"
            >
              <span className="dv2-pulse-dot" aria-hidden="true" />
              Pulso del día
            </button>
          </div>
        )}
      </div>

      <div className="dv2-hero-strip">
        {kpis.map((k) => (
          <div key={k.etiqueta} className="dv2-hero-kpi">
            <span className="dv2-hero-kpi-etiqueta">{k.etiqueta}</span>
            <span className={`dv2-hero-kpi-valor${k.amber ? ' dv2-hero-kpi-valor--amber' : ''}`}>
              {k.valor}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

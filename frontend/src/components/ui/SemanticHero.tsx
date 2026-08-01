/**
 * SemanticHero — "hero semántico" del rediseño v2 (Claude Design).
 *
 * Reemplaza los hints/banners estáticos de las pantallas por una FRASE con
 * información DINÁMICA de esa pantalla, coloreada por VEREDICTO:
 *   bueno → acento del theme · advertencia → ámbar · malo → rojo
 * Soporta varias frases (carrusel con puntos + flechas) y hasta 3 acciones
 * por frase (la referencia v2 del estándar ABM usa las 3: "Ver los que vencen
 * hoy" / "Asignar los sin cuadrilla" / "Exportar el período").
 *
 * ES EL ÚNICO HERO de la app: el estándar `SemanticAbmPage` usa ESTE
 * componente con la clase de contexto `av2-hero`, que en styles/abmv2.css
 * ([PAGE]) aplica la variante de layout de la referencia nueva (superficie
 * verde suave, borde de acento 4px, KPIs con hairline verde, acción primaria
 * sólida). No hay —ni debe haber— un segundo componente de hero.
 *
 * Polimórfico: estilos en styles/semantic-hero.css sobre tokens --pl-*
 * (derivados del theme activo por ThemeContext) — funciona en todos los
 * presets y marcas. Sin colores fijos, sin estilos inline.
 *
 * Uso:
 *   <SemanticHero
 *     etiqueta="RECLAMOS · HOY"
 *     frases={[{
 *       segmentos: [
 *         seg('Se resolvieron '), seg('12 reclamos', 'bueno'),
 *         seg(' esta semana, pero '), seg('3 vencen hoy', 'advertencia'), seg('.'),
 *       ],
 *       acciones: [{ label: 'Ver vencimientos', to: '/gestion/sla', primaria: true }],
 *     }]}
 *   />
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type HeroFrase, type HeroKpi, veredictoDominante } from '../../lib/semanticHero';

interface SemanticHeroProps {
  /** Etiqueta del módulo, en caps (ej: "RECLAMOS · HOY"). */
  etiqueta: string;
  /** Una o más frases; con 2+ aparece el carrusel. Vacío → no renderiza. */
  frases: HeroFrase[];
  /** Strip de KPIs opcional (estilo mockup): eyebrow + número display + sub.
   *  Regla del estándar: el hero va SIEMPRE primero en la página con sus KPIs
   *  adentro (orden: frase → KPIs → acciones); nada de filas de KPI sueltas. */
  kpis?: HeroKpi[];
  className?: string;
}

export function SemanticHero({ etiqueta, frases, kpis, className }: SemanticHeroProps) {
  const [idx, setIdx] = useState(0);

  const validas = frases.filter((f) => f.segmentos.length > 0);
  if (validas.length === 0) return null;

  const actual = validas[Math.min(idx, validas.length - 1)];
  const varias = validas.length > 1;
  const ir = (i: number) => setIdx((i + validas.length) % validas.length);

  return (
    <section className={`sh-card ${className || ''}`} aria-label={etiqueta}>
      <div className="sh-head">
        <span className="sh-etiqueta">{etiqueta}</span>
        {varias && (
          <div className="sh-controles">
            {validas.map((f, i) => {
              const v = veredictoDominante(f);
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Frase ${i + 1}`}
                  className={`sh-dot ${v ? `sh-dot--${v}` : ''} ${i === idx ? 'sh-dot--activo' : ''}`}
                  onClick={() => ir(i)}
                />
              );
            })}
            <button type="button" aria-label="Anterior" className="sh-nav" onClick={() => ir(idx - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label="Siguiente" className="sh-nav" onClick={() => ir(idx + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <p className="sh-frase">
        {actual.segmentos.map((s, i) =>
          s.veredicto ? (
            <span key={i} className={`sh-seg--${s.veredicto}`}>{s.texto}</span>
          ) : (
            <span key={i}>{s.texto}</span>
          ),
        )}
      </p>

      {kpis && kpis.length > 0 && (
        <div className="sh-kpis">
          {kpis.map((k, i) => (
            <div key={i} className="sh-kpi">
              <span className="sh-kpi-etiqueta">{k.etiqueta}</span>
              <span className={`sh-kpi-valor ${k.veredicto ? `sh-kpi-valor--${k.veredicto}` : ''}`}>
                {k.valor}
              </span>
              {k.sub && <span className="sh-kpi-sub">{k.sub}</span>}
            </div>
          ))}
        </div>
      )}

      {actual.acciones && actual.acciones.length > 0 && (
        <div className="sh-acciones">
          {actual.acciones.slice(0, 3).map((a, i) =>
            a.to ? (
              <Link key={i} to={a.to} className={`sh-accion ${a.primaria ? 'sh-accion--primaria' : ''}`}>
                {a.label}
              </Link>
            ) : (
              <button
                key={i}
                type="button"
                onClick={a.onClick}
                className={`sh-accion ${a.primaria ? 'sh-accion--primaria' : ''}`}
              >
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
    </section>
  );
}

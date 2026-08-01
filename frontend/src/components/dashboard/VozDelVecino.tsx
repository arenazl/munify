/**
 * VozDelVecino — sección del dashboard con las calificaciones de vecinos.
 * Referencia visual: design/handoff-v2/references/dashboard-{claro,oscuro}.dc.html
 * ("La voz del vecino": promedio + estrellas + distribución 5..1 + cards de
 * reseñas; la negativa con fondo rojo suave, chip "Requiere respuesta" y
 * acción "Reabrir" que navega al detalle del reclamo).
 *
 * COMPOSICIÓN (no es un widget monolítico): las dos piezas reusables son del
 * KIT y no saben nada de municipios —
 *   - `RatingSummary` (ui/RatingSummary.tsx): promedio + estrellas + distribución.
 *   - `CardCarousel`  (ui/CardCarousel.tsx): las reseñas, de a las que entren.
 * Acá vive SÓLO lo del dominio: el fetch, el criterio de reseña negativa, la
 * card de reseña y el copy.
 *
 * ALTURA: la manda el bloque de calificación. La grilla es de 4 columnas
 * (1 = calificación, 2-4 = reseñas) y la zona de reseñas no aporta alto: su
 * contenido va absoluto (`inset: 0`), así el alto de la fila es el del
 * resumen y el carrusel se recorta dentro. La sección nunca crece con la
 * cantidad de reseñas.
 *
 * POLIMÓRFICO: cero colores fijos — clases av2-voz-* (styles/abmv2.css,
 * sección [VOZ-VECINO]) sobre tokens --pl-*.
 *
 * Datos: recibe las estadísticas ya cargadas por el Dashboard (evita el
 * doble fetch de /estadisticas) y hace fetch propio de las últimas reseñas
 * (GET /calificaciones/ultimas). Sin calificaciones NO renderiza.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import { calificacionesApi } from '../../lib/api';
import { CardCarousel } from '../ui/CardCarousel';
import { RatingSummary } from '../ui/RatingSummary';

// Subconjunto estructural de la respuesta de GET /calificaciones/estadisticas
// (el Dashboard ya la tiene tipada completa; acá solo lo que se usa).
export interface VozDelVecinoStats {
  total_calificaciones: number;
  promedio_general: number;
  distribucion: Record<string, number>;
}

interface Resena {
  id: number;
  reclamo_id: number;
  puntuacion: number;
  comentario: string;
  autor: string;
  categoria: string;
  created_at: string | null;
}

const DIAS_PERIODO = 90;
/** Se ven las que entran (3 en escritorio) y el resto se navega: se piden
 *  todas las que el backend permite (tope duro del endpoint: 10). */
const MAX_RESENAS = 10;
// Umbral de reseña negativa: 1-2 estrellas requieren respuesta del muni.
const PUNTUACION_NEGATIVA = 2;
/** Escala de la calificación (5 estrellas). */
const MAX_ESTRELLAS = 5;
/** Ancho mínimo de una card de reseña: con la grilla de 4 columnas da 3 por
 *  vista en escritorio, 2 en pantalla media y 1 en angosta. */
const ANCHO_MIN_RESENA = 275;
/** Igual al gap de la grilla: así cada card cae exactamente en una columna. */
const GAP_RESENAS = 20;

/** "hace 2 días" a partir del isoformat del backend (UTC naive → forzar Z). */
function haceTexto(iso: string | null): string {
  if (!iso) return '';
  const conZona = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const ms = Date.now() - new Date(conZona).getTime();
  if (Number.isNaN(ms)) return '';
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return 'hace minutos';
  if (horas < 24) return `hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

/** Iniciales para el avatar: "Ramona E." → "RE". */
function iniciales(autor: string): string {
  return autor
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function Estrellas({ puntuacion, negativa, size }: { puntuacion: number; negativa?: boolean; size: number }) {
  return (
    <span className="av2-voz-stars">
      {[1, 2, 3, 4, 5].map((n) => {
        const activa = n <= puntuacion;
        const cls = activa
          ? negativa ? 'av2-voz-star--bad' : 'av2-voz-star--on'
          : 'av2-voz-star--off';
        return <Star key={n} size={size} fill="currentColor" strokeWidth={0} className={cls} />;
      })}
    </span>
  );
}

export function VozDelVecino({ stats }: { stats: VozDelVecinoStats | null }) {
  const navigate = useNavigate();
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [pctCerrados, setPctCerrados] = useState<number | null>(null);

  const hayDatos = !!stats && stats.total_calificaciones > 0;

  useEffect(() => {
    if (!hayDatos) return;
    calificacionesApi
      .getUltimas({ limit: MAX_RESENAS, dias: DIAS_PERIODO })
      .then((res) => {
        setResenas(res.data?.items || []);
        setPctCerrados(res.data?.porcentaje_cerrados_calificados ?? null);
      })
      .catch(() => {
        // Sin reseñas el widget igual muestra promedio + distribución.
      });
  }, [hayDatos]);

  // Guard: sin calificaciones la sección no existe.
  if (!hayDatos || !stats) return null;

  const total = stats.total_calificaciones;
  const distribucion = [5, 4, 3, 2, 1].map((nivel) => ({
    nivel,
    cantidad: stats.distribucion[String(nivel)] || 0,
  }));

  return (
    <section className="av2-voz">
      <div className="av2-voz-head">
        <Star size={17} className="av2-voz-head-ico" />
        <h3 className="av2-voz-title">La voz del vecino</h3>
        <span className="av2-voz-sub">Reclamos finalizados · últimos {DIAS_PERIODO} días</span>
        <button type="button" className="av2-voz-link" onClick={() => navigate('/gestion/reclamos')}>
          Ver todas
        </button>
      </div>

      <div className={`av2-voz-grid${resenas.length === 0 ? ' av2-voz-grid--solo' : ''}`}>
        {/* Columna 1: la calificación. Es la que MANDA la altura de la fila. */}
        <RatingSummary
          className="av2-voz-resumen"
          promedio={stats.promedio_general}
          total={total}
          maxNivel={MAX_ESTRELLAS}
          locale="es-AR"
          distribucion={distribucion}
          subtitulo={
            <>
              {total} {total === 1 ? 'calificación' : 'calificaciones'}
              {pctCerrados !== null && ` · ${pctCerrados}% de los cerrados`}
            </>
          }
        />

        {/* Columnas 2-4: las reseñas con comentario, en carrusel. La zona no
            aporta alto (el carrusel va absoluto): el alto es el del resumen. */}
        {resenas.length > 0 && (
          <div className="av2-voz-resenas">
            <CardCarousel
              className="av2-voz-carrusel"
              ariaLabel="Reseñas de vecinos"
              minCardWidth={ANCHO_MIN_RESENA}
              gap={GAP_RESENAS}
            >
              {resenas.map((r) => {
                const negativa = r.puntuacion <= PUNTUACION_NEGATIVA;
                return (
                  <article key={r.id} className={`av2-voz-card${negativa ? ' av2-voz-card--mala' : ''}`}>
                    <div className="av2-voz-card-head">
                      <Estrellas puntuacion={r.puntuacion} negativa={negativa} size={13} />
                      {negativa ? (
                        <span className="av2-voz-flag">Requiere respuesta</span>
                      ) : (
                        <span className="av2-voz-fecha">{haceTexto(r.created_at)}</span>
                      )}
                    </div>
                    <p className="av2-voz-texto">"{r.comentario}"</p>
                    <div className="av2-voz-card-foot">
                      <span className={`av2-voz-avatar${negativa ? ' av2-voz-avatar--mala' : ''}`}>
                        {iniciales(r.autor)}
                      </span>
                      <span className="av2-voz-autor">
                        {r.autor} · {r.categoria}
                      </span>
                      {negativa && (
                        <button
                          type="button"
                          className="av2-voz-reabrir"
                          onClick={() => navigate(`/gestion/reclamos/${r.reclamo_id}`)}
                        >
                          Reabrir
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </CardCarousel>
          </div>
        )}
      </div>
    </section>
  );
}

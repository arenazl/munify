/**
 * VozDelVecino — sección del dashboard con las calificaciones de vecinos.
 * Referencia visual: design/handoff-v2/references/dashboard-{claro,oscuro}.dc.html
 * ("La voz del vecino": promedio grande + estrellas + distribución 5..1 +
 * cards de reseñas; la negativa con fondo rojo suave, chip "Requiere
 * respuesta" y acción "Reabrir" que navega al detalle del reclamo).
 *
 * POLIMÓRFICO: cero colores fijos — clases av2-voz-* (styles/abmv2.css,
 * sección [VOZ-VECINO]) sobre tokens --pl-*. Estilos inline SOLO para
 * valores runtime (ancho de las barras de distribución).
 *
 * Datos: recibe las estadísticas ya cargadas por el Dashboard (evita el
 * doble fetch de /estadisticas) y hace fetch propio de las últimas reseñas
 * (GET /calificaciones/ultimas). Sin calificaciones NO renderiza.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import { calificacionesApi } from '../../lib/api';

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
const MAX_RESENAS = 3;
// Umbral de reseña negativa: 1-2 estrellas requieren respuesta del muni.
const PUNTUACION_NEGATIVA = 2;

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
  const promedio = stats.promedio_general;

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
        {/* Columna izquierda: promedio + distribución */}
        <div className="av2-voz-resumen">
          <div className="av2-voz-score-row">
            <span className="av2-voz-score">{promedio.toFixed(1).replace('.', ',')}</span>
            <Estrellas puntuacion={Math.round(promedio)} size={15} />
          </div>
          <span className="av2-voz-meta">
            {total} {total === 1 ? 'calificación' : 'calificaciones'}
            {pctCerrados !== null && ` · ${pctCerrados}% de los cerrados`}
          </span>
          <div className="av2-voz-dist">
            {[5, 4, 3, 2, 1].map((estrella) => {
              const cantidad = stats.distribucion[String(estrella)] || 0;
              const pct = Math.round((cantidad / total) * 100);
              return (
                <div key={estrella} className="av2-voz-dist-row">
                  <span className="av2-voz-dist-label">
                    {estrella}
                    <Star size={11} fill="currentColor" strokeWidth={0} />
                  </span>
                  <span className="av2-voz-track">
                    <span
                      className={`av2-voz-fill av2-voz-fill--s${estrella}`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="av2-voz-dist-n">{cantidad}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Columna derecha: últimas reseñas con comentario */}
        {resenas.length > 0 && (
          <div className="av2-voz-resenas">
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
          </div>
        )}
      </div>
    </section>
  );
}

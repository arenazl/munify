/**
 * LAS TARJETAS DEL FEED DEL VECINO — una sola definicion.
 *
 * Viven aca y no dentro de `DashboardVecino` porque las usan DOS pantallas: el
 * panel del vecino, que es donde se ven de verdad, y la vista previa del ABM
 * de Publicaciones, que le muestra al operador como le va a quedar antes de
 * publicar.
 *
 * Y tienen que ser LAS MISMAS, no dos versiones parecidas: una vista previa
 * dibujada aparte deja de coincidir con la realidad en el primer cambio, y
 * entonces miente — que es justo lo contrario de para lo que existe.
 */
import { Clock, Newspaper } from 'lucide-react';
import type { useTheme } from '../../contexts/ThemeContext';
import { estiloTipo, urgenciaDe, type NoticiaItem } from './novedades';

/** Chip chico sobre la foto: legible sobre cualquier imagen gracias al velo. */
function ChipNovedad({ texto, color, solido }: { texto: string; color: string; solido?: boolean }) {
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md backdrop-blur-sm"
      style={
        solido
          ? { backgroundColor: color, color: 'var(--pl-on-accent)' }
          : { backgroundColor: 'rgba(0,0,0,0.45)', color: '#fff', boxShadow: `inset 0 0 0 1px ${color}` }
      }
    >
      {texto}
    </span>
  );
}

/**
 * La novedad DESTACADA: la que el municipio fijó, a lo ancho y con la foto
 * grande. Antes todas las tarjetas pesaban lo mismo y el corte de agua de
 * mañana se leía igual que una noticia de hace diez días.
 */
export function NovedadDestacada({
  noticia,
  theme,
}: {
  noticia: NoticiaItem;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const tipo = estiloTipo(noticia.tipo, theme);
  const urgencia = urgenciaDe(noticia);

  return (
    <article
      className="relative rounded-2xl overflow-hidden group"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="relative h-52 md:h-64">
        {noticia.imagen ? (
          <img
            src={noticia.imagen}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${theme.primary}30, ${theme.primary}08)` }}
          >
            <Newspaper className="w-12 h-12" style={{ color: `${theme.primary}80` }} />
          </div>
        )}

        {/* Velo: garantiza contraste del texto sobre CUALQUIER foto. */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 45%, transparent 75%)' }}
        />

        <div className="absolute top-3 left-3 flex items-center gap-2">
          <ChipNovedad texto={tipo.label} color={tipo.color} solido />
          {noticia.fijado && <ChipNovedad texto="Destacado" color={tipo.color} />}
        </div>

        {urgencia && (
          <div className="absolute top-3 right-3">
            <ChipNovedad
              texto={urgencia.texto}
              color={urgencia.fuerte ? 'var(--pl-red)' : 'var(--pl-amber)'}
              solido={urgencia.fuerte}
            />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
          <h3 className="text-white font-bold text-lg md:text-xl leading-tight mb-1.5">
            {noticia.titulo}
          </h3>
          <p className="text-white/80 text-sm leading-snug line-clamp-2 max-w-2xl">
            {noticia.descripcion}
          </p>
          <div className="flex items-center gap-1.5 mt-2.5 text-white/60 text-xs">
            <Clock className="w-3.5 h-3.5" />
            {noticia.fecha}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Las demás novedades: foto chica a la izquierda y el texto al lado. Entra
 *  el triple de información en la misma altura que una tarjeta de antes. */
export function NovedadCompacta({
  noticia,
  theme,
}: {
  noticia: NoticiaItem;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const tipo = estiloTipo(noticia.tipo, theme);
  const urgencia = urgenciaDe(noticia);

  return (
    <article
      className="rounded-xl overflow-hidden flex gap-3 p-2.5 transition-colors"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: theme.backgroundSecondary }}>
        {noticia.imagen ? (
          <img src={noticia.imagen} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Newspaper className="w-6 h-6" style={{ color: `${theme.primary}70` }} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: tipo.color }}>
            {tipo.label}
          </span>
          {urgencia && (
            <span
              className="text-[10px] font-semibold"
              style={{ color: urgencia.fuerte ? 'var(--pl-red)' : theme.textSecondary }}
            >
              · {urgencia.texto}
            </span>
          )}
        </div>
        <h4 className="font-semibold text-sm leading-tight line-clamp-1" style={{ color: theme.text }}>
          {noticia.titulo}
        </h4>
        <p className="text-xs leading-snug line-clamp-2 mt-0.5" style={{ color: theme.textSecondary }}>
          {noticia.descripcion}
        </p>
        <div className="flex items-center gap-1 mt-1.5 text-[11px]" style={{ color: theme.textSecondary }}>
          <Clock className="w-3 h-3" />
          {noticia.fecha}
        </div>
      </div>
    </article>
  );
}

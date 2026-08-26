/**
 * AnaliticaReclamos — "Las cinco preguntas" del dominio reclamos: el título
 * de sección + la fila de 3 KpiSemantico + la fila de 2. Sale del monolito
 * `pages/Dashboard.tsx` :1114-1291, sin tocar markup, clases ni copy.
 *
 * Reemplazan a TODOS los graficos que habia: el donut por estado, el
 * ranking de top categorias, el de barrios, cobertura por zona y tiempos por
 * categoria. Un grafico obliga a mirar, comparar y sacar la conclusion uno
 * mismo; en una demo —y en la reunion de un intendente— eso no pasa nunca.
 * Cada tarjeta arranca por la pregunta y la contesta con un dato. El detalle
 * crudo sigue estando, a un clic.
 */
import { ClipboardList, Clock, FileCheck, MapPin, TrendingUp, Users } from 'lucide-react';
import { ChartSkeleton } from '../../../components/ui/Skeleton';
import { SectionTitleV2 } from '../../../components/dashboard/SectionTitleV2';
import { KpiSemantico, TagKpi } from '../../../components/ui/KpiSemantico';
import { metaResolucionDias, resolverUmbrales } from '../../../lib/veredictos';
import { fmtDias } from '../armadores';
import type { SeccionProps } from '../tipos';

export function AnaliticaReclamos({ datos }: SeccionProps) {
  const {
    stats, porCategoria, porZona, tiempoResolucion, cobertura, coberturaResumen,
    cargandoAnalytics,
  } = datos.reclamos;

  // ==================================================================
  // Los umbrales y la meta SIEMPRE salen de lib/veredictos (SSoT
  // configurable), nunca números sueltos acá.
  // ==================================================================
  const umbrales = resolverUmbrales();
  const metaDias = metaResolucionDias(umbrales);

  // Tiempo de resolución: las que MÁS tardan primero (el resto queda fuera del top 5)
  const tiempoOrdenado = [...tiempoResolucion].sort((a, b) => b.dias_promedio - a.dias_promedio);
  const categoriasSobreMeta = tiempoResolucion.filter((t) => t.dias_promedio > metaDias).length;

  const totalRec = stats?.total || 0;
  const pctDe = (n: number) => (totalRec > 0 ? Math.round((n / totalRec) * 100) : 0);

  /** Donde se concentran: el barrio que mas pesa. */
  const zonaTop = porZona[0] ?? null;
  const top5Zonas = porZona.slice(0, 5).reduce((acc, z) => acc + z.cantidad, 0);
  const seguidoras = porZona.slice(1, 3).map((z) => z.zona);

  /** De que se quejan: la categoria que mas pesa. */
  const catTop = porCategoria[0] ?? null;
  const catsSiguen = porCategoria.slice(1, 3);
  const sumaSiguen = catsSiguen.reduce((acc, c) => acc + c.cantidad, 0);

  /** Cuanto tardamos: la que se pasa de la meta y la mas rapida. */
  const masLenta = tiempoOrdenado[0] ?? null;
  const masRapida = tiempoOrdenado.length > 1 ? tiempoOrdenado[tiempoOrdenado.length - 1] : null;

  /** En que terminaron: lo que sigue sin tocarse. */
  const enRecibido = stats?.por_estado?.['recibido'] ?? 0;
  const finalizados = stats?.por_estado?.['finalizado'] ?? 0;
  const rechazados = stats?.por_estado?.['rechazado'] ?? 0;

  /** Llegamos a todos: las zonas que quedaron atras. */
  const zonasOrdenadas = [...cobertura].sort((a, b) => a.tasa_resolucion - b.tasa_resolucion);
  const peorZona = zonasOrdenadas[0] ?? null;
  const mejorZona = zonasOrdenadas.length > 1 ? zonasOrdenadas[zonasOrdenadas.length - 1] : null;
  const zonasAtras = coberturaResumen?.zonas_criticas ?? 0;

  return (
    <>
      {/* El título habla en MÓDULOS, no en abstracciones (dueño, 2026-08-25):
          estas cinco preguntas son de RECLAMOS —barrios, categorías, tiempos
          de resolución—, así que el rótulo lo dice. "Analítica" no le decía a
          nadie de qué módulo estaba hablando. */}
      <SectionTitleV2 icon={TrendingUp} label="Reclamos" />

      {cargandoAnalytics ? (
        <div className="kse-fila-3">
          <ChartSkeleton height={200} />
          <ChartSkeleton height={200} />
          <ChartSkeleton height={200} />
        </div>
      ) : (
      <>
      <div className="kse-fila-3">
        <KpiSemantico
          pregunta="¿Dónde hay más reclamos?"
          icono={MapPin}
          tono="bueno"
          valor={zonaTop ? zonaTop.zona : '—'}
          unidad={zonaTop ? `${zonaTop.cantidad} ${zonaTop.cantidad === 1 ? 'reclamo' : 'reclamos'}` : 'sin zonas cargadas'}
          detalle={
            zonaTop ? (
              <>
                De {porZona.length} {porZona.length === 1 ? 'barrio' : 'barrios'},{' '}
                <strong>uno solo</strong> explica el {pctDe(zonaTop.cantidad)}% de todo.
                {seguidoras.length > 0 && (
                  <>{' '}
                    {seguidoras.map((z, k) => (
                      <span key={z}>
                        {k > 0 && ' y '}
                        <TagKpi>{z}</TagKpi>
                      </span>
                    ))}{' '}
                    {seguidoras.length === 1 ? 'lo sigue' : 'lo siguen'} de lejos.
                  </>
                )}
              </>
            ) : (
              <>Todavía no hay reclamos con zona cargada.</>
            )
          }
          pie={zonaTop ? `Top 5 = ${top5Zonas} de ${totalRec}` : undefined}
          accion={{ label: `Ver ${porZona.length > 0 ? `los ${porZona.length} barrios` : 'el mapa'}`, to: '/gestion/mapa' }}
        />

        <KpiSemantico
          pregunta="¿Qué es lo que más preocupa?"
          icono={ClipboardList}
          tono="bueno"
          valor={catTop ? `${pctDe(catTop.cantidad)}%` : '—'}
          unidad={catTop ? `es ${catTop.categoria.toLowerCase()}` : 'sin categorías'}
          detalle={
            catTop ? (
              <>
                <strong>{Math.round(pctDe(catTop.cantidad) / 10)} de cada 10 reclamos</strong>{' '}
                son de{' '}
                <TagKpi to={`/gestion/reclamos?filtrar_categoria=${encodeURIComponent(catTop.categoria)}`}>
                  {catTop.categoria}
                </TagKpi>.
                {catsSiguen.length > 0 && (
                  <>{' '}
                    {catsSiguen.map((c, k) => (
                      <span key={c.categoria}>
                        {k > 0 && ' y '}
                        <TagKpi to={`/gestion/reclamos?filtrar_categoria=${encodeURIComponent(c.categoria)}`}>
                          {c.categoria}
                        </TagKpi>
                      </span>
                    ))}{' '}
                    suman otros {sumaSiguen}{catsSiguen.length > 1 ? ' entre las dos' : ''}.
                  </>
                )}
              </>
            ) : (
              <>Todavía no hay reclamos categorizados.</>
            )
          }
          pie={catTop ? `${catTop.cantidad} de ${totalRec} reclamos` : undefined}
          accion={{ label: `Ver las ${porCategoria.length} categorías`, to: '/gestion/reclamos' }}
        />

        <KpiSemantico
          pregunta="¿En cuánto resolvemos?"
          icono={Clock}
          tono={categoriasSobreMeta > 0 ? 'malo' : 'bueno'}
          valor={tiempoResolucion.length > 0 ? `${categoriasSobreMeta} de ${tiempoResolucion.length}` : '—'}
          unidad={tiempoResolucion.length > 0
            ? `${tiempoResolucion.length === 1 ? 'categoría' : 'categorías'} fuera de meta`
            : 'sin cierres todavía'}
          detalle={
            tiempoResolucion.length === 0 ? (
              <>Todavía no se cerró nada: sin cierres no hay tiempo que medir.</>
            ) : categoriasSobreMeta === 0 ? (
              <>Todo cierra dentro de la meta de {fmtDias(metaDias)} días. <strong>Ninguna se pasa.</strong></>
            ) : masLenta ? (
              <>
                Dentro de la meta de {fmtDias(metaDias)} días{' '}
                salvo{' '}
                <TagKpi to={`/gestion/reclamos?filtrar_categoria=${encodeURIComponent(masLenta.categoria)}`}>
                  {masLenta.categoria}
                </TagKpi>, que <strong className="kse-mal">tarda {fmtDias(masLenta.dias_promedio)}</strong>
                {categoriasSobreMeta === 1 ? ' y es la única fuera' : ` — y hay ${categoriasSobreMeta} fuera`}.
              </>
            ) : null
          }
          pie={masRapida ? `Más rápida: ${masRapida.categoria}, ${fmtDias(masRapida.dias_promedio)} d` : undefined}
          accion={{ label: 'Ver los tiempos', to: '/gestion/sla' }}
        />
      </div>

      <div className="kse-fila-2">
        <KpiSemantico
          pregunta="¿En qué terminaron?"
          icono={FileCheck}
          tono="info"
          valor={String(enRecibido)}
          unidad="siguen en recibido"
          detalle={
            totalRec === 0 ? (
              <>Todavía no entró ningún reclamo.</>
            ) : (
              <>
                De {totalRec} en total, <strong>{enRecibido} nunca se {enRecibido === 1 ? 'tocó' : 'tocaron'}</strong>
                {finalizados > 0 && (
                  <> — {enRecibido > finalizados ? 'más' : 'menos'} que los {finalizados} que se finalizaron</>
                )}.
              </>
            )
          }
          pie={`Finalizados ${finalizados} · rechazados ${rechazados}`}
          accion={{ label: 'Ver los pendientes', to: '/gestion/reclamos?estado=recibido' }}
        />

        <KpiSemantico
          pregunta="¿Llegamos a todos?"
          icono={Users}
          tono={zonasAtras > 0 ? 'advertencia' : 'bueno'}
          valor={cobertura.length === 0 ? '—' : `${zonasAtras} ${zonasAtras === 1 ? 'zona' : 'zonas'}`}
          unidad={cobertura.length === 0 ? 'sin zonas medidas' : 'muy por debajo del resto'}
          detalle={
            cobertura.length === 0 ? (
              <>Todavía no hay zonas con reclamos suficientes para comparar.</>
            ) : zonasAtras === 0 && mejorZona && peorZona ? (
              <>
                Ninguna zona quedó atrás: de <strong>{peorZona.tasa_resolucion}%</strong> en{' '}
                <TagKpi>
                  {peorZona.zona_nombre}
                </TagKpi> a {mejorZona.tasa_resolucion}% en{' '}
                <TagKpi>
                  {mejorZona.zona_nombre}
                </TagKpi>.
              </>
            ) : peorZona ? (
              <>
                <TagKpi>
                  {peorZona.zona_nombre}
                </TagKpi> cierra <strong className="kse-mal">{peorZona.tasa_resolucion}%</strong>
                {mejorZona && (
                  <>, contra el {mejorZona.tasa_resolucion}% de{' '}
                    <TagKpi>
                      {mejorZona.zona_nombre}
                    </TagKpi></>
                )}.
                {zonasAtras > 1 && <> {zonasAtras} zonas quedaron atrás.</>}
              </>
            ) : null
          }
          pie={coberturaResumen ? `Resolución global: ${coberturaResumen.tasa_resolucion_global}%` : undefined}
          accion={{ label: `Ver las ${cobertura.length} zonas`, to: '/gestion/mapa' }}
        />
      </div>
      </>
      )}
    </>
  );
}

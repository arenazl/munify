/**
 * MapaArtefactosProto — PROTOTIPO TEMPORAL para elegir el reemplazo de los
 * paneles de abajo del mapa (el donut y el sparkline sin eje).
 *
 * Tres layouts candidatos detrás de un switch, para mirarlos EN la página con
 * el resto alrededor:
 *   1 · Tres preguntas  — el espejo del tablero (prosa + veredicto).
 *   2 · Protagonista    — un artefacto rico (bloques, tamaño = magnitud) + dos cards.
 *   3 · Rotador         — una sola card ancha que rota las respuestas de la lente.
 *
 * TODOS LOS NÚMEROS SON DATOS DE MUESTRA hardcodeados (rotulados en pantalla):
 * acá se decide el LAYOUT. Cuando el dueño elija, la variante ganadora se
 * cablea a los datos reales por lente y este archivo se BORRA.
 * Regla del dueño: simetría siempre — las grillas estiran parejo, sin aire.
 */
import { useEffect, useState } from 'react';
import '../../styles/mapa-artefactos-proto.css';

const FRASES_ROTADOR = [
  {
    preg: 'Recorrido de los focos',
    num: '2 esquinas, 7 reclamos',
    det: (
      <>1 de cada 10 de los que estás viendo cae en <strong>Estrada 81</strong> o{' '}
      <strong>Garay 2733</strong>. El foco más viejo lleva <strong>57 días</strong> abierto.</>
    ),
    chips: [
      { tono: 'grave', label: '2 focos activos' },
      { tono: 'warn', label: 'Agua y cloacas domina' },
      { tono: 'ok', label: 'el resto, disperso' },
    ],
  },
  {
    preg: 'Lo atrasado',
    num: '25 vencidos',
    det: (
      <>El más viejo espera hace <strong>57 días</strong>; 3 de ellos en{' '}
      <strong>Libertad</strong>. Esta semana vencieron 4 más.</>
    ),
    chips: [
      { tono: 'grave', label: '12 con más de 30 días' },
      { tono: 'warn', label: 'Zoonosis, la más cargada' },
    ],
  },
  {
    preg: 'Qué resolvimos',
    num: '20 cerrados',
    det: (
      <>En los últimos 90 días, con un promedio de <strong>6 días</strong> por
      reclamo. La mitad, confirmados por el vecino.</>
    ),
    chips: [
      { tono: 'ok', label: 'ritmo sostenido' },
      { tono: 'ok', label: 'vecinos conformes' },
    ],
  },
] as const;

type Variante = 1 | 2 | 3;

export default function MapaArtefactosProto() {
  const [variante, setVariante] = useState<Variante>(1);
  const [frase, setFrase] = useState(0);
  const [pausado, setPausado] = useState(false);

  // El rotador avanza solo cada 4 s; tocar un punto lo frena en ese.
  useEffect(() => {
    if (variante !== 3 || pausado) return;
    const t = setInterval(() => setFrase((f) => (f + 1) % FRASES_ROTADOR.length), 4000);
    return () => clearInterval(t);
  }, [variante, pausado]);

  const f = FRASES_ROTADOR[frase];

  return (
    <div className="map-proto">
      <div className="map-proto-head">
        <span className="map-proto-tag">Prueba de layout · datos de muestra</span>
        <div className="map-proto-seg" role="tablist" aria-label="Variante de artefactos">
          {([1, 2, 3] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={variante === v}
              className={variante === v ? 'act' : ''}
              onClick={() => setVariante(v)}
            >
              {v === 1 ? '1 · Preguntas' : v === 2 ? '2 · Protagonista' : '3 · Rotador'}
            </button>
          ))}
        </div>
      </div>

      {variante === 1 && (
        <div className="fila f3">
          <div className="tj">
            <span className="tj-preg">¿Dónde más se repite?</span>
            <p className="tj-num">Estrada 81</p>
            <p className="tj-det">
              <strong>4 reclamos</strong> en un radio de 80 m — Animales sueltos, en
              Libertad. Le sigue <strong>Garay 2733</strong> con 3, de Agua y cloacas.
            </p>
            <div className="chips tj-pie"><span className="chip grave">foco activo</span></div>
          </div>
          <div className="tj">
            <span className="tj-preg">¿Qué se repite?</span>
            <p className="tj-num">Agua y cloacas</p>
            <p className="tj-det">
              La categoría más presente en los focos: <strong>3 de cada 7</strong>{' '}
              reclamos de esquinas repetidas son suyos.
            </p>
            <div className="chips tj-pie"><span className="chip warn">mirar la red</span></div>
          </div>
          <div className="tj">
            <span className="tj-preg">¿Desde cuándo?</span>
            <p className="tj-num">57 <small>días</small></p>
            <p className="tj-det">
              El foco más viejo sigue abierto desde hace <strong>57 días</strong>; 3 de
              sus reclamos son de Libertad.
            </p>
            <div className="chips tj-pie"><span className="chip grave">se está arrastrando</span></div>
          </div>
        </div>
      )}

      {variante === 2 && (
        <div className="fila f2">
          <div className="tj">
            <span className="tj-preg">Toda la demora, agrupada por atraso · tamaño = reclamos</span>
            <div className="bloques">
              <div className="bloque g">
                <span className="bt">Más de 30 días abiertos</span>
                <div><span className="bv">12</span><br /><span className="bs">el más viejo: 57 días</span></div>
              </div>
              <div className="bloque m">
                <span className="bt">8–30 días</span>
                <span className="bv">9</span>
              </div>
              <div className="bloque s">
                <span className="bt">Esta semana</span>
                <span className="bv">4</span>
              </div>
            </div>
            <p className="tj-det" style={{ marginTop: 8 }}>
              <strong>25 vencidos</strong> en total · el detalle por zona, tocando cada bloque
            </p>
          </div>
          <div className="fila" style={{ gridTemplateColumns: '1fr', gridTemplateRows: '1fr 1fr' }}>
            <div className="tj">
              <span className="tj-preg">¿Dónde duele?</span>
              <p className="tj-num">Libertad</p>
              <p className="tj-det">Concentra <strong>3 de los más viejos</strong>.</p>
            </div>
            <div className="tj">
              <span className="tj-preg">¿De quién es la mora?</span>
              <p className="tj-num">Zoonosis</p>
              <p className="tj-det">La dependencia con más vencidos del recorte.</p>
              <div className="chips tj-pie"><span className="chip warn">hablar con el área</span></div>
            </div>
          </div>
        </div>
      )}

      {variante === 3 && (
        <div className="tj rot">
          <span className="tj-preg">{f.preg} · rota solo cada 4 s</span>
          <p className="tj-num">{f.num}</p>
          <p className="tj-det">{f.det}</p>
          <div className="chips">
            {f.chips.map((c) => (
              <span key={c.label} className={`chip ${c.tono}`}>{c.label}</span>
            ))}
          </div>
          <div className="puntos">
            {FRASES_ROTADOR.map((x, i) => (
              <button
                key={x.preg}
                aria-label={`Ver ${x.preg}`}
                className={i === frase ? 'act' : ''}
                onClick={() => { setFrase(i); setPausado(true); }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

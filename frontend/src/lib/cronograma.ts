/**
 * Cómo se lee un cronograma, en castellano.
 *
 * OJO — esto es un ESPEJO del backend (`cronograma_texto` en
 * `api/noticias.py`), y existe por un solo motivo: la VISTA PREVIA del ABM
 * necesita mostrar la frase mientras el operador todavía está eligiendo los
 * días, o sea antes de que exista la publicación que el backend podría
 * traducir.
 *
 * En todo lo demás manda el backend: las tarjetas del vecino leen
 * `cronograma_texto` tal como viene, nunca esto. Si acá y allá dijeran cosas
 * distintas, el operador vería en la vista previa algo que no es lo que se
 * publica — por eso las dos listas tienen que decir lo mismo, y por eso este
 * comentario apunta al archivo que manda.
 */

/** 0 = lunes. En plural, que es como se lee la frase: "todos los sábados". */
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];

export function cronogramaTexto(recurrencia: string, dias: number[]): string | null {
  if (!recurrencia) return null;
  if (recurrencia === 'semanal') {
    const nombres = dias
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DIAS[d])
      .filter(Boolean);
    if (nombres.length === 1) return `Todos los ${nombres[0]}`;
    if (nombres.length > 1) {
      return `Todos los ${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
    }
    return 'Todas las semanas';
  }
  if (recurrencia === 'quincenal') return 'Cada quince días';
  if (recurrencia === 'mensual') return 'Una vez por mes';
  return null;
}

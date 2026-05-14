/**
 * Sistema de abreviaturas para labels largos.
 *
 * Equivalente funcional a un pipe de Angular: funcion pura aplicada en el
 * render para acortar textos cuando no entran en un control compacto
 * (ej. trigger de ModernSelect, chips, badges).
 *
 * 100% agnostico de cliente. El diccionario contiene palabras frecuentes
 * en admin publica / empresa en castellano rioplatense. Para extender
 * con terminos especificos de un proyecto, importar
 * `abreviarTextoConDict(s, maxChars, dictExtra)`.
 */

const DICT_DEFAULT: Record<string, string> = {
  // Estructura organica
  'secretaría': 'Sec.',
  'secretaria': 'Sec.',
  'subsecretaría': 'Subsec.',
  'subsecretaria': 'Subsec.',
  'dirección': 'Dir.',
  'direccion': 'Dir.',
  'subdirección': 'Subdir.',
  'subdireccion': 'Subdir.',
  'departamento': 'Dpto.',
  'coordinación': 'Coord.',
  'coordinacion': 'Coord.',
  'administración': 'Admin.',
  'administracion': 'Admin.',
  'municipalidad': 'Muni.',
  'ministerio': 'Min.',
  'gerencia': 'Ger.',
  'subgerencia': 'Subger.',
  'presidencia': 'Pres.',
  'vicepresidencia': 'Vicepres.',
  'tesorería': 'Tes.',
  'tesoreria': 'Tes.',
  'contaduría': 'Cont.',
  'contaduria': 'Cont.',
  // Conectores
  'de': 'de',
  'del': 'del',
  'la': 'la',
  'las': 'las',
  'los': 'los',
  'y': 'y',
  // Tipos sociedad
  'sociedad anónima': 'S.A.',
  'sociedad anonima': 'S.A.',
  'sociedad de responsabilidad limitada': 'SRL',
  's.r.l.': 'SRL',
};

/**
 * Aplica el diccionario de abreviaturas SIN truncar.
 * Preserva la capitalizacion original del primer caracter de cada match.
 */
export function abreviarPalabras(
  texto: string,
  dictExtra?: Record<string, string>,
): string {
  if (!texto) return texto;
  const dict = dictExtra ? { ...DICT_DEFAULT, ...normalizarClavesLower(dictExtra) } : DICT_DEFAULT;

  // Orden por longitud descendente para que matchee primero "sociedad anonima"
  // antes que "sociedad". Tambien evita reemplazos parciales.
  const claves = Object.keys(dict).sort((a, b) => b.length - a.length);

  let resultado = texto;
  for (const clave of claves) {
    // Match con boundaries de palabra, case-insensitive
    const re = new RegExp(`\\b${escaparRegex(clave)}\\b`, 'gi');
    resultado = resultado.replace(re, (match) => {
      const reemplazo = dict[clave];
      // Preservar capitalizacion del primer caracter del match original
      if (match.length > 0 && match[0] === match[0].toUpperCase()) {
        return reemplazo.charAt(0).toUpperCase() + reemplazo.slice(1);
      }
      return reemplazo;
    });
  }

  // Colapsar espacios multiples
  return resultado.replace(/\s+/g, ' ').trim();
}

/**
 * Abrevia el texto y, si aun excede `maxChars`, trunca con "…" al final.
 * Si maxChars no se pasa, solo aplica el diccionario.
 */
export function abreviarTexto(
  texto: string,
  maxChars?: number,
  dictExtra?: Record<string, string>,
): string {
  if (!texto) return texto;
  const abreviado = abreviarPalabras(texto, dictExtra);
  if (maxChars == null || abreviado.length <= maxChars) return abreviado;
  return abreviado.slice(0, Math.max(1, maxChars - 1)).trimEnd() + '…';
}

/**
 * Alias semantico cuando el llamador pasa diccionario extra explicito.
 */
export const abreviarTextoConDict = abreviarTexto;

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizarClavesLower(dict: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k in dict) out[k.toLowerCase()] = dict[k];
  return out;
}

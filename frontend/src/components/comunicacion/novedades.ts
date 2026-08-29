/**
 * El VOCABULARIO del feed del vecino: el tipo de una novedad y las funciones
 * que deciden que dice cada tarjeta.
 *
 * Estan separadas de las tarjetas porque un archivo que exporta componentes Y
 * funciones rompe el fast refresh de Vite. Las dos pantallas que dibujan
 * novedades —el panel del vecino y la vista previa del ABM— leen de aca.
 */
import type { useTheme } from '../../contexts/ThemeContext';

export interface NoticiaItem {
  id: number;
  titulo: string;
  descripcion: string;
  imagen: string | null;
  fecha: string;
  categoria?: string;
  /** aviso | noticia | alerta: cambia el peso visual, no la tabla. */
  tipo: string;
  /** Lo que el municipio quiere arriba de todo. */
  fijado: boolean;
  /** 'YYYY-MM-DD' o null. Con esto la tarjeta dice cuánto le queda. */
  fechaHasta: string | null;
  fechaDesde: string | null;
  /** "Todos los martes y viernes". Lo escribe el backend. */
  cronograma: string | null;
}

/** 'YYYY-MM-DD' de hoy en hora LOCAL (nunca toISOString: es UTC y de noche
 *  adelanta un día, y un aviso vigente hasta hoy se leería vencido). */
export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const diasEntre = (desde: string, hasta: string) =>
  Math.round((new Date(`${hasta}T00:00:00`).getTime() - new Date(`${desde}T00:00:00`).getTime()) / 86400000);

/**
 * Lo que le queda al aviso, en criollo. Es el dato que al vecino le sirve
 * ("me queda hoy") y que ninguna tarjeta le estaba diciendo. Devuelve null
 * cuando no hay nada que avisar: una noticia sin vencimiento no urge.
 */
export function urgenciaDe(n: NoticiaItem): { texto: string; fuerte: boolean } | null {
  const hoy = hoyISO();
  if (n.fechaDesde && n.fechaDesde > hoy) {
    const d = diasEntre(hoy, n.fechaDesde);
    return { texto: d === 1 ? 'Arranca mañana' : `Arranca en ${d} días`, fuerte: false };
  }
  // Lo que se repite no vence: al vecino le sirve saber CUANDO vuelve a pasar,
  // no cuantos dias le quedan a un aviso que va a seguir estando.
  if (n.cronograma) return { texto: n.cronograma, fuerte: false };
  if (!n.fechaHasta) return null;
  const d = diasEntre(hoy, n.fechaHasta);
  if (d < 0) return null;
  if (d === 0) return { texto: 'Último día', fuerte: true };
  if (d === 1) return { texto: 'Hasta mañana', fuerte: true };
  if (d <= 7) return { texto: `Quedan ${d} días`, fuerte: false };
  return null;
}

/** Peso visual del aviso. El color sale de tokens del tema, nunca de un hex
 *  suelto: la misma tarjeta tiene que funcionar en los 12 fondos. */
export function estiloTipo(tipo: string, theme: ReturnType<typeof useTheme>['theme']) {
  if (tipo === 'alerta') return { label: 'Alerta', color: 'var(--pl-red)' };
  if (tipo === 'noticia') return { label: 'Noticia', color: theme.primary };
  return { label: 'Aviso', color: 'var(--pl-amber)' };
}

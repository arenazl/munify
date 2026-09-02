/**
 * MigasProvider — calcula la miga de pan de DOS tramos una sola vez y la
 * publica para toda la app (contrato y hook en `contexts/migas.ts`).
 *
 * Resolución del ÁMBITO (primer tramo, nunca vacío):
 *  1. usuario con dependencia asignada → su dependencia;
 *  2. super admin (admin sin municipio_id) → el municipio elegido en el
 *     MunicipioSwitcher; en modo global, "Todos los municipios";
 *  3. resto (admin/supervisor/vecino del muni) → el municipio actual, con
 *     "Municipalidad" como último recurso mientras el muni carga.
 *
 * Consumidores: `TopbarV2` (lo dibuja y elige el control del ámbito según
 * `tipoAmbito`) y `PageHeader` (oculta el eyebrow que repite el último tramo).
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { MigasContexto, type Migas, type TipoAmbito } from './migas';
import { resolverRuta } from '../components/shell/rutas';
import type { ShellNavItem } from '../components/shell/SidebarV2';

export interface MigasProviderProps {
  /** Items de navegación YA filtrados por rol/flags (los mismos del sidebar). */
  items: ShellNavItem[];
  /**
   * ¿Hay una topbar dibujando la miga? false en mobile (ahí el shell v2 no se
   * monta). Se propaga al contexto para que nadie esconda información por un
   * eco que el usuario no está viendo. Default true.
   */
  visible?: boolean;
  children: ReactNode;
}

export function MigasProvider({ items, visible = true, children }: MigasProviderProps) {
  const location = useLocation();
  const { user, municipioActual } = useAuth();

  const dependencia = user?.dependencia?.nombre;
  const esSuperAdmin = user?.rol === 'admin' && !user?.municipio_id;
  const municipio = municipioActual?.nombre;

  const valor = useMemo<Migas>(() => {
    const { pagina, modulo } = resolverRuta(location.pathname, items);

    let ambito: string;
    let tipoAmbito: TipoAmbito;
    if (dependencia) {
      ambito = dependencia;
      tipoAmbito = 'dependencia';
    } else if (esSuperAdmin) {
      ambito = municipio ?? 'Todos los municipios';
      tipoAmbito = 'global';
    } else {
      ambito = municipio ?? 'Municipalidad';
      tipoAmbito = 'municipio';
    }

    return { ambito, tipoAmbito, pagina, modulo, tramos: [ambito, pagina], visible };
  }, [location.pathname, items, dependencia, esSuperAdmin, municipio, visible]);

  // La PESTAÑA del navegador dice dónde estás: "Flota · Municipalidad de
  // Merlo". Con varias pestañas abiertas (QA y prod, dos municipios) el
  // título genérico de la marca las hacía indistinguibles (dueño, 2026-09-02).
  // La pantalla va primero porque las pestañas truncan por la derecha: lo que
  // distingue una pestaña de otra tiene que sobrevivir al recorte.
  // Manda la miga mientras el shell está montado; en las pantallas públicas
  // (login, acceso) sigue decidiendo DynamicManifest, como siempre.
  useEffect(() => {
    const titulo = [valor.pagina, valor.ambito].filter(Boolean).join(' · ');
    if (titulo) document.title = titulo;
  }, [valor.pagina, valor.ambito]);

  return <MigasContexto.Provider value={valor}>{children}</MigasContexto.Provider>;
}

export default MigasProvider;

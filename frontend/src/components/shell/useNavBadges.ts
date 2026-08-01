/**
 * useNavBadges — contadores del sidebar v2 para roles de gestión
 * (admin / supervisor general, sin dependencia).
 *
 * Paridad con la referencia del diseñador (dashboard-*.dc.html): pills
 * chicas de acento suave junto a Reclamos / Órdenes / Trámites / SLA.
 *
 * Diseño:
 *  - UNA sola carga por sesión (cache en memoria de módulo, clave
 *    user+municipio: si el super admin cambia de muni, se refresca).
 *  - Endpoints EXISTENTES y baratos, en paralelo y tolerantes a falla
 *    (Promise.allSettled): el badge cuyo endpoint falle simplemente se
 *    omite (campo undefined → no se renderiza), sin romper el resto.
 *      reclamos → GET /dashboard/stats            (total)
 *      tramites → GET /dashboard/tramites-stats   (total)
 *      sla      → GET /sla/resumen                (en_riesgo)
 *      ordenes  → GET /ordenes-trabajo?vigentes   (length, cap 200)
 *  - Para rol vecino NO aplica: el sidebar sigue usando useVecinoBadges.
 */
import { useEffect, useState } from 'react';
import { dashboardApi, ordenesTrabajoApi, slaApi } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

export interface NavBadges {
  reclamos?: number;
  tramites?: number;
  sla?: number;
  ordenes?: number;
}

const VACIO: NavBadges = {};

// ---- Cache en memoria de módulo (una carga por sesión/muni) ----
let cacheClave: string | null = null;
let cacheBadges: NavBadges | null = null;
let cargaClave: string | null = null;
let cargaEnCurso: Promise<NavBadges> | null = null;

/** Acepta solo números finitos >= 0 (defensa ante shapes inesperados). */
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

async function cargarBadges(): Promise<NavBadges> {
  const [stats, tramites, sla, ordenes] = await Promise.allSettled([
    dashboardApi.getStats(),
    dashboardApi.getTramitesStats(),
    slaApi.getResumen(),
    // Solo OTs vigentes (excluye completadas/canceladas). El endpoint no
    // expone un count: se cuenta el listado con su cap de 200 — de sobra
    // para un badge que corta en "99+".
    ordenesTrabajoApi.list({ vigentes: true, limit: 200 }),
  ]);

  const badges: NavBadges = {};
  if (stats.status === 'fulfilled') {
    badges.reclamos = num(stats.value.data?.total);
  }
  if (tramites.status === 'fulfilled') {
    badges.tramites = num(tramites.value.data?.total);
  }
  if (sla.status === 'fulfilled') {
    badges.sla = num(sla.value.data?.en_riesgo);
  }
  if (ordenes.status === 'fulfilled' && Array.isArray(ordenes.value.data)) {
    badges.ordenes = ordenes.value.data.length;
  }
  return badges;
}

/** Devuelve el cache si sirve; dedupe de cargas concurrentes por clave. */
function obtenerBadges(clave: string): Promise<NavBadges> {
  if (cacheClave === clave && cacheBadges) return Promise.resolve(cacheBadges);
  if (cargaEnCurso && cargaClave === clave) return cargaEnCurso;
  cargaClave = clave;
  cargaEnCurso = cargarBadges()
    .then((badges) => {
      cacheClave = clave;
      cacheBadges = badges;
      return badges;
    })
    .finally(() => {
      cargaEnCurso = null;
      cargaClave = null;
    });
  return cargaEnCurso;
}

export function useNavBadges(): NavBadges {
  const { user, municipioActual } = useAuth();

  // Solo gestores generales: admin o supervisor SIN dependencia (los de
  // dependencia tienen otro set de hrefs y no llevan estos badges).
  const esGestor = !!user && (user.rol === 'admin' || user.rol === 'supervisor') && !user.dependencia;
  const clave = esGestor && user
    ? `${user.id}|${municipioActual?.id ?? user.municipio_id ?? ''}`
    : null;

  const [badges, setBadges] = useState<NavBadges>(() =>
    clave && cacheClave === clave && cacheBadges ? cacheBadges : VACIO,
  );

  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    // Cache hit incluido: obtenerBadges resuelve via promesa, así el
    // setState queda en un callback y no sincrónico en el cuerpo del efecto.
    obtenerBadges(clave).then((b) => {
      if (vivo) setBadges(b);
    });
    return () => {
      vivo = false;
    };
  }, [clave]);

  // Sin clave (no gestor) el estado interno no importa: gate a VACIO.
  return clave ? badges : VACIO;
}

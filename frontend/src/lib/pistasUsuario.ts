/**
 * Persistencia POR USUARIO de las pistas del kit abmv2.
 *
 * Enchufa `preferencias.ui.pistas_cerradas` del usuario logueado en el
 * adaptador de `components/abmv2/pistas.ts`: una pista cerrada en un
 * dispositivo queda cerrada en todos (dueño, 2026-09-03). El backend guarda
 * el JSON en `PATCH /auth/me/preferencias`; el kit sigue sin saber nada de
 * usuarios ni de endpoints.
 */
import api from './api';
import { configurarPersistenciaPistas } from '../components/abmv2/pistas';
import type { User } from '../types';

interface PreferenciasUi {
  pistas_cerradas?: string[];
}

function pistasDe(user: User | null): string[] {
  const ui = (user?.preferencias?.ui ?? undefined) as PreferenciasUi | undefined;
  return Array.isArray(ui?.pistas_cerradas) ? ui.pistas_cerradas : [];
}

/** Refleja la lista en el `user` guardado, así un reload no reabre la
 *  pista antes de que llegue el próximo /me. */
function guardarEnStorage(pistas_cerradas: string[]): void {
  try {
    const crudo = localStorage.getItem('user');
    if (!crudo) return;
    const u = JSON.parse(crudo) as User;
    const prefs = (u.preferencias ?? {}) as Record<string, unknown>;
    const ui = (prefs.ui ?? {}) as Record<string, unknown>;
    u.preferencias = { ...prefs, ui: { ...ui, pistas_cerradas } };
    localStorage.setItem('user', JSON.stringify(u));
  } catch {
    /* sin storage: no pasa nada, el backend ya lo tiene */
  }
}

export function sincronizarPistasUsuario(user: User | null): void {
  if (!user) {
    configurarPersistenciaPistas(null);
    return;
  }
  const cerradas = new Set(pistasDe(user));
  configurarPersistenciaPistas({
    estaCerrada: (key) => cerradas.has(key),
    cerrar: (key) => {
      if (cerradas.has(key)) return;
      cerradas.add(key);
      const pistas_cerradas = Array.from(cerradas);
      guardarEnStorage(pistas_cerradas);
      void api
        .patch('/auth/me/preferencias', { ui: { pistas_cerradas } })
        .catch(() => {
          /* sin red: queda en el storage del kit y se reintenta al cerrar otra */
        });
    },
  });
}

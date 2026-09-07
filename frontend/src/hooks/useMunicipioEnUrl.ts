import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Deja el municipio A LA VISTA en la URL: `/gestion/mapa?municipio=la-falda`.
 *
 * Por qué: el municipio vive en la sesión, así que todas las demos comparten
 * exactamente la misma URL. Mirando una captura —o teniendo cuatro pestañas
 * abiertas con cuatro demos distintas— no hay forma de saber cuál es cuál
 * (dueño, 2026-09-07, sobre la demo de La Falda). Con el código en la barra se
 * sabe de un vistazo, y una captura queda autoexplicativa.
 *
 * Qué NO hace, a propósito: no cambia de municipio. El parámetro es un ESPEJO
 * de la sesión, no un comando. Quien elige el tenant sigue siendo el usuario
 * logueado (`AuthContext`, por localStorage y por su `municipio_id`); acá sólo
 * se escribe lo que ya está resuelto. Editar el parámetro a mano en la barra no
 * mueve nada: al primer render se vuelve a escribir el de la sesión.
 *
 * `replace` para no ensuciar el historial: si cada pantalla agregara una
 * entrada, el botón "atrás" del navegador quedaría inservible.
 */
export function useMunicipioEnUrl() {
  const { municipioActual } = useAuth();
  const [params, setParams] = useSearchParams();

  const codigo = municipioActual?.codigo;
  const enLaUrl = params.get('municipio');

  useEffect(() => {
    // Sin municipio resuelto todavía (o ya está el correcto), no se toca nada.
    // Esta guarda es la que evita el bucle: `params` cambia de identidad en
    // cada render, así que el efecto vuelve a correr, pero no vuelve a escribir.
    if (!codigo || enLaUrl === codigo) return;
    const proximos = new URLSearchParams(params);
    proximos.set('municipio', codigo);
    setParams(proximos, { replace: true });
  }, [codigo, enLaUrl, params, setParams]);
}

/**
 * Dashboard — ORQUESTADOR.
 *
 * Antes esto era un monolito de 1.314 líneas con todos los fetches de
 * reclamos/trámites entrelazados y todos los bloques cableados en el JSX. Un
 * muni que no tiene esos módulos (San Pedro Norte: sólo dashboard, tesorería
 * y sueldos) veía un tablero 100% ajeno y disparaba diez requests para nada.
 *
 * Ahora: módulos → secciones visibles (registry) → hooks por dominio → grilla.
 *  - La condición de cada bloque vive UNA vez, en `registry.tsx`.
 *  - Los datos vienen de un hook por DOMINIO (`datos/`), con `enabled`: los
 *    hooks se llaman SIEMPRE (cero riesgo de React #310, que ya pasó acá) y
 *    con el módulo apagado no disparan ni un request.
 *  - El hero (banner + frases + filtro de dependencia) y los modales quedan
 *    en el orquestador porque son de la PANTALLA, no de un dominio.
 *
 * GATE DE PÁGINA: `modulos.resuelto && dependenciasLoaded`, JAMÁS un dato de
 * un dominio. El monolito hacía `if (!stats) return null` y eso dejaba a un
 * muni sin reclamos con la pantalla en blanco.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PORTADA_FALLBACK } from '../../config/themePresets';
import { dependenciasApi, municipiosApi } from '../../lib/api';
import { useAuth, type Municipio } from '../../contexts/AuthContext';
import { AdaptiveFilter, type AdaptiveFilterGroup } from '../../components/ui/AdaptiveFilter';
import { SemanticHero } from '../../components/ui/SemanticHero';
import DashboardLive from '../../components/DashboardLive';
import PresentacionLive from '../../components/PresentacionLive';
import { HeroBannerV2, type HeroStripKpi } from '../../components/dashboard/HeroBannerV2';
import { PullToRefresh } from '../../components/ui/PullToRefresh';
import { BRAND } from '../../brands';
import { useModulosActivos } from './datos/useModulosActivos';
import { useDatosReclamos } from './datos/useDatosReclamos';
import { useDatosTramites } from './datos/useDatosTramites';
import { dominiosDeSecciones, seccionesVisibles } from './registry';
import { construirFrasesHero, contarAbiertos } from './armadores';
import type { DashboardCtx, DatosDashboard } from './tipos';

export default function Dashboard() {
  const { municipioActual, municipios, user } = useAuth();

  // Estado del modo "Live" — fullscreen TV mode con auto-rotate de slides
  const [liveMode, setLiveMode] = useState(false);
  const [presentOpen, setPresentOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Abrir el dashboard "En Vivo" al llegar con ?live=1 (desde el menú "Más" del
  // admin en mobile, que no puede montar DashboardLive porque necesita los datos
  // del dashboard). Consumimos el param para no reabrirlo al navegar.
  useEffect(() => {
    if (searchParams.get('live') === '1') {
      setLiveMode(true);
      searchParams.delete('live');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Pull-to-refresh: refreshKey fuerza re-fetch cuando el usuario tira hacia abajo
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(async () => {
    setRefreshKey(k => k + 1);
    await new Promise(r => setTimeout(r, 800));
  }, []);

  // ====================================================================
  // Filtro por dependencia — el dashboard arranca con vista consolidada
  // ("Todas las dependencias"). El admin puede filtrar y la selección se
  // persiste en localStorage por municipio.
  // ====================================================================
  type DependenciaItem = { id: number; nombre: string; color?: string; icono?: string };
  const [dependencias, setDependencias] = useState<DependenciaItem[]>([]);
  const [selectedDependenciaId, setSelectedDependenciaId] = useState<number | null>(null);
  const [dependenciasLoaded, setDependenciasLoaded] = useState(false);

  const lsKey = useMemo(
    () => (municipioActual?.id ? `dashboard_dep_${municipioActual.id}` : null),
    [municipioActual?.id],
  );

  // Cargar dependencias activas del municipio y resolver selección inicial
  useEffect(() => {
    let cancel = false;
    const loadDeps = async () => {
      try {
        const res = await dependenciasApi.getMunicipio({ activo: true });
        if (cancel) return;
        const items: DependenciaItem[] = (res.data || []).map((d: { id: number; nombre: string; color?: string; icono?: string }) => ({
          id: d.id,
          nombre: d.nombre,
          color: d.color,
          icono: d.icono,
        }));
        setDependencias(items);

        // Resolver selección: localStorage > Todas (null)
        // Por defecto el dashboard arranca con vista consolidada de TODAS las
        // dependencias. El admin puede filtrar y la selección se persiste.
        let nextId: number | null = null;
        if (lsKey) {
          const stored = localStorage.getItem(lsKey);
          if (stored) {
            const parsed = parseInt(stored, 10);
            if (items.some(i => i.id === parsed)) nextId = parsed;
          }
        }
        setSelectedDependenciaId(nextId);
      } catch (err) {
        console.error('Error cargando dependencias del municipio:', err);
      } finally {
        if (!cancel) setDependenciasLoaded(true);
      }
    };
    loadDeps();
    return () => { cancel = true; };
  }, [lsKey]);

  // Persistir selección
  const handleDependenciaChange = useCallback((value: string) => {
    const id = value ? parseInt(value, 10) : null;
    setSelectedDependenciaId(id);
    if (lsKey) {
      if (id) localStorage.setItem(lsKey, String(id));
      else localStorage.removeItem(lsKey);
    }
  }, [lsKey]);

  // ====================================================================
  // Muni del tablero. Para el SUPER ADMIN `municipioActual` queda null en
  // toda la sesión (el switcher solo persiste el id en storage y
  // loadMunicipios hace early-return), y el hero caía SIEMPRE al gradiente
  // aunque el muni tuviera portada. Resolvemos el detalle real: contexto >
  // lista del contexto > fetch por el id guardado. Escucha `municipio-changed`
  // para seguir los cambios del switcher sin recargar.
  // ====================================================================
  const [muniResuelto, setMuniResuelto] = useState<Municipio | null>(null);
  useEffect(() => {
    let cancel = false;
    const resolver = () => {
      if (municipioActual) {
        setMuniResuelto(null);
        return;
      }
      const stored = localStorage.getItem('municipio_actual_id');
      const id = stored ? parseInt(stored, 10) : NaN;
      if (!Number.isFinite(id)) {
        setMuniResuelto(null);
        return;
      }
      const enLista = municipios.find((m) => m.id === id);
      if (enLista) {
        setMuniResuelto(enLista);
        return;
      }
      municipiosApi.getOne(id)
        .then((res) => { if (!cancel) setMuniResuelto(res.data as Municipio); })
        .catch(() => { /* sin detalle el hero cae al gradiente (fallback) */ });
    };
    resolver();
    window.addEventListener('municipio-changed', resolver);
    return () => {
      cancel = true;
      window.removeEventListener('municipio-changed', resolver);
    };
  }, [municipioActual, municipios]);
  const muniTablero = municipioActual ?? muniResuelto;

  // ====================================================================
  // Módulos del muni → qué secciones existen → qué dominios se montan.
  // ====================================================================
  const modulos = useModulosActivos(municipioActual?.id);
  const esActivo = modulos.esActivo;
  const visibles = useMemo(() => seccionesVisibles(esActivo), [esActivo]);
  const dominios = useMemo(() => {
    const set = dominiosDeSecciones(visibles);
    // El hero también habla de reclamos y trámites (strip + frases), así que
    // sus dominios se montan aunque ninguna sección los pida.
    if (esActivo('reclamos')) set.add('reclamos');
    if (esActivo('tramites')) set.add('tramites');
    return set;
  }, [visibles, esActivo]);

  const reclamosOn = dominios.has('reclamos');
  const tramitesOn = dominios.has('tramites');

  // Hasta que no sabemos módulos Y dependencia no se fetchea nada.
  const listo = modulos.resuelto && dependenciasLoaded;
  const depId = selectedDependenciaId ?? undefined;

  const datosReclamos = useDatosReclamos({
    enabled: listo && reclamosOn,
    depId,
    municipioId: municipioActual?.id,
    refreshKey,
  });
  const datosTramites = useDatosTramites({
    enabled: listo && tramitesOn,
    depId,
    refreshKey,
  });

  // Opciones del selector de dependencia. Deben declararse ANTES de cualquier
  // early return — si no, el primer render (loading=true) salta estos hooks
  // y el segundo (loading=false) los ejecuta → React #310 (more hooks).
  const showDepFilter = user?.rol === 'admin' || user?.rol === 'supervisor';
  // Un solo grupo: dependencias. El AdaptiveFilter decide solo si las muestra
  // como píldoras o colapsa a combo según el ancho disponible.
  const gruposFiltro = useMemo<AdaptiveFilterGroup[]>(() => [{
    id: 'dependencia',
    placeholder: 'Todas las dependencias',
    options: dependencias.map(d => ({ value: String(d.id), label: d.nombre })),
    value: selectedDependenciaId ? String(selectedDependenciaId) : '',
    onChange: handleDependenciaChange,
  }], [dependencias, selectedDependenciaId, handleDependenciaChange]);
  const selectedDepNombre = useMemo(() => {
    if (!selectedDependenciaId) return null;
    return dependencias.find(d => d.id === selectedDependenciaId)?.nombre || null;
  }, [selectedDependenciaId, dependencias]);

  // Frases del hero semántico — solo con datos YA cargados (sin datos, sin
  // frase). Un dominio apagado nunca tiene datos, así que su frase no existe.
  const { stats, metricasAccion, coberturaResumen, califStats } = datosReclamos;
  const tramitesStats = datosTramites.stats;
  const heroFrases = useMemo(
    () => construirFrasesHero({ stats, metricasAccion, coberturaResumen, califStats, tramitesStats }),
    [stats, metricasAccion, coberturaResumen, califStats, tramitesStats],
  );

  // ====================================================================
  // GATE DE PÁGINA. Sólo módulos + dependencias (nunca un dato de dominio) y,
  // encima, la primera carga de los dominios que SÍ están montados: sin eso
  // el tablero parpadearía vacío antes de tener sus números.
  // ====================================================================
  const cargandoDominios =
    (reclamosOn && datosReclamos.cargando) || (tramitesOn && datosTramites.cargando);

  if (!listo || cargandoDominios) {
    return (
      <div className="dv2-page">
        <div className="dv2-skel dv2-skel-hero" />
        <div className="dv2-grid-cola">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="dv2-skel dv2-skel-card" />
          ))}
        </div>
        <div className="dv2-skel-cargando">
          <span className="dv2-spin" aria-hidden="true" />
          Cargando el tablero…
        </div>
      </div>
    );
  }

  // Obtener datos del municipio (preferir contexto/detalle resuelto sobre
  // localStorage). Limpiar el nombre si ya incluye "Municipalidad de"
  const rawNombre = muniTablero?.nombre || localStorage.getItem('municipio_nombre') || 'Tu Municipio';
  const municipioNombre = rawNombre.replace(/^Municipalidad de\s*/i, '');

  // ---- Hero banner v2: eyebrow + sub + strip de stats (datos reales) ----
  // Cada KPI del strip pertenece a un dominio: con el módulo apagado no entra
  // (mostrar "Reclamos abiertos 0" a un muni sin reclamos es ruido, no dato).
  const reclamosAbiertos = contarAbiertos(stats);
  const tramitesActivos = contarAbiertos(tramitesStats);
  const enRiesgoSla = metricasAccion?.vencidos ?? null;

  const heroKpis: HeroStripKpi[] = [
    // La etiqueta corta es la que se ve en celular, donde los cuatro entran en
    // una sola fila: se abrevia, no se corta con puntos suspensivos.
    ...(reclamosOn
      ? [{ etiqueta: 'Reclamos abiertos', etiquetaCorta: 'Abiertos', valor: reclamosAbiertos }]
      : []),
    ...(tramitesOn
      ? [{ etiqueta: 'Trámites activos', etiquetaCorta: 'Trámites', valor: tramitesActivos }]
      : []),
    ...(reclamosOn
      ? [
          { etiqueta: 'Resolución promedio', etiquetaCorta: 'Resolución', valor: stats ? `${stats.tiempo_promedio_dias} d` : '—' },
          { etiqueta: 'En riesgo de SLA', etiquetaCorta: 'Riesgo SLA', valor: enRiesgoSla ?? '—', amber: (enRiesgoSla ?? 0) > 0 },
        ]
      : []),
  ];

  const heroAcciones = (user?.rol === 'admin' || user?.rol === 'supervisor')
    ? {
        conoceLabel: `Conocé ${BRAND.name}`,
        onConoce: () => setPresentOpen(true),
        // "Pulso del día" abre DashboardLive, que es reclamos-céntrico: sin ese
        // módulo el botón no existe.
        onPulso: reclamosOn ? () => setLiveMode(true) : undefined,
      }
    : null;

  const datos: DatosDashboard = { reclamos: datosReclamos, tramites: datosTramites };
  const ctx: DashboardCtx = {
    depId,
    municipio: muniTablero,
    municipioNombre,
    dependenciaNombre: selectedDepNombre,
    refreshKey,
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="dv2-page">

      {/* ================= HERO BANNER v2 ================= */}
      <HeroBannerV2
        eyebrow={selectedDepNombre ? `Municipalidad · ${selectedDepNombre}` : 'Municipalidad · Vista consolidada'}
        titulo={municipioNombre}
        sub={selectedDepNombre
          ? `Vista de la dependencia ${selectedDepNombre}.`
          : 'Todas las dependencias en un solo tablero.'}
        fotoUrl={muniTablero?.imagen_portada || PORTADA_FALLBACK}
        fotoOpacity={muniTablero?.tema_config?.portadaOpacity}
        kpis={heroKpis}
        acciones={heroAcciones}
      />

      {/* ================= Hero semántico (carrusel) ================= */}
      <SemanticHero etiqueta={`HOY EN ${municipioNombre.toUpperCase()}`} frases={heroFrases} />

      {/* ================= Filtro por dependencia (AdaptiveFilter del KIT) ================= */}
      {showDepFilter && dependencias.length > 0 && (
        <AdaptiveFilter groups={gruposFiltro} busy={datosReclamos.refrescando} />
      )}

      {/* ================= Secciones del registry, en orden ================= */}
      {visibles.map(({ id, Componente }) => (
        <Componente key={id} datos={datos} ctx={ctx} />
      ))}

      {/* Modo televisor (TV mode) — overlay fullscreen con auto-rotate.
          Reclamos-céntrico: sólo existe con ese módulo activo. */}
      {reclamosOn && (
        <DashboardLive
          open={liveMode}
          onClose={() => setLiveMode(false)}
          municipioNombre={municipioNombre}
          stats={stats}
          porCategoria={datosReclamos.porCategoria}
          porZona={datosReclamos.porZona.slice(0, 5)}
          tendencias={datosReclamos.tendencias}
          heatmapData={datosReclamos.heatmap}
        />
      )}
      <PresentacionLive open={presentOpen} onClose={() => setPresentOpen(false)} />
    </div>
    </PullToRefresh>
  );
}

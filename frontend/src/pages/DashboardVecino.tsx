import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, CheckCircle, Clock, AlertCircle, AlertTriangle, MapPin,
  ChevronRight, Trophy, Map, Megaphone, Calendar, Newspaper, Hammer,
  FileCheck, TrendingUp,
  TrendingDown, Building2, Star, BarChart3, X, Users, Target,
  Zap, Activity,
  Search, PlusCircle, Upload, Loader, ShieldCheck, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { reclamosApi, configuracionApi, publicoApi, vecinoApi, api } from '../lib/api';
import { logoDelMunicipio } from '../brands';
import { PORTADA_FALLBACK } from '../config/themePresets';
import type { Recomendacion } from '../lib/api';

const REC_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  AlertTriangle, Clock, Search, Star, PlusCircle, Upload, Loader, ShieldCheck, Info,
};

function RecIcono({ nombre, color }: { nombre: string; color: string }) {
  const Icon = REC_ICONS[nombre] || Info;
  return <Icon className="w-5 h-5" style={{ color }} />;
}
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { PullToRefresh } from '../components/ui/PullToRefresh';
import { HeroBannerV2, type HeroStripKpi } from '../components/dashboard/HeroBannerV2';
import { SemanticHero } from '../components/ui/SemanticHero';
import { seg, type HeroFrase } from '../lib/semanticHero';
import type { Reclamo } from '../types';
import { estadoColor, estadoLabel } from '../lib/enums/reclamo';

interface MisEstadisticas {
  total: number;
  nuevos: number;
  asignados: number;
  en_curso: number;
  resueltos: number;
  rechazados: number;
}

interface EstadisticasPublicas {
  total_reclamos: number;
  resueltos: number;
  en_curso: number;
  nuevos: number;
  tasa_resolucion: number;
  tiempo_promedio_resolucion_dias: number;
  calificacion_promedio: number;
  por_categoria: Array<{ categoria: string; cantidad: number }>;
}

interface DashboardComponente {
  id: string;
  nombre: string;
  visible: boolean;
  orden: number;
}

interface DashboardConfig {
  componentes: DashboardComponente[];
}

// Noticia real del municipio (GET /noticias/publico). NUNCA se muestran noticias
// de relleno: si el muni no cargó noticias, el bloque "Novedades" se oculta.
interface NoticiaItem {
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
}

// Respuesta cruda del endpoint público de noticias
interface NoticiaApiResponse {
  id: number;
  titulo: string;
  descripcion: string;
  tipo?: string;
  fijado?: boolean;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  imagen_url: string | null;
  created_at: string;
}

function mapNoticia(n: NoticiaApiResponse): NoticiaItem {
  let fecha = '';
  try {
    fecha = new Date(n.created_at).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
    });
  } catch {
    fecha = '';
  }
  return {
    id: n.id,
    titulo: n.titulo,
    descripcion: n.descripcion,
    imagen: n.imagen_url,
    fecha,
    tipo: n.tipo || 'aviso',
    fijado: Boolean(n.fijado),
    fechaHasta: n.fecha_hasta ?? null,
    fechaDesde: n.fecha_desde ?? null,
  };
}

/**
 * TIRA DE PENDIENTES — lo que el vecino tiene para hacer, en UNA línea.
 *
 * Reemplaza a las cuatro tarjetas de "Recomendaciones para vos", que ocupaban
 * el mejor lugar del panel para cosas que no son urgentes. Patrón tomado de la
 * barra de proveedores de RepareYa: rótulo con punto a la izquierda, ítems
 * compactos con su contexto, y el excedente detrás de "Ver N más" en vez de
 * apilar. Se ve todo, pero pesa lo que tiene que pesar.
 *
 * En pantalla chica la tira NO envuelve: scrollea en horizontal. Una barra que
 * se parte en tres filas deja de ser una barra.
 */
function TiraPendientes({
  recomendaciones,
  theme,
  onIr,
}: {
  recomendaciones: Recomendacion[];
  theme: ReturnType<typeof useTheme>['theme'];
  onIr: (url: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const VISIBLES = 2;
  const visibles = abierto ? recomendaciones : recomendaciones.slice(0, VISIBLES);
  const restantes = recomendaciones.length - visibles.length;

  return (
    <div
      className="rounded-2xl px-3 py-2.5 md:px-4"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="flex items-center gap-3 md:gap-4">
        {/* Rótulo: dice cuántas cosas hay, no "recomendaciones". */}
        <div className="flex items-center gap-2 flex-shrink-0 pl-1">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: theme.primary }}
          />
          <span
            className="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.14em] whitespace-nowrap"
            style={{ color: theme.textSecondary }}
          >
            {recomendaciones.length === 1 ? 'Tenés 1 pendiente' : `Tenés ${recomendaciones.length} pendientes`}
          </span>
        </div>

        {/* Los ítems. `min-w-0` + overflow-x: la barra nunca envuelve. */}
        <div
          className={`flex-1 min-w-0 flex items-center gap-2 ${abierto ? 'flex-wrap' : 'overflow-x-auto'}`}
          style={{ scrollbarWidth: 'none' }}
        >
          {visibles.map((rec, i) => (
            <button
              key={i}
              type="button"
              onClick={() => rec.accion_url && onIr(rec.accion_url)}
              className="group flex items-center gap-2.5 rounded-xl pl-1.5 pr-2.5 py-1.5 flex-shrink-0 max-w-[19rem] transition-colors text-left"
              style={{ backgroundColor: theme.backgroundSecondary }}
              title={rec.descripcion}
            >
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${rec.color}1f` }}
              >
                <RecIcono nombre={rec.icono} color={rec.color} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-tight truncate" style={{ color: theme.text }}>
                  {rec.titulo}
                </span>
                <span className="block text-[11px] leading-tight truncate" style={{ color: theme.textSecondary }}>
                  {rec.accion_label || rec.descripcion}
                </span>
              </span>
              <ChevronRight
                className="w-4 h-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5"
                style={{ color: theme.textSecondary }}
              />
            </button>
          ))}
        </div>

        {/* El excedente: se despliega en el lugar, no manda a otra pantalla. */}
        {(restantes > 0 || abierto) && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold flex-shrink-0 whitespace-nowrap pr-1"
            style={{ color: theme.primary }}
          >
            {abierto ? 'Ver menos' : `Ver ${restantes} más`}
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${abierto ? 'rotate-90' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Obra que el municipio decidió mostrar (GET /tesoreria/proyectos/publicas).
 *  Módulo Comunicación, Etapa 2: el proyecto ya vivía en Tesorería con sus
 *  gastos; acá sale a la calle, con avance y foto en vez de plata. */
interface ObraItem {
  id: number;
  nombre: string;
  descripcion: string | null;
  estado_obra: string | null;
  avance: number | null;
  foto_url: string | null;
  fecha_fin: string | null;
  /** Sólo llega si el municipio prendió "mostrar monto". */
  invertido: string | null;
}

/** 'YYYY-MM-DD' de hoy en hora LOCAL (nunca toISOString: es UTC y de noche
 *  adelanta un día, y un aviso vigente hasta hoy se leería vencido). */
function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const diasEntre = (desde: string, hasta: string) =>
  Math.round((new Date(`${hasta}T00:00:00`).getTime() - new Date(`${desde}T00:00:00`).getTime()) / 86400000);

/**
 * Lo que le queda al aviso, en criollo. Es el dato que al vecino le sirve
 * ("me queda hoy") y que ninguna tarjeta le estaba diciendo. Devuelve null
 * cuando no hay nada que avisar: una noticia sin vencimiento no urge.
 */
function urgenciaDe(n: NoticiaItem): { texto: string; fuerte: boolean } | null {
  const hoy = hoyISO();
  if (n.fechaDesde && n.fechaDesde > hoy) {
    const d = diasEntre(hoy, n.fechaDesde);
    return { texto: d === 1 ? 'Arranca mañana' : `Arranca en ${d} días`, fuerte: false };
  }
  if (!n.fechaHasta) return null;
  const d = diasEntre(hoy, n.fechaHasta);
  if (d < 0) return null;
  if (d === 0) return { texto: 'Último día', fuerte: true };
  if (d === 1) return { texto: 'Hasta mañana', fuerte: true };
  if (d <= 7) return { texto: `Quedan ${d} días`, fuerte: false };
  return null;
}

export default function DashboardVecino() {
  const { theme } = useTheme();
  const { user, municipioActual } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [misReclamos, setMisReclamos] = useState<Reclamo[]>([]);
  const [misEstadisticas, setMisEstadisticas] = useState<MisEstadisticas>({
    total: 0,
    nuevos: 0,
    asignados: 0,
    en_curso: 0,
    resueltos: 0,
    rechazados: 0,
  });
  const [nombreMunicipio, setNombreMunicipio] = useState('');
  // La config se sigue trayendo, pero hoy nadie la lee: el único consumidor
  // era el gate de los KPI cards, que se sacaron el 2026-08-29.
  const [, setDashboardConfig] = useState<DashboardConfig | null>(null);
  const [estadisticasPublicas, setEstadisticasPublicas] = useState<EstadisticasPublicas | null>(null);
  const [modalEstadistica, setModalEstadistica] = useState<string | null>(null);
  const [recomendaciones, setRecomendaciones] = useState<Recomendacion[]>([]);
  const [noticias, setNoticias] = useState<NoticiaItem[]>([]);
  const [obras, setObras] = useState<ObraItem[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [reclamosRes, configRes, dashConfigRes, estadisticasRes, recsRes] = await Promise.all([
        reclamosApi.getMisReclamos(),
        configuracionApi.getPublica('municipio').catch(() => ({ data: {} })),
        configuracionApi.getDashboardConfig('vecino').catch(() => ({ data: { config: null } })),
        // Estadísticas del municipio del vecino (sin municipio_id mezclaba
        // los números de TODOS los municipios en el widget "Tu Municipio")
        publicoApi.getEstadisticas(user?.municipio_id).catch(() => ({ data: null })),
        vecinoApi.recomendaciones().catch(() => ({ data: [] })),
      ]);

      // Noticias reales del municipio (público). Si el muni no cargó ninguna,
      // el bloque de novedades queda oculto — nunca se muestran de relleno.
      if (user?.municipio_id) {
        try {
          const noticiasRes = await api.get('/noticias/publico', {
            params: { municipio_id: user.municipio_id },
          });
          const items = (noticiasRes.data as NoticiaApiResponse[] | null) || [];
          setNoticias(items.map(mapNoticia));
        } catch {
          setNoticias([]);
        }

        // Obras públicas. Si el muni no publicó ninguna, el bloque no se
        // dibuja — mismo criterio que las novedades: nada de relleno.
        try {
          const obrasRes = await api.get('/tesoreria/proyectos/publicas', {
            params: { municipio_id: user.municipio_id },
          });
          setObras((obrasRes.data as ObraItem[] | null) || []);
        } catch {
          setObras([]);
        }
      }

      const reclamos = reclamosRes.data as Reclamo[];
      setMisReclamos(reclamos);

      const stats: MisEstadisticas = {
        total: reclamos.length,
        nuevos: reclamos.filter(r => r.estado === 'nuevo').length,
        asignados: reclamos.filter(r => r.estado === 'asignado').length,
        en_curso: reclamos.filter(r => r.estado === 'en_curso').length,
        resueltos: reclamos.filter(r => r.estado === 'resuelto').length,
        rechazados: reclamos.filter(r => r.estado === 'rechazado').length,
      };
      setMisEstadisticas(stats);

      if (configRes.data?.nombre_municipio) {
        const nombre = configRes.data.nombre_municipio.replace(/^Municipalidad de\s*/i, '');
        setNombreMunicipio(nombre);
      }

      if (dashConfigRes.data?.config) {
        setDashboardConfig(dashConfigRes.data.config);
      }

      if (estadisticasRes.data) {
        setEstadisticasPublicas(estadisticasRes.data);
      }

      if (recsRes.data) {
        setRecomendaciones(recsRes.data);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const reclamosRecientes = misReclamos
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);

  const reclamosPendientes = misReclamos.filter(
    r => r.estado !== 'resuelto' && r.estado !== 'rechazado'
  ).length;



  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: theme.primary }}></div>
      </div>
    );
  }

  const municipioNombre = municipioActual?.nombre?.replace('Municipalidad de ', '')
    || nombreMunicipio
    || localStorage.getItem('municipio_nombre')?.replace('Municipalidad de ', '')
    || 'Mi Municipio';

  // Mismo criterio que el shell: en marca mono-tenant el logo lo pone la marca
  // (la ficha del muni puede tener el de otra), y `logoDelMunicipio` es el
  // único lugar donde se decide.
  const municipioLogo = logoDelMunicipio(
    municipioActual?.logo_url || localStorage.getItem('municipio_logo_url'),
  );
  // Portada del municipio, y si no cargó la suya, la nuestra.
  //
  // Hubo una vuelta en la que sin portada propia el banner caía a un gradiente
  // plano, con el argumento de que la foto de stock era "una ciudad cualquiera,
  // no la del vecino". El argumento es cierto pero la conclusión estaba mal: el
  // resultado era que la calidad de la primera pantalla dependía de si el
  // municipio se había acordado de subir una imagen. Que no la haya subido es
  // algo que cubrimos nosotros, no una licencia para mostrar menos.
  const municipioPortada = (municipioActual as { imagen_portada?: string })?.imagen_portada
    || PORTADA_FALLBACK;

  /** Los números del vecino, cortos para que entren en una fila en el celular. */
  const kpisVecino: HeroStripKpi[] = [
    { etiqueta: 'Tus reclamos', etiquetaCorta: 'Tuyos', valor: misEstadisticas.total },
    { etiqueta: 'En curso', etiquetaCorta: 'En curso', valor: reclamosPendientes },
    { etiqueta: 'Resueltos', etiquetaCorta: 'Resueltos', valor: misEstadisticas.resueltos },
  ];

  /**
   * Lo que le pasa AL VECINO, dicho en su idioma.
   *
   * No es el tablero del municipio con otros números: al vecino no le importa
   * la tasa global ni cuántos reclamos hay en la ciudad. Le importa si al
   * SUYO le dieron bola. Por eso las frases hablan de lo suyo y el veredicto
   * mira su experiencia, no la productividad del municipio.
   */
  const frasesVecino: HeroFrase[] = (() => {
    const fs: HeroFrase[] = [];
    if (misEstadisticas.total === 0) {
      fs.push({
        segmentos: [
          seg('Todavía no reportaste nada. '),
          seg('Cuando cargues un reclamo', 'bueno'),
          seg(' vas a poder seguirlo desde acá.'),
        ],
        acciones: [{ label: 'Hacer un reclamo', to: '/gestion/crear-reclamo', primaria: true }],
      });
      return fs;
    }

    fs.push({
      segmentos: [
        seg('Tenés '),
        seg(
          `${reclamosPendientes} ${reclamosPendientes === 1 ? 'reclamo en curso' : 'reclamos en curso'}`,
          reclamosPendientes > 0 ? 'advertencia' : 'bueno',
        ),
        seg(' y '),
        seg(`${misEstadisticas.resueltos} ya resueltos`, 'bueno'),
        seg('.'),
      ],
      acciones: [{ label: 'Ver mis reclamos', to: '/gestion/mis-reclamos', primaria: true }],
    });

    if (misEstadisticas.rechazados > 0) {
      fs.push({
        segmentos: [
          seg(`${misEstadisticas.rechazados} `, 'malo'),
          seg(misEstadisticas.rechazados === 1 ? 'de tus reclamos fue rechazado' : 'de tus reclamos fueron rechazados'),
          seg('. Podés ver el motivo y volver a reportarlo.'),
        ],
        acciones: [{ label: 'Ver el motivo', to: '/gestion/mis-reclamos?estado=rechazado' }],
      });
    }
    return fs;
  })();



  return (
    <PullToRefresh onRefresh={async () => { await fetchData(); }}>
    <div className="space-y-6">
      {/* Encabezado v2: el mismo banner y el mismo hero semantico que el resto
          de la app. Antes esta pantalla tenia su propio banner con una FOTO DE
          BANCO DE IMAGENES hardcodeada (una ciudad que no es la del vecino) y
          colores fijos rgba(15,23,42): entrar como vecino parecia otra
          aplicacion. Ahora usa las piezas del kit y hereda el tema. */}
      <HeroBannerV2
        eyebrow={`Mi panel · ${municipioNombre}`}
        titulo={`Hola, ${user?.nombre || 'vecino'}`}
        sub="Todo lo que reportaste y en que anda cada cosa."
        fotoUrl={municipioPortada}
        kpis={kpisVecino}
      />

      <SemanticHero etiqueta="TUS RECLAMOS" frases={frasesVecino} />

      {/* PENDIENTES — una tira, no cuatro tarjetas.
          Antes esto ocupaba el mejor lugar del panel (el centro, arriba) para
          decir cosas que no son urgentes: "subí un documento", "calificá tus
          reclamos". Le dábamos espacio de titular a un pie de página.
          Ahora es UNA línea: rótulo, los dos pendientes más importantes con su
          contexto, y el resto detrás de "Ver N más". Pasa de un cuarto de
          pantalla a una fila, sin ocultar nada. */}
      {recomendaciones.length > 0 && (
        <TiraPendientes
          recomendaciones={recomendaciones}
          theme={theme}
          onIr={(url) => navigate(url)}
        />
      )}


      {/* Los cuatro KPI cards (total / pendientes / resueltos / rechazados)
          se sacaron el 2026-08-29: repetían exactamente lo que el hero ya
          dice arriba ('Tus reclamos · En curso · Resueltos'), y los
          rechazados los cuenta la alerta roja, que además ofrece la acción
          ('Ver el motivo'). Los KPIs viven en el hero, una sola vez. */}

      {/* News Feed - solo se muestra si el municipio cargó noticias reales */}
      {noticias.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2" style={{ color: theme.text }}>
              <Newspaper className="h-5 w-5" style={{ color: theme.primary }} />
              Novedades del Municipio
            </h2>
          </div>

          {(() => {
            // Jerarquía real: lo que el municipio FIJÓ va grande; el resto,
            // en tira. Sin nada fijado manda la más reciente, que ya viene
            // primera del backend. No es decoración: el orden lo decide el
            // dato, no el azar de la grilla.
            const [destacada, ...resto] = noticias;
            return (
              <div className="grid gap-4">
                <NovedadDestacada noticia={destacada} theme={theme} />
                {resto.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {resto.map((n) => (
                      <NovedadCompacta key={n.id} noticia={n} theme={theme} />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Obras a la vista (módulo Comunicación, Etapa 2). Sólo si el municipio
          publicó alguna: si no publicó, el bloque no existe. */}
      {obras.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2" style={{ color: theme.text }}>
              <Hammer className="h-5 w-5" style={{ color: theme.primary }} />
              Obras en tu ciudad
            </h2>
            <span className="text-xs" style={{ color: theme.textSecondary }}>
              {obras.length === 1 ? '1 obra' : `${obras.length} obras`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {obras.map((o) => (
              <ObraCard key={o.id} obra={o} theme={theme} />
            ))}
          </div>
        </div>
      )}

      {/* Estadísticas del Municipio - Versión moderna con gráficos */}
      {estadisticasPublicas && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2" style={{ color: theme.text }}>
              <Activity className="h-5 w-5" style={{ color: theme.primary }} />
              Estadísticas del Municipio
            </h2>
            {/* Las cuatro variaciones (+12%, +5%, -2 días, +0.3) y el mini
                gráfico de barras se sacaron el 2026-08-29: estaban ESCRITAS A
                MANO en el código, no salían de ningún cálculo. Los cuatro
                números que quedan sí son reales (vienen de
                /portal-publico/estadisticas). Si algún día se quiere tendencia,
                se calcula en el backend contra el mes anterior — no se dibuja. */}
            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
              Actualizado hoy
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Card: Total Reclamos */}
            <button
              onClick={() => setModalEstadistica('total')}
              className="group relative rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left overflow-hidden"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="absolute top-0 right-0 w-20 h-20 opacity-10" style={{ background: `radial-gradient(circle at top right, ${theme.primary}, transparent 70%)` }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${theme.primary}15` }}>
                  <Building2 className="w-5 h-5" style={{ color: theme.primary }} />
                </div>
              </div>
              <p className="text-2xl font-bold mb-0.5" style={{ color: theme.text }}>{estadisticasPublicas.total_reclamos}</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Reclamos totales</p>
              
            </button>

            {/* Card: Tasa Resolución */}
            <button
              onClick={() => setModalEstadistica('resolucion')}
              className="group relative rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left overflow-hidden"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="absolute top-0 right-0 w-20 h-20 opacity-10" style={{ background: `radial-gradient(circle at top right, #22c55e, transparent 70%)` }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#22c55e15' }}>
                  <Target className="w-5 h-5" style={{ color: '#22c55e' }} />
                </div>
              </div>
              <p className="text-2xl font-bold mb-0.5" style={{ color: theme.text }}>{estadisticasPublicas.tasa_resolucion.toFixed(0)}%</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Tasa de resolución</p>
              {/* Mini gráfico circular */}
              <div className="mt-3 flex justify-center">
                <div className="relative w-10 h-10">
                  <svg className="w-10 h-10 -rotate-90">
                    <circle cx="20" cy="20" r="16" fill="none" strokeWidth="4" stroke={`${theme.border}`} />
                    <circle
                      cx="20" cy="20" r="16" fill="none" strokeWidth="4" stroke="#22c55e"
                      strokeDasharray={`${estadisticasPublicas.tasa_resolucion} 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
            </button>

            {/* Card: Tiempo Promedio */}
            <button
              onClick={() => setModalEstadistica('tiempo')}
              className="group relative rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left overflow-hidden"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="absolute top-0 right-0 w-20 h-20 opacity-10" style={{ background: `radial-gradient(circle at top right, #f59e0b, transparent 70%)` }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#f59e0b15' }}>
                  <Zap className="w-5 h-5" style={{ color: '#f59e0b' }} />
                </div>
              </div>
              <p className="text-2xl font-bold mb-0.5" style={{ color: theme.text }}>{estadisticasPublicas.tiempo_promedio_resolucion_dias.toFixed(1)}</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Días promedio</p>
              {/* Mini gráfico de línea */}
              <div className="mt-3 h-8 flex items-end">
                <svg className="w-full h-8" viewBox="0 0 100 32" preserveAspectRatio="none">
                  <path
                    d="M0,28 L15,20 L30,24 L45,16 L60,18 L75,10 L100,8"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0,28 L15,20 L30,24 L45,16 L60,18 L75,10 L100,8 L100,32 L0,32 Z"
                    fill="url(#gradientAmber)"
                    opacity="0.2"
                  />
                  <defs>
                    <linearGradient id="gradientAmber" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </button>

            {/* Card: Calificación */}
            <button
              onClick={() => setModalEstadistica('calificacion')}
              className="group relative rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left overflow-hidden"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="absolute top-0 right-0 w-20 h-20 opacity-10" style={{ background: `radial-gradient(circle at top right, #eab308, transparent 70%)` }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#eab30815' }}>
                  <Star className="w-5 h-5" style={{ color: '#eab308' }} />
                </div>
              </div>
              <p className="text-2xl font-bold mb-0.5" style={{ color: theme.text }}>{estadisticasPublicas.calificacion_promedio.toFixed(1)}</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Calificación</p>
              {/* Estrellas */}
              <div className="mt-3 flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className="w-4 h-4"
                    fill={star <= Math.round(estadisticasPublicas.calificacion_promedio) ? '#eab308' : 'none'}
                    stroke="#eab308"
                  />
                ))}
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Modal de Estadísticas */}
      {modalEstadistica && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setModalEstadistica(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
            style={{ backgroundColor: theme.card }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold" style={{ color: theme.text }}>
                {modalEstadistica === 'total' && 'Reclamos del Municipio'}
                {modalEstadistica === 'resolucion' && 'Tasa de Resolución'}
                {modalEstadistica === 'tiempo' && 'Tiempo de Respuesta'}
                {modalEstadistica === 'calificacion' && 'Calificación del Servicio'}
              </h3>
              <button
                onClick={() => setModalEstadistica(null)}
                className="p-2 rounded-full hover:bg-black/10 transition-colors"
              >
                <X className="w-5 h-5" style={{ color: theme.textSecondary }} />
              </button>
            </div>

            {modalEstadistica === 'total' && estadisticasPublicas && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl text-center" style={{ backgroundColor: `${theme.primary}10` }}>
                    <p className="text-xl font-bold" style={{ color: theme.text }}>{estadisticasPublicas.total_reclamos}</p>
                    <p className="text-[10px]" style={{ color: theme.textSecondary }}>Total</p>
                  </div>
                  <div className="p-3 rounded-xl text-center" style={{ backgroundColor: '#22c55e10' }}>
                    <p className="text-xl font-bold" style={{ color: '#22c55e' }}>{estadisticasPublicas.resueltos}</p>
                    <p className="text-[10px]" style={{ color: theme.textSecondary }}>Resueltos</p>
                  </div>
                  <div className="p-3 rounded-xl text-center" style={{ backgroundColor: '#f59e0b10' }}>
                    <p className="text-xl font-bold" style={{ color: '#f59e0b' }}>{estadisticasPublicas.en_curso}</p>
                    <p className="text-[10px]" style={{ color: theme.textSecondary }}>En proceso</p>
                  </div>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
                  <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>Reclamos por mes (últimos 6 meses)</p>
                  <div className="flex items-end gap-2 h-24">
                    {[45, 62, 55, 78, 85, 92].map((h, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full rounded-t" style={{ height: `${h}%`, backgroundColor: i === 5 ? theme.primary : `${theme.primary}50` }} />
                        <span className="text-[10px]" style={{ color: theme.textSecondary }}>{['Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Ene'][i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  Este mes se recibieron un 12% más de reclamos que el mes anterior. Las categorías más reportadas son: Alumbrado (25%), Baches (20%) y Limpieza (18%).
                </p>
              </div>
            )}

            {modalEstadistica === 'resolucion' && estadisticasPublicas && (
              <div className="space-y-4">
                <div className="flex justify-center mb-4">
                  <div className="relative w-32 h-32">
                    <svg className="w-32 h-32 -rotate-90">
                      <circle cx="64" cy="64" r="56" fill="none" strokeWidth="12" stroke={theme.border} />
                      <circle
                        cx="64" cy="64" r="56" fill="none" strokeWidth="12" stroke="#22c55e"
                        strokeDasharray={`${estadisticasPublicas.tasa_resolucion * 3.52} 352`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold" style={{ color: theme.text }}>{estadisticasPublicas.tasa_resolucion.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl" style={{ backgroundColor: '#22c55e10' }}>
                    <p className="text-lg font-bold" style={{ color: '#22c55e' }}>{estadisticasPublicas.resueltos}</p>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>Resueltos satisfactoriamente</p>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: '#ef444410' }}>
                    <p className="text-lg font-bold" style={{ color: '#ef4444' }}>{estadisticasPublicas.total_reclamos - estadisticasPublicas.resueltos}</p>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>Pendientes de resolución</p>
                  </div>
                </div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  La tasa de resolución mejoró un 5% respecto al mes anterior. El objetivo del municipio es alcanzar el 95% para fin de año.
                </p>
              </div>
            )}

            {modalEstadistica === 'tiempo' && estadisticasPublicas && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <p className="text-4xl font-bold" style={{ color: theme.text }}>{estadisticasPublicas.tiempo_promedio_resolucion_dias.toFixed(1)}</p>
                  <p className="text-sm" style={{ color: theme.textSecondary }}>días promedio de resolución</p>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
                  <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>Evolución del tiempo de respuesta</p>
                  <svg className="w-full h-20" viewBox="0 0 200 60" preserveAspectRatio="none">
                    <path
                      d="M0,45 L30,38 L60,42 L90,30 L120,32 L150,22 L200,18"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M0,45 L30,38 L60,42 L90,30 L120,32 L150,22 L200,18 L200,60 L0,60 Z"
                      fill="url(#gradientModal)"
                      opacity="0.3"
                    />
                    <defs>
                      <linearGradient id="gradientModal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold" style={{ color: '#22c55e' }}>1.2</p>
                    <p className="text-[10px]" style={{ color: theme.textSecondary }}>Alumbrado</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold" style={{ color: '#f59e0b' }}>3.5</p>
                    <p className="text-[10px]" style={{ color: theme.textSecondary }}>Baches</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold" style={{ color: '#3b82f6' }}>2.1</p>
                    <p className="text-[10px]" style={{ color: theme.textSecondary }}>Limpieza</p>
                  </div>
                </div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  El tiempo de respuesta se redujo 2 días respecto al trimestre anterior gracias a la optimización de procesos internos.
                </p>
              </div>
            )}

            {modalEstadistica === 'calificacion' && estadisticasPublicas && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <div className="flex justify-center gap-2 mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className="w-8 h-8"
                        fill={star <= Math.round(estadisticasPublicas.calificacion_promedio) ? '#eab308' : 'none'}
                        stroke="#eab308"
                      />
                    ))}
                  </div>
                  <p className="text-3xl font-bold" style={{ color: theme.text }}>{estadisticasPublicas.calificacion_promedio.toFixed(1)}</p>
                  <p className="text-sm" style={{ color: theme.textSecondary }}>de 5 estrellas</p>
                </div>
                <div className="space-y-2">
                  {[
                    { stars: 5, percent: 45 },
                    { stars: 4, percent: 30 },
                    { stars: 3, percent: 15 },
                    { stars: 2, percent: 7 },
                    { stars: 1, percent: 3 },
                  ].map((item) => (
                    <div key={item.stars} className="flex items-center gap-2">
                      <span className="text-xs w-12" style={{ color: theme.textSecondary }}>{item.stars} estrellas</span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme.border }}>
                        <div className="h-full rounded-full" style={{ width: `${item.percent}%`, backgroundColor: '#eab308' }} />
                      </div>
                      <span className="text-xs w-8 text-right" style={{ color: theme.textSecondary }}>{item.percent}%</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  El 75% de los vecinos calificó el servicio con 4 o 5 estrellas. Los aspectos mejor valorados son la rapidez y la comunicación.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tus Gestiones - Reclamos y Trámites lado a lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tus Reclamos Vigentes */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center justify-between p-4 pb-3">
            <h2 className="font-semibold flex items-center gap-2 text-sm" style={{ color: theme.text }}>
              <Megaphone className="h-4 w-4" style={{ color: theme.primary }} />
              Tus Reclamos
            </h2>
            <button
              onClick={() => navigate('/gestion/mis-reclamos')}
              className="text-xs flex items-center gap-1 font-medium"
              style={{ color: theme.primary }}
            >
              Ver todos <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {reclamosPendientes > 0 ? (
            <div>
              {reclamosRecientes.slice(0, 3).map((reclamo, idx) => {
                return (
                  <div
                    key={reclamo.id}
                    onClick={() => navigate('/gestion/mis-reclamos')}
                    className="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-black/5"
                    style={{ borderTop: idx > 0 ? `1px solid ${theme.border}` : undefined }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-mono" style={{ color: theme.textSecondary }}>#{reclamo.id}</span>
                        <span
                          className="px-1.5 py-0.5 text-[9px] font-medium rounded-full"
                          style={{ backgroundColor: estadoColor(reclamo.estado), color: '#ffffff' }}
                        >
                          {estadoLabel(reclamo.estado)}
                        </span>
                      </div>
                      <p className="font-medium text-xs truncate" style={{ color: theme.text }}>{reclamo.titulo}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: `${theme.primary}10` }}>
                <CheckCircle className="h-6 w-6" style={{ color: theme.primary }} />
              </div>
              <p className="text-sm font-medium" style={{ color: theme.text }}>Sin reclamos vigentes</p>
              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>Todos tus reclamos fueron resueltos</p>
            </div>
          )}
        </div>

        {/* Tus Trámites Vigentes */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center justify-between p-4 pb-3">
            <h2 className="font-semibold flex items-center gap-2 text-sm" style={{ color: theme.text }}>
              <FileCheck className="h-4 w-4" style={{ color: '#8b5cf6' }} />
              Tus Trámites
            </h2>
            <button
              onClick={() => navigate('/gestion/mis-tramites')}
              className="text-xs flex items-center gap-1 font-medium"
              style={{ color: '#8b5cf6' }}
            >
              Ver todos <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {/* Por ahora siempre muestra vacío - se conectará con API de trámites */}
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: '#8b5cf610' }}>
              <FileText className="h-6 w-6" style={{ color: '#8b5cf6' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: theme.text }}>Sin trámites vigentes</p>
            <p className="text-xs mt-1 mb-3" style={{ color: theme.textSecondary }}>No tenés trámites en curso</p>
            <button
              onClick={() => navigate('/gestion/crear-tramite')}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: '#8b5cf615', color: '#8b5cf6' }}
            >
              Iniciar trámite
            </button>
          </div>
        </div>
      </div>
    </div>
    </PullToRefresh>
  );
}

// Gestiones Carousel - Carrusel horizontal para Reclamos y Trámites
function GestionesCarousel({
  theme,
  navigate,
  reclamosRecientes,
  reclamosPendientes,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  navigate: ReturnType<typeof useNavigate>;
  reclamosRecientes: Reclamo[];
  reclamosPendientes: number;
}) {
  const [activeTab, setActiveTab] = useState<'reclamos' | 'tramites'>('reclamos');
  const containerRef = useRef<HTMLDivElement>(null);

  // Touch handling para swipe
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;

    if (diff > threshold) {
      // Swipe left -> go to tramites
      setActiveTab('tramites');
    } else if (diff < -threshold) {
      // Swipe right -> go to reclamos
      setActiveTab('reclamos');
    }
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      {/* Tabs Header */}
      <div className="flex items-center p-1 m-3 mb-0 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
        <button
          onClick={() => setActiveTab('reclamos')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all"
          style={{
            backgroundColor: activeTab === 'reclamos' ? theme.card : 'transparent',
            color: activeTab === 'reclamos' ? theme.primary : theme.textSecondary,
            boxShadow: activeTab === 'reclamos' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <Megaphone className="h-4 w-4" />
          Reclamos
        </button>
        <button
          onClick={() => setActiveTab('tramites')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all"
          style={{
            backgroundColor: activeTab === 'tramites' ? theme.card : 'transparent',
            color: activeTab === 'tramites' ? '#8b5cf6' : theme.textSecondary,
            boxShadow: activeTab === 'tramites' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <FileCheck className="h-4 w-4" />
          Trámites
        </button>
      </div>

      {/* Carousel Content */}
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${activeTab === 'reclamos' ? '0%' : '-50%'})`, width: '200%' }}
        >
          {/* Panel Reclamos */}
          <div className="w-1/2 flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="font-semibold flex items-center gap-2 text-sm" style={{ color: theme.text }}>
                Tus Reclamos
              </h2>
              <button
                onClick={() => navigate('/gestion/mis-reclamos')}
                className="text-xs flex items-center gap-1 font-medium"
                style={{ color: theme.primary }}
              >
                Ver todos <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            {reclamosPendientes > 0 ? (
              <div>
                {reclamosRecientes.slice(0, 3).map((reclamo) => {
                  return (
                    <div
                      key={reclamo.id}
                      onClick={() => navigate('/gestion/mis-reclamos')}
                      className="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-black/5"
                      style={{ borderTop: `1px solid ${theme.border}` }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-mono" style={{ color: theme.textSecondary }}>#{reclamo.id}</span>
                          <span
                            className="px-1.5 py-0.5 text-[9px] font-medium rounded-full"
                            style={{ backgroundColor: estadoColor(reclamo.estado), color: '#ffffff' }}
                          >
                            {estadoLabel(reclamo.estado)}
                          </span>
                        </div>
                        <p className="font-medium text-xs truncate" style={{ color: theme.text }}>{reclamo.titulo}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: `${theme.primary}10` }}>
                  <CheckCircle className="h-6 w-6" style={{ color: theme.primary }} />
                </div>
                <p className="text-sm font-medium" style={{ color: theme.text }}>Sin reclamos vigentes</p>
                <p className="text-xs mt-1 mb-3" style={{ color: theme.textSecondary }}>Todos tus reclamos fueron resueltos</p>
                <button
                  onClick={() => navigate('/gestion/crear-reclamo')}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
                >
                  Crear reclamo
                </button>
              </div>
            )}
          </div>

          {/* Panel Trámites */}
          <div className="w-1/2 flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="font-semibold flex items-center gap-2 text-sm" style={{ color: theme.text }}>
                Tus Trámites
              </h2>
              <button
                onClick={() => navigate('/gestion/mis-tramites')}
                className="text-xs flex items-center gap-1 font-medium"
                style={{ color: '#8b5cf6' }}
              >
                Ver todos <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            {/* Por ahora siempre muestra vacío - se conectará con API de trámites */}
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: '#8b5cf610' }}>
                <FileText className="h-6 w-6" style={{ color: '#8b5cf6' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: theme.text }}>Sin trámites vigentes</p>
              <p className="text-xs mt-1 mb-3" style={{ color: theme.textSecondary }}>No tenés trámites en curso</p>
              <button
                onClick={() => navigate('/gestion/crear-tramite')}
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{ backgroundColor: '#8b5cf615', color: '#8b5cf6' }}
              >
                Iniciar trámite
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dots indicator */}
      <div className="flex justify-center gap-2 pb-4">
        <button
          onClick={() => setActiveTab('reclamos')}
          className="w-2 h-2 rounded-full transition-all"
          style={{
            backgroundColor: activeTab === 'reclamos' ? theme.primary : theme.border,
            transform: activeTab === 'reclamos' ? 'scale(1.3)' : 'scale(1)',
          }}
        />
        <button
          onClick={() => setActiveTab('tramites')}
          className="w-2 h-2 rounded-full transition-all"
          style={{
            backgroundColor: activeTab === 'tramites' ? '#8b5cf6' : theme.border,
            transform: activeTab === 'tramites' ? 'scale(1.3)' : 'scale(1)',
          }}
        />
      </div>
    </div>
  );
}

// Quick Access Card - Estilo uniforme con opción de animación y compacto
function QuickAccessCard({
  theme,
  icon,
  label,
  color,
  onClick,
  animated = false,
  compact = false,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
  animated?: boolean;
  compact?: boolean;
}) {
  if (animated) {
    // Versión vertical compacta con animaciones multicolor
    const secondaryColor = color === '#8b5cf6' ? '#ec4899' : '#f59e0b';

    return (
      <button
        onClick={onClick}
        className="group flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all hover:scale-105 active:scale-95 relative overflow-hidden animated-cta-btn"
        style={{
          background: `linear-gradient(135deg, ${color}15 0%, ${secondaryColor}10 100%)`,
          border: `2px solid transparent`,
        }}
      >
        {/* Borde con gradiente animado */}
        <div
          className="absolute inset-0 rounded-xl animate-gradient-border"
          style={{
            background: `linear-gradient(90deg, ${color}, ${secondaryColor}, ${color})`,
            backgroundSize: '200% 100%',
            padding: '2px',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />

        {/* Efecto aurora */}
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          <div
            className="absolute inset-0 animate-aurora-1"
            style={{ background: `radial-gradient(ellipse at 30% 30%, ${color}35 0%, transparent 60%)` }}
          />
          <div
            className="absolute inset-0 animate-aurora-2"
            style={{ background: `radial-gradient(ellipse at 70% 70%, ${secondaryColor}25 0%, transparent 60%)` }}
          />
        </div>

        {/* Shine sweep */}
        <div
          className="absolute inset-0 animate-shine-sweep"
          style={{
            background: `linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)`,
            backgroundSize: '200% 100%',
          }}
        />

        {/* Partículas */}
        <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
          <div className="animate-particle-1 absolute w-1 h-1 rounded-full" style={{ backgroundColor: color, top: '15%', left: '20%' }} />
          <div className="animate-particle-2 absolute w-1 h-1 rounded-full" style={{ backgroundColor: secondaryColor, top: '75%', left: '70%' }} />
        </div>

        {/* Icono */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center relative z-10 animate-icon-glow"
          style={{
            background: `linear-gradient(135deg, ${color}50 0%, ${secondaryColor}40 100%)`,
            boxShadow: `0 0 15px ${color}40`,
          }}
        >
          <div className="animate-icon-float" style={{ color: 'white' }}>{icon}</div>
        </div>

        {/* Texto */}
        <span
          className="text-[11px] font-bold relative z-10 animate-text-glow"
          style={{ color: theme.text }}
        >
          {label}
        </span>

        <style>{`
          @keyframes gradient-border {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
          @keyframes aurora-1 {
            0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.7; }
            50% { transform: translate(5px, -3px) scale(1.1); opacity: 0.9; }
          }
          @keyframes aurora-2 {
            0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
            50% { transform: translate(-5px, 3px) scale(1.15); opacity: 0.7; }
          }
          @keyframes shine-sweep {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          @keyframes icon-glow {
            0%, 100% { box-shadow: 0 0 15px ${color}40; transform: scale(1); }
            50% { box-shadow: 0 0 25px ${color}60, 0 0 35px ${secondaryColor}30; transform: scale(1.08); }
          }
          @keyframes icon-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-2px); }
          }
          @keyframes text-glow {
            0%, 100% { text-shadow: 0 0 0 transparent; }
            50% { text-shadow: 0 0 8px ${color}50; }
          }
          @keyframes particle-1 {
            0%, 100% { transform: translate(0, 0); opacity: 0.8; }
            50% { transform: translate(6px, -8px); opacity: 0.3; }
          }
          @keyframes particle-2 {
            0%, 100% { transform: translate(0, 0); opacity: 0.6; }
            50% { transform: translate(-6px, 6px); opacity: 0.2; }
          }
          .animate-gradient-border { animation: gradient-border 3s ease-in-out infinite; }
          .animate-aurora-1 { animation: aurora-1 4s ease-in-out infinite; }
          .animate-aurora-2 { animation: aurora-2 5s ease-in-out infinite 0.5s; }
          .animate-shine-sweep { animation: shine-sweep 3s ease-in-out infinite; }
          .animate-icon-glow { animation: icon-glow 2s ease-in-out infinite; }
          .animate-icon-float { animation: icon-float 2s ease-in-out infinite; }
          .animate-text-glow { animation: text-glow 2s ease-in-out infinite; }
          .animate-particle-1 { animation: particle-1 3s ease-in-out infinite; }
          .animate-particle-2 { animation: particle-2 4s ease-in-out infinite 0.5s; }
          .animated-cta-btn:hover {
            box-shadow: 0 6px 25px ${color}35, 0 3px 12px ${secondaryColor}25;
          }
        `}</style>
      </button>
    );
  }

  // Versión normal sin animación
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-center ${compact ? 'gap-1 p-2' : 'gap-2 p-3'} rounded-xl transition-all hover:scale-105 active:scale-95 relative overflow-hidden`}
      style={{ backgroundColor: `${color}10`, border: `1px solid ${color}20` }}
    >
      <div
        className={`${compact ? 'w-9 h-9' : 'w-12 h-12'} rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 relative z-10`}
        style={{ backgroundColor: `${color}20` }}
      >
        <div style={{ color }}>{icon}</div>
      </div>
      <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-medium text-center leading-tight relative z-10`} style={{ color: theme.text }}>
        {label}
      </span>
    </button>
  );
}

// News Carousel Card - Carrusel horizontal con slide (todas las imágenes en fila)
/** Cómo viene la obra, en el idioma del vecino. */
const ESTADO_OBRA: Record<string, { label: string; tono: 'ok' | 'curso' | 'espera' }> = {
  terminada: { label: 'Terminada', tono: 'ok' },
  en_ejecucion: { label: 'En ejecución', tono: 'curso' },
  por_empezar: { label: 'Por empezar', tono: 'espera' },
};

/**
 * Una OBRA publicada. La diferencia con una novedad es el AVANCE: es lo que
 * el vecino quiere saber ("¿en qué anda?"), y por eso la barra es el centro
 * de la tarjeta. Sin avance cargado NO se dibuja barra — un 0% inventado
 * diría que la obra está frenada, que es otra cosa.
 */
function ObraCard({
  obra,
  theme,
}: {
  obra: ObraItem;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const est = ESTADO_OBRA[obra.estado_obra || ''] ?? null;
  const color =
    est?.tono === 'ok' ? 'var(--pl-green)'
    : est?.tono === 'curso' ? theme.primary
    : 'var(--pl-amber)';
  const avance = typeof obra.avance === 'number' ? Math.max(0, Math.min(100, obra.avance)) : null;

  return (
    <article
      className="rounded-xl overflow-hidden group"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="relative h-32">
        {obra.foto_url ? (
          <img
            src={obra.foto_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${theme.primary}25, ${theme.primary}08)` }}
          >
            <Hammer className="w-8 h-8" style={{ color: `${theme.primary}80` }} />
          </div>
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent 60%)' }}
        />
        {est && (
          <span
            className="absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
            style={{ backgroundColor: color, color: 'var(--pl-on-accent)' }}
          >
            {est.label}
          </span>
        )}
      </div>

      <div className="p-3">
        <h4 className="font-semibold text-sm leading-tight line-clamp-1" style={{ color: theme.text }}>
          {obra.nombre}
        </h4>
        {obra.descripcion && (
          <p className="text-xs leading-snug line-clamp-2 mt-0.5" style={{ color: theme.textSecondary }}>
            {obra.descripcion}
          </p>
        )}

        {avance !== null && (
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span style={{ color: theme.textSecondary }}>Avance</span>
              <span className="font-bold" style={{ color }}>{avance}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.backgroundSecondary }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${avance}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )}

        {obra.invertido && (
          <div className="mt-2 text-[11px]" style={{ color: theme.textSecondary }}>
            Invertido: <span className="font-semibold" style={{ color: theme.text }}>
              ${Number(obra.invertido).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

/** Peso visual del aviso. El color sale de tokens del tema, nunca de un hex
 *  suelto: la misma tarjeta tiene que funcionar en los 12 fondos. */
function estiloTipo(tipo: string, theme: ReturnType<typeof useTheme>['theme']) {
  if (tipo === 'alerta') return { label: 'Alerta', color: 'var(--pl-red)' };
  if (tipo === 'noticia') return { label: 'Noticia', color: theme.primary };
  return { label: 'Aviso', color: 'var(--pl-amber)' };
}

/** Chip chico sobre la foto: legible sobre cualquier imagen gracias al velo. */
function ChipNovedad({ texto, color, solido }: { texto: string; color: string; solido?: boolean }) {
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md backdrop-blur-sm"
      style={
        solido
          ? { backgroundColor: color, color: 'var(--pl-on-accent)' }
          : { backgroundColor: 'rgba(0,0,0,0.45)', color: '#fff', boxShadow: `inset 0 0 0 1px ${color}` }
      }
    >
      {texto}
    </span>
  );
}

/**
 * La novedad DESTACADA: la que el municipio fijó, a lo ancho y con la foto
 * grande. Antes todas las tarjetas pesaban lo mismo y el corte de agua de
 * mañana se leía igual que una noticia de hace diez días.
 */
function NovedadDestacada({
  noticia,
  theme,
}: {
  noticia: NoticiaItem;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const tipo = estiloTipo(noticia.tipo, theme);
  const urgencia = urgenciaDe(noticia);

  return (
    <article
      className="relative rounded-2xl overflow-hidden group"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="relative h-52 md:h-64">
        {noticia.imagen ? (
          <img
            src={noticia.imagen}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${theme.primary}30, ${theme.primary}08)` }}
          >
            <Newspaper className="w-12 h-12" style={{ color: `${theme.primary}80` }} />
          </div>
        )}

        {/* Velo: garantiza contraste del texto sobre CUALQUIER foto. */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 45%, transparent 75%)' }}
        />

        <div className="absolute top-3 left-3 flex items-center gap-2">
          <ChipNovedad texto={tipo.label} color={tipo.color} solido />
          {noticia.fijado && <ChipNovedad texto="Destacado" color={tipo.color} />}
        </div>

        {urgencia && (
          <div className="absolute top-3 right-3">
            <ChipNovedad
              texto={urgencia.texto}
              color={urgencia.fuerte ? 'var(--pl-red)' : 'var(--pl-amber)'}
              solido={urgencia.fuerte}
            />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
          <h3 className="text-white font-bold text-lg md:text-xl leading-tight mb-1.5">
            {noticia.titulo}
          </h3>
          <p className="text-white/80 text-sm leading-snug line-clamp-2 max-w-2xl">
            {noticia.descripcion}
          </p>
          <div className="flex items-center gap-1.5 mt-2.5 text-white/60 text-xs">
            <Clock className="w-3.5 h-3.5" />
            {noticia.fecha}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Las demás novedades: foto chica a la izquierda y el texto al lado. Entra
 *  el triple de información en la misma altura que una tarjeta de antes. */
function NovedadCompacta({
  noticia,
  theme,
}: {
  noticia: NoticiaItem;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const tipo = estiloTipo(noticia.tipo, theme);
  const urgencia = urgenciaDe(noticia);

  return (
    <article
      className="rounded-xl overflow-hidden flex gap-3 p-2.5 transition-colors"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: theme.backgroundSecondary }}>
        {noticia.imagen ? (
          <img src={noticia.imagen} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Newspaper className="w-6 h-6" style={{ color: `${theme.primary}70` }} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: tipo.color }}>
            {tipo.label}
          </span>
          {urgencia && (
            <span
              className="text-[10px] font-semibold"
              style={{ color: urgencia.fuerte ? 'var(--pl-red)' : theme.textSecondary }}
            >
              · {urgencia.texto}
            </span>
          )}
        </div>
        <h4 className="font-semibold text-sm leading-tight line-clamp-1" style={{ color: theme.text }}>
          {noticia.titulo}
        </h4>
        <p className="text-xs leading-snug line-clamp-2 mt-0.5" style={{ color: theme.textSecondary }}>
          {noticia.descripcion}
        </p>
        <div className="flex items-center gap-1 mt-1.5 text-[11px]" style={{ color: theme.textSecondary }}>
          <Clock className="w-3 h-3" />
          {noticia.fecha}
        </div>
      </div>
    </article>
  );
}


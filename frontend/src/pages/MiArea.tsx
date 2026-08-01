/**
 * MiArea — el tablero de una SECRETARÍA o DIRECCIÓN (rol supervisor).
 *
 * Es el dashboard del admin pero acotado a un área: mismas piezas, mismo
 * idioma, los datos de su dependencia. Antes esta pantalla había quedado con
 * la interfaz vieja —tarjetas con colores fijos, textos cortados, un banner
 * con foto genérica— mientras el circuito del admin ya estaba en el v2, así
 * que entrar como secretaría parecía otra aplicación.
 *
 * Estructura del estándar v2:
 *   1. HeroBannerV2  — de quién es el tablero, con sus números al pie.
 *   2. SemanticHero  — la frase que dice QUÉ HACER HOY, con los números
 *                      coloreados por veredicto y las acciones de cada frase.
 *   3. Accesos       — a dónde ir, con los tonos del tema (no una paleta ajena).
 *
 * Todo el color sale del theme activo: ninguna marca ni municipio necesita su
 * propio hardcodeo.
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, FileCheck, Map, BarChart3, Compass } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dashboardApi } from '../lib/api';
import { HeroBannerV2, type HeroStripKpi } from '../components/dashboard/HeroBannerV2';
import { SectionTitleV2 } from '../components/dashboard/SectionTitleV2';
import { SemanticHero } from '../components/ui/SemanticHero';
import { seg, type HeroFrase } from '../lib/semanticHero';
import { resolverUmbrales, veredictoTasa, veredictoMasEsPeor } from '../lib/veredictos';
import { ChartSkeleton } from '../components/ui/Skeleton';

interface StatsArea {
  total: number;
  nuevos: number;
  enCurso: number;
  resueltos: number;
  pendientes: number;
}

const VACIO: StatsArea = { total: 0, nuevos: 0, enCurso: 0, resueltos: 0, pendientes: 0 };

/** Estados que NO cuentan como abiertos (mismo criterio que el dashboard). */
const CERRADOS = new Set(['finalizado', 'rechazado', 'resuelto']);

export default function MiArea() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reclamos, setReclamos] = useState<StatsArea>(VACIO);
  const [tramites, setTramites] = useState<StatsArea | null>(null);

  useEffect(() => {
    const cargar = async () => {
      if (!user?.dependencia) return;
      setLoading(true);
      try {
        // El backend ya filtra por la dependencia del usuario logueado.
        const [conteoRes, tramRes] = await Promise.all([
          dashboardApi.getConteoEstados(),
          // Antes los trámites del área estaban FIJOS EN CERO en el código, así
          // que la pantalla mostraba "0 pendientes" para siempre. Ahora se piden.
          dashboardApi.getTramitesStats().catch(() => null),
        ]);

        const conteo = (conteoRes.data || []) as Array<{ estado: string; cantidad: number }>;
        const r = { ...VACIO };
        conteo.forEach(({ estado, cantidad }) => {
          r.total += cantidad;
          if (estado === 'nuevo' || estado === 'recibido') r.nuevos += cantidad;
          if (estado === 'en_curso') r.enCurso += cantidad;
          if (CERRADOS.has(estado) && estado !== 'rechazado') r.resueltos += cantidad;
        });
        r.pendientes = r.total - r.resueltos;
        setReclamos(r);

        const t = tramRes?.data;
        if (t?.por_estado) {
          const porEstado = t.por_estado as Record<string, number>;
          const abiertos = Object.entries(porEstado).reduce(
            (acc, [estado, n]) => (CERRADOS.has(estado) ? acc : acc + n), 0);
          const cerrados = Object.entries(porEstado).reduce(
            (acc, [estado, n]) => (estado === 'finalizado' ? acc + n : acc), 0);
          setTramites({
            total: t.total ?? 0,
            nuevos: t.hoy ?? 0,
            enCurso: abiertos,
            resueltos: cerrados,
            pendientes: abiertos,
          });
        }
      } catch (error) {
        console.error('Error cargando el tablero del área:', error);
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [user?.dependencia]);

  const tasa = reclamos.total > 0 ? Math.round((reclamos.resueltos / reclamos.total) * 100) : 0;

  /** Las frases del área, con sus números veredictados. */
  const frases = useMemo<HeroFrase[]>(() => {
    const u = resolverUmbrales();
    const lista: HeroFrase[] = [];

    if (reclamos.total > 0) {
      lista.push({
        segmentos: [
          seg('El área tiene '),
          seg(
            `${reclamos.pendientes} ${reclamos.pendientes === 1 ? 'reclamo abierto' : 'reclamos abiertos'}`,
            veredictoMasEsPeor(reclamos.pendientes, u.sinAsignar),
          ),
          seg(', de los cuales '),
          seg(`${reclamos.enCurso} ya están en curso`, reclamos.enCurso > 0 ? 'bueno' : undefined),
          seg('.'),
        ],
        acciones: [
          { label: 'Ver los reclamos', to: '/gestion/reclamos-area', primaria: true },
          { label: 'Ver en el mapa', to: '/gestion/mapa' },
        ],
      });

      lista.push({
        segmentos: [
          seg('Resolvieron el '),
          seg(`${tasa}%`, veredictoTasa(tasa, u.tasaResolucion)),
          seg(' de lo que les llegó: '),
          seg(`${reclamos.resueltos} cerrados`, 'bueno'),
          seg(` sobre ${reclamos.total}.`),
        ],
        acciones: [{ label: 'Ver el rendimiento', to: '/gestion/estadisticas-area', primaria: true }],
      });
    }

    if (tramites && tramites.total > 0) {
      lista.push({
        segmentos: [
          seg('En trámites hay '),
          seg(
            `${tramites.pendientes} en curso`,
            veredictoMasEsPeor(tramites.pendientes, u.sinAsignar),
          ),
          seg(` sobre ${tramites.total} del área.`),
        ],
        acciones: [{ label: 'Ver los trámites', to: '/gestion/tramites-area', primaria: true }],
      });
    }

    return lista;
  }, [reclamos, tramites, tasa]);

  /** Los números al pie del banner. Cortos, porque en celular van en una fila. */
  const kpis = useMemo<HeroStripKpi[]>(() => {
    const base: HeroStripKpi[] = [
      { etiqueta: 'Reclamos abiertos', etiquetaCorta: 'Abiertos', valor: reclamos.pendientes },
      { etiqueta: 'En curso', etiquetaCorta: 'En curso', valor: reclamos.enCurso },
      { etiqueta: 'Resueltos', etiquetaCorta: 'Resueltos', valor: reclamos.resueltos },
      { etiqueta: 'Tasa de resolución', etiquetaCorta: 'Tasa', valor: `${tasa}%`, amber: tasa < 60 },
    ];
    // El bloque de trámites sólo aparece si el área tiene trámites: mostrar
    // una tarjeta en cero sería decir que no funcionan cuando ni siquiera
    // manejan trámites.
    if (tramites && tramites.total > 0) {
      base.push({ etiqueta: 'Trámites del área', etiquetaCorta: 'Trámites', valor: tramites.total });
    }
    return base;
  }, [reclamos, tasa, tramites]);

  if (!user?.dependencia) {
    return (
      <div className="dv2-page">
        <p className="dv2-vacio">Todavía no tenés un área asignada. Pedíselo al administrador del municipio.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dv2-page">
        <ChartSkeleton />
      </div>
    );
  }

  const accesos = [
    { titulo: 'Reclamos', sub: `${reclamos.pendientes} sin cerrar`, icono: ClipboardList, to: '/gestion/reclamos-area' },
    ...(tramites && tramites.total > 0
      ? [{ titulo: 'Trámites', sub: `${tramites.pendientes} en curso`, icono: FileCheck, to: '/gestion/tramites-area' }]
      : []),
    { titulo: 'Mapa', sub: 'Dónde se concentran', icono: Map, to: '/gestion/mapa' },
    { titulo: 'Rendimiento', sub: 'Cómo viene el área', icono: BarChart3, to: '/gestion/estadisticas-area' },
  ];

  return (
    <div className="dv2-page">
      <HeroBannerV2
        eyebrow="Mi área · vista del equipo"
        titulo={user.dependencia.nombre}
        sub="Todo lo que le llegó a tu área, en un solo tablero."
        kpis={kpis}
      />

      <SemanticHero etiqueta={`HOY EN ${user.dependencia.nombre.toUpperCase()}`} frases={frases} />

      <SectionTitleV2 icon={Compass} label="Accesos" />
      <div className="dv2-grid-kpi">
        {accesos.map((a) => {
          const Icono = a.icono;
          return (
            <button
              key={a.to}
              type="button"
              className="dv2-card dv2-acceso"
              onClick={() => navigate(a.to)}
            >
              <Icono className="dv2-acceso-icono" aria-hidden="true" />
              <span className="dv2-acceso-titulo">{a.titulo}</span>
              <span className="dv2-acceso-sub">{a.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

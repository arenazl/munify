import { useEffect, useState } from 'react';
import { Loader2, Check, Sparkles } from 'lucide-react';

/**
 * Progress bar cosmético para el flujo de crear-demo.
 *
 * El backend tarda ~18-20s procesando el seed (muchos INSERTs con
 * latencia de DB). Esta barra simula fases con duraciones calibradas
 * en base a los timings reales del endpoint para que el usuario
 * sienta progreso granular.
 *
 * Si el request termina antes que la animación, el componente salta a
 * 100% de inmediato (controlado por el prop `done`). Si la animación
 * termina antes que el request, se queda en 95% hasta que llegue la
 * respuesta.
 */

interface Phase {
  label: string;
  durationMs: number;
}

// Fases calibradas contra los timings reales del backend:
// password_hash + deps: 2s | mapeo: 2s | tramites: 3s | usuarios+zonas+barrios: 4s
// empleados+cuadrillas: 4s | sla: 1s | reclamos+solicitud: 3s | pad: 1s
const PHASES: Phase[] = [
  { label: 'Creando tu municipio...',            durationMs: 2000 },
  { label: 'Configurando dependencias...',       durationMs: 2500 },
  { label: 'Cargando trámites y categorías...',  durationMs: 3000 },
  { label: 'Preparando zonas y barrios...',      durationMs: 3000 },
  { label: 'Armando equipo de trabajo...',       durationMs: 3500 },
  { label: 'Definiendo tiempos de respuesta...', durationMs: 1500 },
  { label: 'Generando reclamos de ejemplo...',   durationMs: 2500 },
  { label: '¡Casi listo!',                       durationMs: 1000 },
];

interface DemoCreationProgressProps {
  /**
   * Cuando pasa a true, la barra termina en 100% y se muestra el check.
   * Usar cuando llegue la respuesta del backend.
   */
  done: boolean;
  /**
   * Nombre del municipio que se está creando — para mostrarlo en el hero.
   */
  municipioNombre: string;
}

export default function DemoCreationProgress({ done, municipioNombre }: DemoCreationProgressProps) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (done) {
      setProgress(100);
      setPhaseIdx(PHASES.length - 1);
      return;
    }

    // Total simulado (para interpolar el progress en %)
    const totalMs = PHASES.reduce((acc, p) => acc + p.durationMs, 0);
    let elapsed = 0;
    let currentIdx = 0;
    let phaseStartedAt = Date.now();

    const interval = setInterval(() => {
      elapsed = Date.now() - phaseStartedAt;
      // Progreso acumulado de fases anteriores + lo que llevamos de la actual
      const accumulated = PHASES.slice(0, currentIdx).reduce((acc, p) => acc + p.durationMs, 0);
      const currentPhaseProgress = Math.min(elapsed, PHASES[currentIdx].durationMs);
      // Cap al 95% para que no llegue al 100 hasta que `done=true`
      const pct = Math.min(95, ((accumulated + currentPhaseProgress) / totalMs) * 100);
      setProgress(pct);

      // Cambiar de fase si se cumplió el tiempo
      if (elapsed >= PHASES[currentIdx].durationMs && currentIdx < PHASES.length - 1) {
        currentIdx += 1;
        setPhaseIdx(currentIdx);
        phaseStartedAt = Date.now();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [done]);

  const currentPhase = PHASES[phaseIdx];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 animate-in zoom-in-95 duration-300">
        {/* Hero */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
            <Sparkles className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
              Creando demo
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1 truncate">
            {municipioNombre || 'Tu municipio'}
          </h2>
          <p className="text-sm text-slate-500">
            Armamos todo automáticamente, aguantá unos segundos
          </p>
        </div>

        {/* Barra de progreso */}
        <div className="mb-4">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-400 font-mono">{Math.round(progress)}%</span>
            <span className="text-xs text-slate-500">
              {done ? 'Listo!' : `Paso ${phaseIdx + 1} de ${PHASES.length}`}
            </span>
          </div>
        </div>

        {/* Fase actual */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
          {done ? (
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <Check className="h-5 w-5 text-white" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
            </div>
          )}
          <span className="text-sm font-medium text-slate-700">
            {done ? 'Redirigiendo a tu demo...' : currentPhase.label}
          </span>
        </div>
      </div>
    </div>
  );
}

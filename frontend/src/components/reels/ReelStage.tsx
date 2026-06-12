// ============================================================
// Motor de reels Munify — lienzo vertical 9:16 que rota "escenas" con
// auto-play, count-up y transiciones. Pensado para grabar a mp4
// (Facebook/Instagram Reels). Cero librería de slides.
//
// Patrón heredado de DashboardLive.tsx: useCountUp + setInterval de
// progreso + key por escena para reiniciar animaciones.
// ============================================================
import { useEffect, useState, type ReactNode } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { BRAND, FONT_DISPLAY, FONT_SANS, GLOW_BG, FONTS_HREF } from './reelBrand';
import { MunifyMark } from './ReelMockups';

// ---- Modelo de escena ----
export type Scene =
  | { kind: 'hook'; ms?: number; eyebrow?: string; lines: string[]; accentWord?: string }
  | { kind: 'feature'; ms?: number; mockup: ReactNode; chip: string; title: string; desc: string; accent: string }
  | { kind: 'stat'; ms?: number; value: number; prefix?: string; suffix?: string; label: string; sub?: string; accent: string }
  | { kind: 'split'; ms?: number; beforeTitle?: string; before: string[]; afterTitle?: string; after: string[]; accent: string }
  | { kind: 'cta'; ms?: number; line: string; accentWord?: string; sub?: string };

export interface Reel {
  id: string;
  nombre: string;
  desc: string;
  accent: string;
  scenes: Scene[];
}

const DEFAULT_MS: Record<Scene['kind'], number> = {
  hook: 2800, feature: 3200, stat: 3000, split: 3600, cta: 3600,
};
export const sceneMs = (s: Scene) => s.ms ?? DEFAULT_MS[s.kind];
export const reelDurationMs = (r: Reel) => r.scenes.reduce((sum, s) => sum + sceneMs(s), 0);

// Hook: cuenta de 0 al target con ease-out (idéntico a DashboardLive)
function useCountUp(target: number, durationMs = 1500): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

// ============================================================
// Stage
// ============================================================
interface ReelStageProps {
  reel: Reel;
  /** modo grabación: oculta controles y deja solo el lienzo 9:16 sobre negro */
  clean?: boolean;
  /** alto del lienzo en px (default: se ajusta al viewport) */
  height?: number;
  loop?: boolean;
}

export default function ReelStage({ reel, clean = false, height, loop = true }: ReelStageProps) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [restartKey, setRestartKey] = useState(0);

  const scenes = reel.scenes;
  const scene = scenes[idx] ?? scenes[0];

  // Reset al cambiar de reel
  useEffect(() => { setIdx(0); setProgress(0); setPaused(false); setRestartKey((k) => k + 1); }, [reel.id]);

  // Auto-avance + progreso (un solo interval, tick 50ms)
  useEffect(() => {
    if (paused) return;
    setProgress(0);
    const tickMs = 50;
    const total = sceneMs(scene) / tickMs;
    let cur = 0;
    const id = setInterval(() => {
      cur++;
      setProgress((cur / total) * 100);
      if (cur >= total) {
        setIdx((s) => {
          const next = s + 1;
          if (next >= scenes.length) return loop ? 0 : s;
          return next;
        });
        cur = 0;
      }
    }, tickMs);
    return () => clearInterval(id);
  }, [idx, paused, scenes.length, loop, scene, restartKey]);

  // Tamaño del lienzo: 9:16 ajustado a la altura disponible
  const H = height ?? (typeof window !== 'undefined' ? Math.min(window.innerHeight - (clean ? 0 : 180), 880) : 760);
  const W = H * (9 / 16);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: clean ? 0 : 16 }}>
      <div
        style={{
          position: 'relative', width: W, height: H, borderRadius: clean ? 0 : 28, overflow: 'hidden',
          background: BRAND.ink, fontFamily: FONT_SANS,
          boxShadow: clean ? 'none' : '0 40px 120px -30px rgba(0,0,0,0.8)',
        }}
      >
        <style>{`
          @import url('${FONTS_HREF}');
          @keyframes reelIn { 0% { opacity: 0; transform: translateY(28px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
          @keyframes reelPop { 0% { opacity: 0; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1); } }
          @keyframes reelMock { 0% { opacity: 0; transform: translateY(40px) scale(0.92) rotate(-2deg); } 100% { opacity: 1; transform: translateY(0) scale(1) rotate(-3deg); } }
          @keyframes reelGlow { 0%,100% { opacity: 0.9; } 50% { opacity: 1; } }
          @keyframes reelFloat { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-10px) rotate(-2deg); } }
          .reel-in { animation: reelIn 700ms cubic-bezier(0.16,1,0.3,1) both; }
          .reel-pop { animation: reelPop 600ms cubic-bezier(0.16,1,0.3,1) both; }
          .reel-mock { animation: reelMock 800ms cubic-bezier(0.16,1,0.3,1) both, reelFloat 5s ease-in-out 0.8s infinite; }
        `}</style>

        {/* Glow de marca */}
        <div style={{ position: 'absolute', inset: 0, background: GLOW_BG }} />
        {/* Acento del reel arriba */}
        <div style={{ position: 'absolute', top: -120, right: -80, width: 360, height: 360, borderRadius: 999, background: `radial-gradient(circle, ${reel.accent}33, transparent 65%)`, filter: 'blur(10px)' }} />

        {/* Barra de progreso (segmentos por escena) */}
        <div style={{ position: 'absolute', top: 14, left: 18, right: 18, display: 'flex', gap: 5, zIndex: 5 }}>
          {scenes.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3.5, borderRadius: 99, background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, background: '#fff', width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%', transition: i === idx ? 'width 60ms linear' : 'none' }} />
            </div>
          ))}
        </div>

        {/* Logo */}
        <div style={{ position: 'absolute', top: 34, left: 26, display: 'flex', alignItems: 'center', gap: 9, zIndex: 5 }}>
          <MunifyMark size={24} />
          <span style={{ fontFamily: FONT_DISPLAY, fontStyle: 'normal', fontWeight: 600, fontSize: 21, color: '#fff', letterSpacing: '-0.01em' }}>Munify</span>
        </div>

        {/* Escena (key → reinicia animaciones y count-up) */}
        <div key={`${reel.id}-${idx}-${restartKey}`} style={{ position: 'absolute', inset: 0, paddingTop: 78, paddingBottom: 70 }}>
          <SceneView scene={scene} reelAccent={reel.accent} />
        </div>

        {/* Footer marca */}
        <div style={{ position: 'absolute', bottom: 26, left: 0, right: 0, textAlign: 'center', zIndex: 5 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.04em' }}>munify.com.ar</span>
        </div>
      </div>

      {/* Controles (ocultos en modo grabación) */}
      {!clean && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Ctrl onClick={() => setPaused((p) => !p)}>{paused ? <Play size={18} /> : <Pause size={18} />}</Ctrl>
          <Ctrl onClick={() => { setIdx(0); setProgress(0); setRestartKey((k) => k + 1); }}><RotateCcw size={18} /></Ctrl>
          <span style={{ fontSize: 13, color: '#8C948F', fontWeight: 600 }}>Escena {idx + 1}/{scenes.length}</span>
        </div>
      )}
    </div>
  );
}

function Ctrl({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: 40, height: 40, borderRadius: 12, border: 'none', background: BRAND.ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {children}
    </button>
  );
}

// ============================================================
// Renderers de escena
// ============================================================
function SceneView({ scene, reelAccent }: { scene: Scene; reelAccent: string }) {
  switch (scene.kind) {
    case 'hook': return <HookScene s={scene} />;
    case 'feature': return <FeatureScene s={scene} />;
    case 'stat': return <StatScene s={scene} />;
    case 'split': return <SplitScene s={scene} />;
    case 'cta': return <CtaScene s={scene} accent={reelAccent} />;
  }
}

const PAD = 40;

function HookScene({ s }: { s: Extract<Scene, { kind: 'hook' }> }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: PAD }}>
      {s.eyebrow && (
        <div className="reel-pop" style={{ alignSelf: 'flex-start', fontSize: 14, fontWeight: 800, letterSpacing: '0.22em', color: BRAND.gold, textTransform: 'uppercase', marginBottom: 22, padding: '7px 15px', border: `1px solid ${BRAND.gold}55`, borderRadius: 999 }}>{s.eyebrow}</div>
      )}
      <h1 className="reel-in" style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, color: '#fff', fontSize: 60, lineHeight: 1.02, letterSpacing: '-0.02em', margin: 0 }}>
        {s.lines.map((l, i) => <span key={i} style={{ display: 'block' }}>{l}</span>)}
        {s.accentWord && <span style={{ display: 'block', color: BRAND.gold }}>{s.accentWord}</span>}
      </h1>
    </div>
  );
}

function FeatureScene({ s }: { s: Extract<Scene, { kind: 'feature' }> }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: PAD, gap: 30 }}>
      <div className="reel-mock" style={{ filter: `drop-shadow(0 20px 50px ${s.accent}40)` }}>{s.mockup}</div>
      <div className="reel-in" style={{ textAlign: 'center', maxWidth: '92%' }}>
        <div style={{ display: 'inline-block', fontSize: 13, fontWeight: 800, letterSpacing: '0.16em', color: s.accent, textTransform: 'uppercase', padding: '6px 14px', borderRadius: 999, background: `${s.accent}1f`, marginBottom: 16 }}>{s.chip}</div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, color: '#fff', fontSize: 40, lineHeight: 1.05, margin: '0 0 12px', letterSpacing: '-0.015em' }}>{s.title}</h2>
        <p style={{ fontSize: 19, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45, margin: 0, fontWeight: 400 }}>{s.desc}</p>
      </div>
    </div>
  );
}

function StatScene({ s }: { s: Extract<Scene, { kind: 'stat' }> }) {
  const v = useCountUp(s.value, 1600);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: PAD, textAlign: 'center' }}>
      <div className="reel-pop" style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 130, lineHeight: 0.9, letterSpacing: '-0.04em', color: '#fff', display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
        {s.prefix && <span style={{ fontSize: 64, color: s.accent }}>{s.prefix}</span>}
        <span style={{ background: `linear-gradient(135deg,#fff,${s.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: `drop-shadow(0 6px 24px ${s.accent}66)` }}>{v.toLocaleString('es-AR')}</span>
        {s.suffix && <span style={{ fontSize: 64, color: s.accent }}>{s.suffix}</span>}
      </div>
      <h2 className="reel-in" style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, color: '#fff', fontSize: 36, lineHeight: 1.1, margin: '24px 0 8px', maxWidth: '90%', letterSpacing: '-0.015em' }}>{s.label}</h2>
      {s.sub && <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)', margin: 0 }}>{s.sub}</p>}
    </div>
  );
}

function SplitScene({ s }: { s: Extract<Scene, { kind: 'split' }> }) {
  const cols: { title: string; items: string[]; bad?: boolean }[] = [
    { title: s.beforeTitle ?? 'Antes', items: s.before, bad: true },
    { title: s.afterTitle ?? 'Con Munify', items: s.after },
  ];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: PAD, gap: 18 }}>
      {cols.map((c, i) => (
        <div key={i} className="reel-in" style={{ animationDelay: `${i * 160}ms`, borderRadius: 20, padding: 24, background: c.bad ? 'rgba(229,72,77,0.10)' : `${s.accent}18`, border: `1px solid ${c.bad ? 'rgba(229,72,77,0.35)' : s.accent + '55'}` }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.bad ? '#E5484D' : s.accent, marginBottom: 14 }}>{c.title}</div>
          {c.items.map((it, j) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: j < c.items.length - 1 ? 11 : 0 }}>
              <span style={{ fontSize: 22, lineHeight: 1, color: c.bad ? '#E5484D' : s.accent }}>{c.bad ? '✕' : '✓'}</span>
              <span style={{ fontSize: 21, color: '#fff', fontWeight: 500 }}>{it}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CtaScene({ s, accent }: { s: Extract<Scene, { kind: 'cta' }>; accent: string }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: PAD, textAlign: 'center', gap: 26 }}>
      <div className="reel-pop"><MunifyMark size={84} /></div>
      <h2 className="reel-in" style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, color: '#fff', fontSize: 52, lineHeight: 1.02, margin: 0, letterSpacing: '-0.02em' }}>
        {s.line} {s.accentWord && <span style={{ color: BRAND.gold }}>{s.accentWord}</span>}
      </h2>
      {s.sub && (
        <div className="reel-in" style={{ animationDelay: '160ms', marginTop: 6, fontSize: 20, color: BRAND.ink, fontWeight: 700, background: BRAND.gold, padding: '14px 30px', borderRadius: 999, boxShadow: `0 16px 40px ${BRAND.gold}55` }}>{s.sub}</div>
      )}
    </div>
  );
}

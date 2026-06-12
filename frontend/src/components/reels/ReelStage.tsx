// ============================================================
// Motor de reels Munify — lienzo BASE fijo 1080x1920 (9:16) escalado.
// Todo el contenido se diseña en coordenadas 1080x1920 y se escala con
// transform al tamaño objetivo. Así el preview (chico) y el mp4 (1080x1920
// nativo) se ven IDÉNTICOS y bien proporcionados, sin franjas vacías.
//
// Patrón heredado de DashboardLive.tsx: useCountUp + setInterval de
// progreso + key por escena para reiniciar animaciones.
// ============================================================
import { useEffect, useState, type ReactNode } from 'react';
import { BRAND, FONT_DISPLAY, FONT_SANS, GLOW_BG, FONTS_HREF } from './reelBrand';
import { MunifyMark } from './ReelMockups';

// Lienzo de export (Facebook / Instagram Reels)
const BASE_W = 1080;
const BASE_H = 1920;

// ---- Modelo de escena ----
export type Scene =
  | { kind: 'hook'; ms?: number; eyebrow?: string; lines: string[]; accentWord?: string }
  | { kind: 'feature'; ms?: number; mockup: ReactNode; chip: string; title: string; desc: string; accent: string; scale?: number }
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
  hook: 2600, feature: 2900, stat: 2800, split: 3200, cta: 3200,
};
export const sceneMs = (s: Scene) => s.ms ?? DEFAULT_MS[s.kind];
export const reelDurationMs = (r: Reel) => r.scenes.reduce((sum, s) => sum + sceneMs(s), 0);

// Escala de tiempo para captura en cámara lenta (count-up + avance de escena).
// Las animaciones CSS se enlentecen aparte vía CDP Animation.setPlaybackRate.
// Capturar lento = más frames distintos → al acelerar en ffmpeg, 60fps fluidos.
let TIME_SCALE = 1;
export function setReelTimeScale(s: number) { TIME_SCALE = Math.max(1, s || 1); }

// Hook: cuenta de 0 al target con ease-out (idéntico a DashboardLive)
function useCountUp(target: number, durationMs = 1500): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) return;
    // El inicio se toma del MISMO reloj que el `now` de RAF (no performance.now),
    // así si CDP enlentece el reloj de animación (captura), el count-up se enlentece
    // solo y queda en sync con las animaciones CSS. Sin esto, los relojes divergen
    // y t se vuelve negativo → número corrupto.
    let startTs: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      if (startTs === null) startTs = now;
      const t = Math.min(1, (now - startTs) / durationMs);
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
  /** modo grabación / captura: sin bordes redondeados ni sombra */
  clean?: boolean;
  /** alto objetivo en px (el ancho se deriva 9:16). Default: ajustado al viewport */
  height?: number;
  loop?: boolean;
}

export default function ReelStage({ reel, clean = false, height, loop = true }: ReelStageProps) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [restartKey, setRestartKey] = useState(0);

  const scenes = reel.scenes;
  const scene = scenes[idx] ?? scenes[0];

  useEffect(() => { setIdx(0); setProgress(0); setRestartKey((k) => k + 1); }, [reel.id]);

  // Auto-avance + progreso (tick 50ms)
  useEffect(() => {
    setProgress(0);
    const tickMs = 50;
    const total = (sceneMs(scene) * TIME_SCALE) / tickMs;
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
  }, [idx, scenes.length, loop, scene, restartKey]);

  // Tamaño objetivo: alto dado (o ajustado al viewport) → escala del lienzo base
  const targetH = height ?? (typeof window !== 'undefined' ? Math.min(window.innerHeight - 210, 920) : 820);
  const scale = targetH / BASE_H;
  const targetW = BASE_W * scale;

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          position: 'relative', width: targetW, height: targetH, overflow: 'hidden',
          borderRadius: clean ? 0 : 28, background: BRAND.ink,
          boxShadow: clean ? 'none' : '0 40px 120px -30px rgba(0,0,0,0.8)',
        }}
      >
        {/* Lienzo base 1080x1920 escalado */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: BASE_W, height: BASE_H, transform: `scale(${scale})`, transformOrigin: 'top left', fontFamily: FONT_SANS }}>
          <style>{`
            @import url('${FONTS_HREF}');
            @keyframes reelRise { 0% { opacity: 0; transform: translateY(46px); } 100% { opacity: 1; transform: translateY(0); } }
            @keyframes reelPop { 0% { opacity: 0; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1); } }
            @keyframes reelMock { 0% { opacity: 0; transform: translateY(70px) scale(0.92); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
            @keyframes reelFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-16px); } }
            @keyframes reelKen { 0% { transform: scale(1); } 100% { transform: scale(1.06); } }
            @keyframes reelUnderline { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
            @keyframes reelDrift1 { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(60px,-46px) scale(1.14); } 66% { transform: translate(-48px,40px) scale(0.92); } }
            @keyframes reelDrift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-64px,50px) scale(1.18); } }
            @keyframes reelParticle { 0%,100% { transform: translateY(0); opacity: 0.25; } 50% { transform: translateY(-50px); opacity: 0.75; } }
            @keyframes reelPulse { 0%,100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 1; transform: scale(1.12); } }
            .reel-rise { animation: reelRise 680ms cubic-bezier(0.16,1,0.3,1) both; }
            .reel-pop { animation: reelPop 620ms cubic-bezier(0.16,1,0.3,1) both; }
            .reel-mock { animation: reelMock 840ms cubic-bezier(0.16,1,0.3,1) both, reelFloat 5s ease-in-out 0.9s infinite; }
            .reel-ken { animation: reelKen 6s ease-in-out infinite alternate; }
          `}</style>

          {/* Glow de marca + fondo vivo */}
          <div style={{ position: 'absolute', inset: 0, background: GLOW_BG }} />
          <AnimatedBG accent={reel.accent} />

          {/* Progreso por escena */}
          <div style={{ position: 'absolute', top: 30, left: 44, right: 44, display: 'flex', gap: 8, zIndex: 5 }}>
            {scenes.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, background: '#fff', width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%', transition: i === idx ? 'width 60ms linear' : 'none' }} />
              </div>
            ))}
          </div>

          {/* Logo — grande y centrado arriba */}
          <div style={{ position: 'absolute', top: 78, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 5 }}>
            <MunifyMark size={74} />
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 64, color: '#fff', letterSpacing: '-0.01em' }}>Munify</span>
          </div>

          {/* Escena (key → reinicia animaciones y count-up) */}
          <div key={`${reel.id}-${idx}-${restartKey}`} style={{ position: 'absolute', inset: 0, paddingTop: 210, paddingBottom: 140 }}>
            <SceneView scene={scene} />
          </div>

          {/* Footer marca */}
          <div style={{ position: 'absolute', bottom: 54, left: 0, right: 0, textAlign: 'center', zIndex: 5 }}>
            <span style={{ fontSize: 26, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.05em' }}>munify.com.ar</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Fondo animado: blobs que driftean + partículas (coords 1080x1920)
function AnimatedBG({ accent }: { accent: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: '-10%', right: '-16%', width: '70%', height: '32%', borderRadius: 999, background: `radial-gradient(circle, ${accent}40, transparent 68%)`, filter: 'blur(30px)', animation: 'reelDrift1 16s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '-8%', left: '-18%', width: '74%', height: '34%', borderRadius: 999, background: `radial-gradient(circle, ${BRAND.azure}33, transparent 68%)`, filter: 'blur(34px)', animation: 'reelDrift2 21s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', top: '44%', left: '26%', width: '56%', height: '26%', borderRadius: 999, background: `radial-gradient(circle, ${BRAND.gold}22, transparent 70%)`, filter: 'blur(40px)', animation: 'reelDrift1 26s ease-in-out infinite reverse' }} />
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} style={{ position: 'absolute', top: `${(i * 7 + 6) % 92}%`, left: `${(i * 15 + 6) % 94}%`, width: 10, height: 10, borderRadius: 999, background: i % 3 === 0 ? accent : i % 3 === 1 ? BRAND.gold : '#fff', opacity: 0.5, boxShadow: '0 0 14px currentColor', animation: `reelParticle ${5 + (i % 4)}s ease-in-out ${i * 0.35}s infinite` }} />
      ))}
    </div>
  );
}

// ============================================================
// Renderers de escena (coords 1080x1920)
// ============================================================
function SceneView({ scene }: { scene: Scene }) {
  switch (scene.kind) {
    case 'hook': return <HookScene s={scene} />;
    case 'feature': return <FeatureScene s={scene} />;
    case 'stat': return <StatScene s={scene} />;
    case 'split': return <SplitScene s={scene} />;
    case 'cta': return <CtaScene s={scene} />;
  }
}

const PAD = 84;

function HookScene({ s }: { s: Extract<Scene, { kind: 'hook' }> }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: PAD }}>
      {s.eyebrow && (
        <div className="reel-pop" style={{ alignSelf: 'flex-start', fontSize: 26, fontWeight: 800, letterSpacing: '0.24em', color: BRAND.gold, textTransform: 'uppercase', marginBottom: 42, padding: '13px 28px', border: `2px solid ${BRAND.gold}55`, borderRadius: 999 }}>{s.eyebrow}</div>
      )}
      <h1 style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, color: '#fff', fontSize: 128, lineHeight: 1.0, letterSpacing: '-0.02em', margin: 0 }}>
        {s.lines.map((l, i) => <span key={i} className="reel-rise" style={{ display: 'block', animationDelay: `${i * 150}ms` }}>{l}</span>)}
        {s.accentWord && (
          <span className="reel-rise" style={{ display: 'block', color: BRAND.gold, position: 'relative', width: 'fit-content', animationDelay: `${s.lines.length * 150}ms` }}>
            {s.accentWord}
            <span style={{ position: 'absolute', left: 0, bottom: 6, height: 10, width: '100%', background: BRAND.gold, borderRadius: 9, transformOrigin: 'left', animation: `reelUnderline 580ms cubic-bezier(0.16,1,0.3,1) ${s.lines.length * 150 + 300}ms both` }} />
          </span>
        )}
      </h1>
    </div>
  );
}

function FeatureScene({ s }: { s: Extract<Scene, { kind: 'feature' }> }) {
  const scale = s.scale ?? 2.0;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: PAD, gap: 108 }}>
      <div className="reel-mock" style={{ filter: `drop-shadow(0 30px 70px ${s.accent}45)` }}>
        <div style={{ transform: `scale(${scale})` }}>
          <div className="reel-ken">{s.mockup}</div>
        </div>
      </div>
      <div style={{ textAlign: 'center', maxWidth: 920 }}>
        <div className="reel-rise" style={{ display: 'inline-block', fontSize: 25, fontWeight: 800, letterSpacing: '0.18em', color: s.accent, textTransform: 'uppercase', padding: '11px 26px', borderRadius: 999, background: `${s.accent}1f`, marginBottom: 28, animationDelay: '220ms' }}>{s.chip}</div>
        <h2 className="reel-rise" style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, color: '#fff', fontSize: 76, lineHeight: 1.04, margin: '0 0 22px', letterSpacing: '-0.015em', animationDelay: '340ms' }}>{s.title}</h2>
        <p className="reel-rise" style={{ fontSize: 38, color: 'rgba(255,255,255,0.74)', lineHeight: 1.4, margin: 0, fontWeight: 400, animationDelay: '460ms' }}>{s.desc}</p>
      </div>
    </div>
  );
}

function StatScene({ s }: { s: Extract<Scene, { kind: 'stat' }> }) {
  const v = useCountUp(s.value, 1700);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: PAD, textAlign: 'center', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '30%', width: 620, height: 620, borderRadius: 999, background: `radial-gradient(circle, ${s.accent}55, transparent 65%)`, filter: 'blur(50px)', animation: 'reelPulse 2.4s ease-in-out infinite' }} />
      <div className="reel-pop" style={{ position: 'relative', fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 280, lineHeight: 0.9, letterSpacing: '-0.04em', color: '#fff', display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
        {s.prefix && <span style={{ fontSize: 140, color: s.accent }}>{s.prefix}</span>}
        <span style={{ background: `linear-gradient(135deg,#fff,${s.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: `drop-shadow(0 10px 40px ${s.accent}66)` }}>{v.toLocaleString('es-AR')}</span>
        {s.suffix && <span style={{ fontSize: 140, color: s.accent }}>{s.suffix}</span>}
      </div>
      <h2 className="reel-rise" style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, color: '#fff', fontSize: 68, lineHeight: 1.1, margin: '44px 0 16px', maxWidth: 860, letterSpacing: '-0.015em' }}>{s.label}</h2>
      {s.sub && <p style={{ fontSize: 36, color: 'rgba(255,255,255,0.6)', margin: 0 }}>{s.sub}</p>}
    </div>
  );
}

function SplitScene({ s }: { s: Extract<Scene, { kind: 'split' }> }) {
  const cols: { title: string; items: string[]; bad?: boolean }[] = [
    { title: s.beforeTitle ?? 'Antes', items: s.before, bad: true },
    { title: s.afterTitle ?? 'Con Munify', items: s.after },
  ];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: PAD, gap: 34 }}>
      {cols.map((c, i) => (
        <div key={i} className="reel-rise" style={{ animationDelay: `${i * 180}ms`, borderRadius: 34, padding: 44, background: c.bad ? 'rgba(229,72,77,0.10)' : `${s.accent}18`, border: `2px solid ${c.bad ? 'rgba(229,72,77,0.35)' : s.accent + '55'}` }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.bad ? '#E5484D' : s.accent, marginBottom: 26 }}>{c.title}</div>
          {c.items.map((it, j) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: j < c.items.length - 1 ? 20 : 0 }}>
              <span style={{ fontSize: 42, lineHeight: 1, color: c.bad ? '#E5484D' : s.accent }}>{c.bad ? '✕' : '✓'}</span>
              <span style={{ fontSize: 40, color: '#fff', fontWeight: 500 }}>{it}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CtaScene({ s }: { s: Extract<Scene, { kind: 'cta' }> }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: PAD, textAlign: 'center', gap: 48 }}>
      <div className="reel-pop"><MunifyMark size={150} /></div>
      <h2 className="reel-rise" style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, color: '#fff', fontSize: 96, lineHeight: 1.02, margin: 0, letterSpacing: '-0.02em' }}>
        {s.line} {s.accentWord && <span style={{ color: BRAND.gold }}>{s.accentWord}</span>}
      </h2>
      {s.sub && (
        <div className="reel-rise" style={{ animationDelay: '180ms', marginTop: 10, fontSize: 36, color: BRAND.ink, fontWeight: 800, background: BRAND.gold, padding: '22px 48px', borderRadius: 999, boxShadow: `0 24px 60px ${BRAND.gold}55` }}>{s.sub}</div>
      )}
    </div>
  );
}

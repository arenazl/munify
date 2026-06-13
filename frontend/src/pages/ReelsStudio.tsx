// ============================================================
// /reels — Estudio de reels de promoción de Munify.
// La VOZ/MÚSICA/TEXTO se trabaja en el estudio inyectado (media-studio, app
// standalone) — única superficie, sin duplicar controles acá. Munify le manda
// sus reels + tracks por postMessage (mediastudio:config) y el canvas se
// sincroniza con el reel que el estudio tenga activo (mediastudio:file).
// El canvas 1080×1920 es el preview exacto del mp4 final (lo genera Claude).
// Ruta pública (herramienta interna de marketing), no toca el resto de la app.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Film, Mic } from 'lucide-react';
import ReelStage, { reelDurationMs, setReelTimeScale } from '../components/reels/ReelStage';
import { REELS } from '../components/reels/reelScripts';
import { NARRATION } from '../components/reels/narrationText';
import { BRAND, FONT_DISPLAY, FONT_SANS } from '../components/reels/reelBrand';
import { MunifyMark } from '../components/reels/ReelMockups';

const MEDIA_STUDIO = 'https://media-studio-arenazl.netlify.app';
const TRACKS = [
  { id: 'pop', label: 'Pop' }, { id: 'electro', label: 'Electrónica' }, { id: 'funk', label: 'Funk' },
  { id: 'inspiradora', label: 'Inspiradora' }, { id: 'calida', label: 'Cálida' }, { id: 'indie', label: 'Indie' },
  { id: 'cine', label: 'Cinematográfica' }, { id: 'epica', label: 'Épica' },
];

export default function ReelsStudio() {
  const [activeId, setActiveId] = useState(REELS[0].id);
  const reel = REELS.find((r) => r.id === activeId) ?? REELS[0];
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Modo captura headless (Playwright): /reels?reel=<id>&capture=1
  // Mantiene negro puro hasta window.__go() → el reel arranca en escena 0.
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const isCapture = params.get('capture') === '1';
  const slow = Math.max(1, Number(params.get('slow')) || 1);
  const captureReel = REELS.find((r) => r.id === params.get('reel')) ?? reel;
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!isCapture) return;
    const w = window as unknown as Record<string, unknown>;
    w.__reelMs = reelDurationMs(captureReel);
    w.__slow = slow;
    w.__go = () => setGo(true);
    w.__ready = true;
  }, [isCapture, captureReel, slow]);

  // Handshake con el estudio inyectado: al estar listo le mandamos la config
  // (reels como "fuente" + tracks). Cuando el estudio cambia de reel, sincroniza el canvas.
  const postConfig = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const origin = window.location.origin;
    win.postMessage({
      type: 'mediastudio:config',
      config: {
        sourceTitle: 'REELS',
        files: REELS.map((r) => ({ id: r.id, label: r.nombre, text: (NARRATION[r.id] || []).join('\n'), sub: `${(NARRATION[r.id] || []).length} frases` })),
        tracks: TRACKS.map((t) => ({ id: t.id, label: t.label, url: `${origin}/reels-audio/${t.id}.mp3` })),
        text: (NARRATION[activeId] || []).join('\n'),
      },
    }, '*');
  };
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'mediastudio:ready') postConfig();
      if (d.type === 'mediastudio:file' && REELS.some((r) => r.id === d.id)) setActiveId(d.id);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isCapture) {
    setReelTimeScale(slow); // antes de montar ReelStage (enlentece count-up + avance)
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {go && <ReelStage reel={captureReel} clean height={1920} loop={false} />}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: BRAND.ink, fontFamily: FONT_SANS, color: '#fff', padding: '28px 24px 60px' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 1320, margin: '0 auto 24px' }}>
        <MunifyMark size={30} />
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, fontSize: 28, margin: 0, letterSpacing: '-0.02em' }}>Estudio de Reels</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Recorridos por la app para Facebook / Instagram · {REELS.length} guiones</p>
        </div>
      </header>

      {/* ESTUDIO (voz · música · texto · waveform) — componente INYECTADO de media-studio.
          Única superficie de edición de audio (DRY). Le pasamos los reels por postMessage. */}
      <div style={{ maxWidth: 1320, margin: '0 auto 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, fontWeight: 800, color: BRAND.gold, letterSpacing: '0.04em' }}>
          <Mic size={16} /> ESTUDIO DE VOZ
          <a href={`${MEDIA_STUDIO}/?tool=voz&text=${encodeURIComponent((NARRATION[activeId] || []).join('\n'))}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>abrir en pantalla completa ↗</a>
        </div>
        <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${BRAND.gold}40` }}>
          <iframe ref={iframeRef} onLoad={postConfig} src={`${MEDIA_STUDIO}/?tool=voz&embed=1`} title="Estudio de voz" style={{ width: '100%', height: 820, border: 'none', display: 'block' }} />
        </div>
      </div>

      {/* Preview del reel (canvas 1080×1920) + cómo se entrega */}
      <div style={{ maxWidth: 1320, margin: '0 auto', display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 32, alignItems: 'start' }}>
        <div style={{ position: 'sticky', top: 18 }}>
          <ReelStage reel={reel} height={typeof window !== 'undefined' ? Math.min(window.innerHeight - 80, 900) : 820} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>{reel.nombre}</div>
          <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{reel.desc}</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, fontSize: 12, fontWeight: 700, color: reel.accent }}>
            <span>{Math.round(reelDurationMs(reel) / 1000)}s</span><span>·</span><span>{reel.scenes.length} escenas</span>
          </div>
          <div style={{ borderRadius: 16, padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 700, fontSize: 14, color: BRAND.gold }}>
              <Film size={16} /> Cómo se entregan
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.7)' }}>
              Elegí el reel en el panel <b>REELS</b> del estudio de arriba: se carga su texto para tunear la voz y
              acá ves el <b>preview exacto</b> (mismo lienzo 1080×1920 que el video final). Los mp4 con música los
              genera Claude y quedan en <b>munify/reels</b>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// /reels — Estudio de reels de promoción de Munify.
// Elegís un guión, lo ves en el lienzo 9:16 y lo grabás a mp4 (modo
// "Grabar" deja solo el lienzo sobre negro para capturar con OBS / grabador).
// Ruta pública (herramienta interna de marketing), no toca el resto de la app.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Film, Music, VolumeX, Mic } from 'lucide-react';
import ReelStage, { reelDurationMs, setReelTimeScale } from '../components/reels/ReelStage';
import { REELS } from '../components/reels/reelScripts';
import { NARRATORS } from '../components/reels/narrators';
import { BRAND, FONT_DISPLAY, FONT_SANS } from '../components/reels/reelBrand';
import { MunifyMark } from '../components/reels/ReelMockups';

const TRACKS = [
  { id: 'pop', label: 'Pop' }, { id: 'electro', label: 'Electrónica' }, { id: 'funk', label: 'Funk' },
  { id: 'inspiradora', label: 'Inspiradora' }, { id: 'calida', label: 'Cálida' }, { id: 'indie', label: 'Indie' },
  { id: 'cine', label: 'Cinematográfica' }, { id: 'epica', label: 'Épica' },
];

export default function ReelsStudio() {
  const [activeId, setActiveId] = useState(REELS[0].id);
  const reel = REELS.find((r) => r.id === activeId) ?? REELS[0];

  // Música de preview (pistas libres en /public/reels-audio). Suena al
  // elegirla (click = gesto que habilita el audio del navegador).
  const audioRef = useRef<HTMLAudioElement>(null);
  const voiceRef = useRef<HTMLAudioElement>(null);
  const [track, setTrack] = useState<string | null>(null);
  const pickTrack = (id: string | null) => {
    setTrack(id);
    const a = audioRef.current;
    if (!a) return;
    if (!id) { a.pause(); return; }
    a.src = `/reels-audio/${id}.mp3`;
    a.currentTime = 0;
    // si ya hay una voz sonando, la música entra bajita (ducking); si no, full.
    const v = voiceRef.current;
    a.volume = v && !v.paused && !v.ended ? 0.22 : 1;
    a.play().catch(() => {});
  };

  // Probador de narradores (samples estáticos en /public/reels-audio/narrators).
  // La voz suena SOBRE la música, bajándola (ducking) mientras dura el sample —
  // así se escucha cómo queda el reel final. No corta la música.
  const [narrator, setNarrator] = useState<string | null>(null);
  const pickNarrator = (slug: string) => {
    setNarrator(slug);
    const a = voiceRef.current;
    if (!a) return;
    const m = audioRef.current;
    const restore = () => { if (m) m.volume = 1; };
    if (m && !m.paused) m.volume = 0.22; // duck la música, no la corta
    a.src = `/reels-audio/narrators/${slug}.mp3`;
    a.currentTime = 0;
    a.onended = restore;
    a.play().catch(restore);
  };

  // Modo captura headless (Playwright): /reels?reel=<id>&capture=1
  // Mantiene negro puro hasta window.__go() → el reel arranca en escena 0.
  // Eso deja un borde negro detectable por ffmpeg blackdetect para recortar
  // exacto. window.__reelMs informa la duración de una vuelta.
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
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 1240, margin: '0 auto 28px' }}>
        <MunifyMark size={30} />
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, fontSize: 28, margin: 0, letterSpacing: '-0.02em' }}>Estudio de Reels</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Recorridos por la app para Facebook / Instagram · {REELS.length} guiones</p>
        </div>
      </header>

      {/* BARRA DE MÚSICA — visible apenas entrás, sin scroll */}
      <div style={{ maxWidth: 1240, margin: '0 auto 24px', borderRadius: 16, padding: '14px 18px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BRAND.gold}33`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: BRAND.gold, letterSpacing: '0.04em' }}>
          <Music size={17} /> MÚSICA
        </div>
        <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>tocá una para escuchar (suena en loop):</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {TRACKS.map((t) => (
            <button key={t.id} onClick={() => pickTrack(t.id)} style={chip(track === t.id, BRAND.gold)}>{t.label}</button>
          ))}
          <button onClick={() => pickTrack(null)} style={{ ...chip(track === null, BRAND.gold), display: 'flex', alignItems: 'center', gap: 6 }}>
            <VolumeX size={14} /> Silencio
          </button>
        </div>
      </div>

      {/* NARRADORES (ElevenLabs) — tocá para escuchar el sample de cada voz */}
      <div style={{ maxWidth: 1240, margin: '0 auto 24px', borderRadius: 16, padding: '14px 18px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BRAND.azure}40` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: BRAND.azure, letterSpacing: '0.04em' }}>
            <Mic size={17} /> NARRADORES
          </span>
          <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>voz para la locución — tocá una para escuchar el sample (ElevenLabs)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(228px, 1fr))', gap: 10, marginTop: 12 }}>
          {NARRATORS.map((n) => {
            const active = narrator === n.slug;
            const ac = n.accent === 'Argentina' ? BRAND.gold : BRAND.azure;
            return (
              <button key={n.slug} onClick={() => pickNarrator(n.slug)} style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 12, padding: '11px 13px', background: active ? `${BRAND.azure}22` : 'rgba(255,255,255,0.04)', border: `1.5px solid ${active ? BRAND.azure : 'rgba(255,255,255,0.1)'}`, transition: 'all 140ms' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Mic size={13} color={active ? BRAND.azure : 'rgba(255,255,255,0.4)'} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{n.name}</span>
                  {n.slug === 'lucia' && <span style={{ fontSize: 8.5, fontWeight: 800, color: BRAND.gold }}>★</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: ac, background: `${ac}1f`, borderRadius: 999, padding: '2px 8px' }}>{n.accent}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.35 }}>{n.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 520px', gap: 32, alignItems: 'start' }}>
        {/* Selector + tips */}
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {REELS.map((r) => {
              const active = r.id === activeId;
              const s = Math.round(reelDurationMs(r) / 1000);
              return (
                <button
                  key={r.id}
                  onClick={() => setActiveId(r.id)}
                  style={{
                    textAlign: 'left', cursor: 'pointer', borderRadius: 16, padding: '16px 18px',
                    background: active ? `${r.accent}1f` : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${active ? r.accent : 'rgba(255,255,255,0.08)'}`,
                    transition: 'all 160ms',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 99, background: r.accent }} />
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{r.nombre}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: r.accent }}>{s}s · {r.scenes.length} escenas</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>{r.desc}</p>
                </button>
              );
            })}
          </div>

          {/* Cómo se entregan */}
          <div style={{ marginTop: 24, borderRadius: 16, padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 700, fontSize: 14, color: BRAND.gold }}>
              <Film size={16} /> Cómo se entregan
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.7)' }}>
              Acá ves el <b>preview exacto</b> de cada reel — mismo lienzo 1080×1920 que el video final.
              Los mp4 con música los genera Claude y quedan en <b>munify/reels</b>. No hace falta grabar nada a mano.
            </p>
          </div>
        </div>

        {/* Preview */}
        <div style={{ position: 'sticky', top: 24 }}>
          <ReelStage reel={reel} />
          <audio ref={audioRef} loop />
          <audio ref={voiceRef} />
        </div>
      </div>
    </div>
  );
}

const chip = (active: boolean, accent: string): React.CSSProperties => ({
  cursor: 'pointer', borderRadius: 999, padding: '8px 16px', fontWeight: 700, fontSize: 13, color: '#fff',
  border: `1.5px solid ${active ? accent : 'rgba(255,255,255,0.14)'}`,
  background: active ? `${accent}22` : 'rgba(255,255,255,0.04)',
  transition: 'all 140ms',
});

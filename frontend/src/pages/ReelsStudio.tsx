// ============================================================
// /reels — Estudio de reels de promoción de Munify.
// Elegís un guión, lo ves en el lienzo 9:16 y lo grabás a mp4 (modo
// "Grabar" deja solo el lienzo sobre negro para capturar con OBS / grabador).
// Ruta pública (herramienta interna de marketing), no toca el resto de la app.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Film, Music, VolumeX, Mic, Sliders } from 'lucide-react';
import ReelStage, { reelDurationMs, setReelTimeScale } from '../components/reels/ReelStage';
import { REELS } from '../components/reels/reelScripts';
import { NARRATORS, REGION_LABEL, type Region } from '../components/reels/narrators';
import { NARRATION, TTS_SERVICE_URL } from '../components/reels/narrationText';
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

  // Volúmenes controlables por sliders. Refs para que el ducking respete el
  // nivel en vivo aunque el user mueva el slider mientras suena.
  const DUCK = 0.5; // mientras habla la voz, la música baja a (musicVol * DUCK)
  const audioRef = useRef<HTMLAudioElement>(null);  // música (loop)
  const voiceRef = useRef<HTMLAudioElement>(null);  // narración del reel
  const [track, setTrack] = useState<string | null>(null);
  const [narrator, setNarrator] = useState<string>('lucia'); // voz por defecto
  const [musicVol, setMusicVolState] = useState(0.8);
  const [voiceVol, setVoiceVolState] = useState(0.92);
  const musicVolRef = useRef(0.8);
  const voiceVolRef = useRef(0.92);

  const voicePlaying = () => {
    const v = voiceRef.current;
    return !!v && !v.paused && !v.ended;
  };
  const setMusicVol = (v: number) => {
    musicVolRef.current = v; setMusicVolState(v);
    const a = audioRef.current;
    if (a) a.volume = voicePlaying() ? v * DUCK : v;
  };
  const setVoiceVol = (v: number) => {
    voiceVolRef.current = v; setVoiceVolState(v);
    const a = voiceRef.current;
    if (a) a.volume = v;
  };

  // fade suave de volumen de un <audio> (efecto ducking)
  const fadeVol = (el: HTMLAudioElement | null, to: number, ms = 300) => {
    if (!el) return;
    const from = el.volume; const steps = 12; let i = 0;
    const id = setInterval(() => {
      i++; el.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
      if (i >= steps) clearInterval(id);
    }, ms / 12);
  };

  const pickTrack = (id: string | null) => {
    setTrack(id);
    const a = audioRef.current;
    if (!a) return;
    if (!id) { a.pause(); return; }
    a.src = `/reels-audio/${id}.mp3`;
    a.currentTime = 0;
    a.volume = voicePlaying() ? musicVolRef.current * DUCK : musicVolRef.current;
    a.play().catch(() => {});
  };

  // Narración del reel <reelId> en la voz <slug>, sobre la música con ducking.
  const playNarration = (reelId: string, slug: string) => {
    const a = voiceRef.current;
    if (!a) return;
    a.src = `/reels-audio/narration/${reelId}/${slug}.mp3`;
    a.currentTime = 0;
    a.volume = voiceVolRef.current;
    const m = audioRef.current;
    if (m && !m.paused) fadeVol(m, musicVolRef.current * DUCK, 250);            // duck
    a.onended = () => { if (m && !m.paused) fadeVol(m, musicVolRef.current, 450); }; // restaura
    a.play().catch(() => {});
  };

  const pickNarrator = (slug: string) => { setNarrator(slug); playNarration(activeId, slug); };
  const pickReel = (id: string) => { setActiveId(id); playNarration(id, narrator); };

  // --- Tuneo de voz EN VIVO (servicio TTS): cadencia, pausa, expresión ---
  const [speed, setSpeed] = useState(1.0);     // cadencia 0.7-1.2
  const [pauseMs, setPauseMs] = useState(450);  // pausa entre frases
  const [stability, setStability] = useState(0.45);
  const [style, setStyle] = useState(0.45);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const generateLive = async () => {
    const phrases = NARRATION[activeId] || [];
    const voiceId = NARRATORS.find((n) => n.slug === narrator)?.voiceId;
    if (!phrases.length || !voiceId) return;
    setGenerating(true); setGenError(null);
    try {
      const segments = phrases.map((t, i) => ({ text: t, pause_ms: i < phrases.length - 1 ? pauseMs : 0 }));
      const r = await fetch(`${TTS_SERVICE_URL}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments, voice_id: voiceId, model_id: 'eleven_multilingual_v2', speed, stability, style }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = voiceRef.current;
      if (a) {
        a.src = url; a.currentTime = 0; a.volume = voiceVolRef.current;
        const m = audioRef.current;
        if (m && !m.paused) fadeVol(m, musicVolRef.current * DUCK, 250);
        a.onended = () => { if (m && !m.paused) fadeVol(m, musicVolRef.current, 450); URL.revokeObjectURL(url); };
        a.play().catch(() => {});
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'error');
    } finally {
      setGenerating(false);
    }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', width: 56 }}>Vol música</span>
          <input type="range" min={0} max={100} value={Math.round(musicVol * 100)} onChange={(e) => setMusicVol(Number(e.target.value) / 100)} style={{ accentColor: BRAND.gold, flex: 1, maxWidth: 360 }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(musicVol * 100)}%</span>
        </div>
      </div>

      {/* NARRADORES (ElevenLabs) — agrupados por región */}
      <div style={{ maxWidth: 1240, margin: '0 auto 24px', borderRadius: 16, padding: '14px 18px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BRAND.azure}40` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: BRAND.azure, letterSpacing: '0.04em' }}>
            <Mic size={17} /> NARRADORES
          </span>
          <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>tocá una y escuchás la narración del reel elegido en esa voz</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)' }}>Vol voz</span>
            <input type="range" min={0} max={100} value={Math.round(voiceVol * 100)} onChange={(e) => setVoiceVol(Number(e.target.value) / 100)} style={{ accentColor: BRAND.azure, width: 150 }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(voiceVol * 100)}%</span>
          </div>
        </div>
        {(['ar', 'lat'] as Region[]).map((region) => {
          const ac = region === 'ar' ? BRAND.gold : BRAND.azure;
          return (
            <div key={region} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: ac, marginBottom: 8 }}>{REGION_LABEL[region]}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(212px, 1fr))', gap: 9 }}>
                {NARRATORS.filter((n) => n.region === region).map((n) => {
                  const active = narrator === n.slug;
                  return (
                    <button key={n.slug} onClick={() => pickNarrator(n.slug)} style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 12, padding: '10px 12px', background: active ? `${ac}22` : 'rgba(255,255,255,0.04)', border: `1.5px solid ${active ? ac : 'rgba(255,255,255,0.1)'}`, transition: 'all 140ms' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Mic size={12} color={active ? ac : 'rgba(255,255,255,0.4)'} />
                        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{n.name}</span>
                        {n.slug === 'lucia' && <span style={{ fontSize: 8.5, fontWeight: 800, color: BRAND.gold }}>★</span>}
                      </div>
                      <p style={{ margin: '5px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.3 }}>{n.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* TUNEO DE VOZ EN VIVO — genera con el servicio TTS (cadencia/pausa/expresión) */}
      <div style={{ maxWidth: 1320, margin: '0 auto 24px', borderRadius: 16, padding: '14px 18px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BRAND.gold}40` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: BRAND.gold, letterSpacing: '0.04em' }}>
            <Sliders size={17} /> TUNEO DE VOZ EN VIVO
          </span>
          <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>ajustá y dale Generar — usa el reel y la voz elegidos arriba</span>
          <button onClick={generateLive} disabled={generating} style={{ marginLeft: 'auto', cursor: generating ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, border: 'none', background: generating ? 'rgba(255,255,255,0.15)' : BRAND.gold, color: generating ? '#fff' : BRAND.ink, fontWeight: 800, fontSize: 14 }}>
            <Mic size={15} /> {generating ? 'Generando…' : 'Generar voz'}
          </button>
          {genError && <span style={{ fontSize: 11, color: '#ef4444' }}>error: {genError}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <TuneSlider label="Cadencia" hint="lento ← → rápido" min={0.7} max={1.2} step={0.05} value={speed} onChange={setSpeed} fmt={(v) => `${v.toFixed(2)}×`} />
          <TuneSlider label="Pausa entre frases" hint="silencio entre líneas" min={0} max={1200} step={50} value={pauseMs} onChange={setPauseMs} fmt={(v) => `${v} ms`} />
          <TuneSlider label="Estabilidad" hint="bajo = más expresivo/variable" min={0} max={1} step={0.05} value={stability} onChange={setStability} fmt={(v) => v.toFixed(2)} />
          <TuneSlider label="Estilo" hint="expresividad emocional" min={0} max={1} step={0.05} value={style} onChange={setStyle} fmt={(v) => v.toFixed(2)} />
        </div>
      </div>

      <div style={{ maxWidth: 1320, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 640px', gap: 32, alignItems: 'start' }}>
        {/* Selector + tips */}
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {REELS.map((r) => {
              const active = r.id === activeId;
              const s = Math.round(reelDurationMs(r) / 1000);
              return (
                <button
                  key={r.id}
                  onClick={() => pickReel(r.id)}
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

        {/* Preview (grande) */}
        <div style={{ position: 'sticky', top: 18 }}>
          <ReelStage reel={reel} height={typeof window !== 'undefined' ? Math.min(window.innerHeight - 60, 1120) : 900} />
          <audio ref={audioRef} loop />
          <audio ref={voiceRef} />
        </div>
      </div>
    </div>
  );
}

function TuneSlider({ label, hint, min, max, step, value, onChange, fmt }: {
  label: string; hint: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void; fmt: (v: number) => string;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 12, color: BRAND.gold, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ accentColor: BRAND.gold, width: '100%' }} />
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{hint}</div>
    </div>
  );
}

const chip = (active: boolean, accent: string): React.CSSProperties => ({
  cursor: 'pointer', borderRadius: 999, padding: '8px 16px', fontWeight: 700, fontSize: 13, color: '#fff',
  border: `1.5px solid ${active ? accent : 'rgba(255,255,255,0.14)'}`,
  background: active ? `${accent}22` : 'rgba(255,255,255,0.04)',
  transition: 'all 140ms',
});

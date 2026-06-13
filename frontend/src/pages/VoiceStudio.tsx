// ============================================================
// /voz — Estudio de voz (app-agnóstico). UI propia del servicio TTS
// standalone (Cloud Run). Pegás texto (cada LÍNEA = una frase), elegís voz y
// tuneás cadencia / pausa / expresión, generás y descargás. Reusable para
// cualquier app — el servicio tiene la key; acá nunca.
// ============================================================
import { useRef, useState } from 'react';
import { Mic, Sliders, Download, Play, Pause } from 'lucide-react';
import { NARRATORS, REGION_LABEL, type Region } from '../components/reels/narrators';
import { NARRATION, TTS_SERVICE_URL } from '../components/reels/narrationText';
import { BRAND, FONT_DISPLAY, FONT_SANS } from '../components/reels/reelBrand';
import { MunifyMark } from '../components/reels/ReelMockups';

const MODELS = [
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 (calidad)' },
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 (rápido)' },
];

function Slider({ label, hint, min, max, step, value, onChange, fmt }: {
  label: string; hint: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void; fmt: (v: number) => string;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 12.5, color: BRAND.gold, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ accentColor: BRAND.gold, width: '100%' }} />
      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{hint}</div>
    </div>
  );
}

export default function VoiceStudio() {
  const [text, setText] = useState(NARRATION.tour.join('\n'));
  const [voice, setVoice] = useState('lucia');
  const [model, setModel] = useState('eleven_multilingual_v2');
  const [speed, setSpeed] = useState(1.0);
  const [pauseMs, setPauseMs] = useState(450);
  const [stability, setStability] = useState(0.45);
  const [style, setStyle] = useState(0.45);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);

  const generate = async () => {
    const voiceId = NARRATORS.find((n) => n.slug === voice)?.voiceId;
    if (!lines.length || !voiceId) return;
    setBusy(true); setErr(null);
    try {
      const segments = lines.map((t, i) => ({ text: t, pause_ms: i < lines.length - 1 ? pauseMs : 0 }));
      const r = await fetch(`${TTS_SERVICE_URL}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments, voice_id: voiceId, model_id: model, speed, stability, style }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} · ${(await r.text()).slice(0, 120)}`);
      const blob = await r.blob();
      if (url) URL.revokeObjectURL(url);
      const u = URL.createObjectURL(blob);
      setUrl(u);
      const a = audioRef.current;
      if (a) { a.src = u; a.currentTime = 0; a.play().then(() => setPlaying(true)).catch(() => {}); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => {
    const a = audioRef.current; if (!a || !url) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: BRAND.ink, fontFamily: FONT_SANS, color: '#fff', padding: '28px 24px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 1180, margin: '0 auto 24px' }}>
        <MunifyMark size={30} />
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, fontSize: 28, margin: 0, letterSpacing: '-0.02em' }}>Estudio de voz</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Texto → voz con cadencia, pausas y expresión · servicio reusable (ElevenLabs)</p>
        </div>
      </header>

      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 420px', gap: 28, alignItems: 'start' }}>
        {/* TEXTO */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: BRAND.gold, letterSpacing: '0.04em' }}>TEXTO</span>
            <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>cada línea es una frase (la pausa va entre líneas)</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{lines.length} frases</span>
          </div>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            style={{ width: '100%', minHeight: 320, resize: 'vertical', borderRadius: 14, padding: 16, fontSize: 15, lineHeight: 1.6, fontFamily: FONT_SANS, color: '#fff', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', outline: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>Cargar reel:</span>
            {Object.keys(NARRATION).map((k) => (
              <button key={k} onClick={() => setText(NARRATION[k].join('\n'))} style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '5px 12px' }}>{k}</button>
            ))}
          </div>
        </div>

        {/* CONTROLES */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, borderRadius: 16, padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {/* Voz */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: BRAND.azure, letterSpacing: '0.04em', marginBottom: 8 }}>VOZ</div>
            {(['ar', 'lat'] as Region[]).map((region) => {
              const ac = region === 'ar' ? BRAND.gold : BRAND.azure;
              return (
                <div key={region} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: ac, marginBottom: 5 }}>{REGION_LABEL[region]}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {NARRATORS.filter((n) => n.region === region).map((n) => {
                      const active = voice === n.slug;
                      return (
                        <button key={n.slug} onClick={() => setVoice(n.slug)} title={n.desc} style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#fff', borderRadius: 999, padding: '5px 11px', background: active ? `${ac}26` : 'rgba(255,255,255,0.05)', border: `1.5px solid ${active ? ac : 'rgba(255,255,255,0.12)'}` }}>{n.name}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <Slider label="Cadencia" hint="0.7 lento — 1.2 rápido" min={0.7} max={1.2} step={0.05} value={speed} onChange={setSpeed} fmt={(v) => `${v.toFixed(2)}×`} />
          <Slider label="Pausa entre frases" hint="silencio entre líneas" min={0} max={1500} step={50} value={pauseMs} onChange={setPauseMs} fmt={(v) => `${v} ms`} />
          <Slider label="Estabilidad" hint="bajo = más expresivo/variable" min={0} max={1} step={0.05} value={stability} onChange={setStability} fmt={(v) => v.toFixed(2)} />
          <Slider label="Estilo" hint="expresividad emocional" min={0} max={1} step={0.05} value={style} onChange={setStyle} fmt={(v) => v.toFixed(2)} />

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Modelo</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {MODELS.map((m) => (
                <button key={m.id} onClick={() => setModel(m.id)} style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: '#fff', borderRadius: 8, padding: '7px 12px', flex: 1, background: model === m.id ? `${BRAND.gold}22` : 'rgba(255,255,255,0.05)', border: `1.5px solid ${model === m.id ? BRAND.gold : 'rgba(255,255,255,0.12)'}` }}>{m.label}</button>
              ))}
            </div>
          </div>

          <button onClick={generate} disabled={busy} style={{ cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '14px', borderRadius: 12, border: 'none', background: busy ? 'rgba(255,255,255,0.15)' : BRAND.gold, color: busy ? '#fff' : BRAND.ink, fontWeight: 800, fontSize: 15.5 }}>
            <Mic size={17} /> {busy ? 'Generando…' : 'Generar voz'}
          </button>
          {err && <span style={{ fontSize: 11.5, color: '#ef4444' }}>error: {err}</span>}

          {url && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={toggle} style={{ cursor: 'pointer', width: 42, height: 42, borderRadius: 11, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <a href={url} download="voz.mp3" style={{ flex: 1, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px', borderRadius: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontWeight: 700, fontSize: 13.5 }}>
                <Download size={16} /> Descargar mp3
              </a>
            </div>
          )}
          <audio ref={audioRef} onEnded={() => setPlaying(false)} />
        </div>
      </div>
    </div>
  );
}

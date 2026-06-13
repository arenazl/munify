// ============================================================
// /voz — Estudio de voz con MARCADORES INLINE (como Flow para video, pero voz).
// Ves el texto completo y marcás adentro: énfasis, pausas y tono (etiquetas del
// modelo ElevenLabs v3). Una sola generación → mp3 reproducible/descargable.
// El servicio TTS standalone tiene la key; acá nunca.
// ============================================================
import { useRef, useState } from 'react';
import { Mic, Download, Play, Pause } from 'lucide-react';
import { NARRATORS, REGION_LABEL, type Region } from '../components/reels/narrators';
import { NARRATION, TTS_SERVICE_URL } from '../components/reels/narrationText';
import { BRAND, FONT_DISPLAY, FONT_SANS } from '../components/reels/reelBrand';
import { MunifyMark } from '../components/reels/ReelMockups';

// Marcadores que se insertan en el texto (etiquetas v3 + breaks + CAPS).
const MARKERS = [
  { label: 'Pausa corta', ins: ' <break time="0.4s" /> ' },
  { label: 'Pausa larga', ins: ' <break time="0.9s" /> ' },
  { label: 'Entusiasmo', ins: '[excited] ' },
  { label: 'Serio', ins: '[serious] ' },
  { label: 'Susurro', ins: '[whispers] ' },
  { label: 'Suspiro', ins: '[sighs] ' },
  { label: 'Curioso', ins: '[curious] ' },
];

export default function VoiceStudio() {
  const [text, setText] = useState(NARRATION.tour.join('\n'));
  const [voice, setVoice] = useState('lucia');
  const [model, setModel] = useState('eleven_v3');
  const [stability, setStability] = useState(0.4);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // inserta texto en el cursor / envuelve la selección
  const insertAtCursor = (before: string, after = '') => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart ?? text.length, e = ta.selectionEnd ?? text.length;
    const sel = text.slice(s, e);
    const next = text.slice(0, s) + before + sel + after + text.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = s + before.length + sel.length + after.length;
      ta.setSelectionRange(pos, pos);
    });
  };
  // ÉNFASIS: pasa la selección a MAYÚSCULAS (v3 las enfatiza)
  const emphasize = () => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart ?? 0, e = ta.selectionEnd ?? 0;
    if (s === e) return;
    const next = text.slice(0, s) + text.slice(s, e).toUpperCase() + text.slice(e);
    setText(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s, e); });
  };

  const generate = async () => {
    const voiceId = NARRATORS.find((n) => n.slug === voice)?.voiceId;
    if (!text.trim() || !voiceId) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${TTS_SERVICE_URL}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: voiceId, model_id: model, stability, style: 0.5 }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} · ${(await r.text()).slice(0, 140)}`);
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

  const btn: React.CSSProperties = { cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 11px' };

  return (
    <div style={{ minHeight: '100vh', background: BRAND.ink, fontFamily: FONT_SANS, color: '#fff', padding: '28px 24px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 1180, margin: '0 auto 22px' }}>
        <MunifyMark size={30} />
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, fontSize: 28, margin: 0, letterSpacing: '-0.02em' }}>Estudio de voz</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Marcá énfasis, pausas y tono DENTRO del texto — como en Flow, pero para voz</p>
        </div>
      </header>

      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 28, alignItems: 'start' }}>
        {/* EDITOR */}
        <div>
          {/* toolbar de marcadores: seleccioná texto o poné el cursor y tocá */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: BRAND.gold, letterSpacing: '0.04em', marginRight: 2 }}>MARCAR:</span>
            <button onClick={emphasize} style={{ ...btn, color: BRAND.ink, background: BRAND.gold, border: 'none', fontWeight: 800 }}>ÉNFASIS</button>
            {MARKERS.map((m) => (
              <button key={m.label} onClick={() => insertAtCursor(m.ins)} style={btn}>{m.label}</button>
            ))}
          </div>
          <textarea
            ref={taRef} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
            style={{ width: '100%', minHeight: 360, resize: 'vertical', borderRadius: 14, padding: 16, fontSize: 15.5, lineHeight: 1.7, fontFamily: FONT_SANS, color: '#fff', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', outline: 'none' }}
          />
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 8, lineHeight: 1.6 }}>
            <b>Énfasis</b>: seleccioná una palabra y tocá ÉNFASIS (la pone en MAYÚSCULAS). ·
            <b> Pausa/Tono</b>: poné el cursor donde querés el efecto y tocá el marcador — queda inline como
            <code style={{ color: BRAND.azure }}> [excited]</code> o <code style={{ color: BRAND.azure }}>{'<break time="0.5s" />'}</code>.
            También podés escribir las etiquetas a mano.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>Cargar reel:</span>
            {Object.keys(NARRATION).map((k) => (
              <button key={k} onClick={() => setText(NARRATION[k].join('\n'))} style={{ ...btn, fontSize: 11, padding: '4px 10px', borderRadius: 999 }}>{k}</button>
            ))}
          </div>
        </div>

        {/* CONTROLES */}
        <div style={{ position: 'sticky', top: 18, display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 16, padding: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: BRAND.azure, letterSpacing: '0.04em', marginBottom: 8 }}>VOZ</div>
            {(['ar', 'lat'] as Region[]).map((region) => {
              const ac = region === 'ar' ? BRAND.gold : BRAND.azure;
              return (
                <div key={region} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: ac, marginBottom: 5 }}>{REGION_LABEL[region]}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {NARRATORS.filter((n) => n.region === region).map((n) => {
                      const on = voice === n.slug;
                      return (<button key={n.slug} onClick={() => setVoice(n.slug)} title={n.desc} style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: '#fff', borderRadius: 999, padding: '4px 10px', background: on ? `${ac}26` : 'rgba(255,255,255,0.05)', border: `1.5px solid ${on ? ac : 'rgba(255,255,255,0.12)'}` }}>{n.name}</button>);
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Modelo</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ id: 'eleven_v3', label: 'v3 (con marcadores)' }, { id: 'eleven_multilingual_v2', label: 'v2 (estable)' }].map((m) => (
                <button key={m.id} onClick={() => setModel(m.id)} style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#fff', borderRadius: 8, padding: '7px 10px', flex: 1, background: model === m.id ? `${BRAND.gold}22` : 'rgba(255,255,255,0.05)', border: `1.5px solid ${model === m.id ? BRAND.gold : 'rgba(255,255,255,0.12)'}` }}>{m.label}</button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 5 }}>Los marcadores de tono ([excited], etc.) solo los respeta v3.</div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Estabilidad</span>
              <span style={{ fontSize: 12.5, color: BRAND.gold, fontWeight: 700 }}>{stability.toFixed(2)}</span>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={stability} onChange={(e) => setStability(Number(e.target.value))} style={{ accentColor: BRAND.gold, width: '100%' }} />
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>bajo = más expresivo/variable</div>
          </div>

          <button onClick={generate} disabled={busy} style={{ cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '14px', borderRadius: 12, border: 'none', background: busy ? 'rgba(255,255,255,0.15)' : BRAND.gold, color: busy ? '#fff' : BRAND.ink, fontWeight: 800, fontSize: 15.5 }}>
            <Mic size={17} /> {busy ? 'Generando…' : 'Generar voz'}
          </button>
          {err && <span style={{ fontSize: 11.5, color: '#ef4444' }}>error: {err}</span>}

          {url && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={toggle} style={{ cursor: 'pointer', width: 42, height: 42, borderRadius: 11, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
              <a href={url} download="voz.mp3" style={{ flex: 1, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px', borderRadius: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontWeight: 700, fontSize: 13.5 }}><Download size={16} /> Descargar mp3</a>
            </div>
          )}
          <audio ref={audioRef} onEnded={() => setPlaying(false)} />
        </div>
      </div>
    </div>
  );
}

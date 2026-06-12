// ============================================================
// /reels — Estudio de reels de promoción de Munify.
// Elegís un guión, lo ves en el lienzo 9:16 y lo grabás a mp4 (modo
// "Grabar" deja solo el lienzo sobre negro para capturar con OBS / grabador).
// Ruta pública (herramienta interna de marketing), no toca el resto de la app.
// ============================================================
import { useState } from 'react';
import { Film, Video, X } from 'lucide-react';
import ReelStage, { reelDurationMs } from '../components/reels/ReelStage';
import { REELS } from '../components/reels/reelScripts';
import { BRAND, FONT_DISPLAY, FONT_SANS } from '../components/reels/reelBrand';
import { MunifyMark } from '../components/reels/ReelMockups';

export default function ReelsStudio() {
  const [activeId, setActiveId] = useState(REELS[0].id);
  const [clean, setClean] = useState(false);
  const reel = REELS.find((r) => r.id === activeId) ?? REELS[0];
  const secs = Math.round(reelDurationMs(reel) / 1000);

  // Modo grabación: solo el lienzo 9:16 centrado sobre negro absoluto
  if (clean) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <ReelStage reel={reel} clean height={typeof window !== 'undefined' ? window.innerHeight : 900} />
        <button onClick={() => setClean(false)} style={btnFloat}><X size={20} /></button>
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

          {/* Cómo grabar */}
          <div style={{ marginTop: 24, borderRadius: 16, padding: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontWeight: 700, fontSize: 14, color: BRAND.gold }}>
              <Film size={16} /> Cómo pasarlo a mp4
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.7)' }}>
              <li>Apretá <b>Grabar (modo limpio)</b> → queda solo el lienzo 9:16 sobre negro.</li>
              <li>Capturá con OBS / Xbox Game Bar (Win+G) / grabador de pantalla, recortando el rectángulo del lienzo.</li>
              <li>El reel loopea: grabá una vuelta completa ({secs}s) y cortá.</li>
              <li>Exportá en 1080×1920. Listo para subir.</li>
            </ol>
          </div>
        </div>

        {/* Preview */}
        <div style={{ position: 'sticky', top: 24 }}>
          <ReelStage reel={reel} />
          <button
            onClick={() => setClean(true)}
            style={{
              marginTop: 18, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '15px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: BRAND.gold, color: BRAND.ink, fontWeight: 800, fontSize: 16,
              boxShadow: `0 14px 40px ${BRAND.gold}44`,
            }}
          >
            <Video size={20} /> Grabar (modo limpio)
          </button>
        </div>
      </div>
    </div>
  );
}

const btnFloat: React.CSSProperties = {
  position: 'fixed', top: 20, right: 20, width: 44, height: 44, borderRadius: 12,
  border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
};

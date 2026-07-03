/**
 * PresentacionMunify — presentación comercial en modo kiosko (ruta pública /presentacion).
 *
 * Pensada para VENDER en vivo (proyector frente al cliente): auto-avanza, se
 * pausa con espacio, flechas para navegar. Un mensaje por slide, tipografía
 * enorme, y mockups CON VIDA: QR con línea de escaneo, checks que se completan
 * solos, charts que se dibujan, filas que entran en cascada. Patrón del
 * template compartido TEMPLATE-PRES-APPS (animaciones como clases CSS +
 * React.memo para que corran en loop sin flicker).
 */
import { useEffect, useMemo, useState, memo } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2, Smartphone, Globe, ScanLine, ClipboardList, FileCheck,
  CalendarClock, Hammer, PiggyBank, MapPin, Users, ChevronLeft, ChevronRight,
  Pause, Play, X, Fingerprint, Bell, CheckCircle2, Layers, MessageCircle,
  AlertTriangle, Clock, Camera, QrCode, Wallet,
} from 'lucide-react';
import { MunifyMark } from '../components/ui/MunifyMark';
import { MockupWhatsApp, MockupSeguimiento, MockupLogros } from '../components/reels/ReelMockups';

const SLIDE_DURATION_MS = 14000;
// Paleta OFICIAL de marca (tokens de reelBrand.ts, sampleados del banner
// oficial — no inventar colores):
const AZUL = '#5B9BFF';        // azul trámites de marca (acento brillante)
const AZUL_MARCA = '#4070C0';  // azure del logo
const NAVY = '#103070';        // M exterior del logo
const INK = '#0E1830';         // fondo navy de marca
const VERDE = '#1FC591';       // verde reclamos de marca
const VIOLETA = '#A78BFA';     // violeta turnos de marca
const AMBAR = '#C8A24E';       // dorado de marca
const ROSA = '#f472b6';
const CIAN = '#34D399';        // teal IA de marca
// Tipografías de marca (mismas que los reels / banner oficial)
const FONT_DISPLAY = "'Fraunces', Georgia, 'Times New Roman', serif";

// ============================================================
// Hooks (patrón del template — no tocar)
// ============================================================

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

function useIsMobile(breakpoint = 680) {
  const [is, setIs] = useState(() => typeof window !== 'undefined' && window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setIs(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return is;
}

interface Slide {
  key: string;
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  Component: (props: { isMobile: boolean }) => ReactNode;
}

// ============================================================
// Piezas de UI compartidas
// ============================================================

function Chip({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span style={{
      padding: '5px 13px', borderRadius: 999, background: `${color}1e`, color,
      fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
    }}>{children}</span>
  );
}

function Card({ children, color, className, style }: { children: ReactNode; color: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={{
      padding: 22, borderRadius: 16, background: 'rgba(255,255,255,0.035)',
      border: `1px solid ${color}30`, boxShadow: `0 18px 44px -18px ${color}25`,
      ...style,
    }}>{children}</div>
  );
}

/** Marco flotante para mockups: glow + levitación permanente. */
function MockupFrame({ children, color, scale, scaleMobile, isMobile, minHeight }: {
  children: ReactNode; color: string; scale: number; scaleMobile?: number; isMobile: boolean; minHeight?: number;
}) {
  return (
    <div className="pres-float" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: isMobile ? 18 : 30, borderRadius: 20, minHeight: isMobile ? 200 : (minHeight ?? 360),
      background: `radial-gradient(circle at 100% 0%, ${color}14, transparent 60%), rgba(255,255,255,0.03)`,
      border: `1px solid ${color}35`, boxShadow: `0 24px 60px -18px ${color}40`,
      overflow: 'hidden', width: '100%',
    }}>
      <div style={{
        transform: `scale(${isMobile ? (scaleMobile ?? 1.02) : scale})`, transformOrigin: 'center',
        filter: 'drop-shadow(0 10px 28px rgba(0,0,0,0.45))',
      }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Mockups ANIMADOS (loop infinito vía clases CSS + React.memo)
// ============================================================

function MockupReclamoApp() {
  return (
    <div style={{ width: 200, padding: 14, background: '#0d1424', borderRadius: 18, border: '1px solid #223050' }}>
      <div style={{ fontSize: 8, color: '#5b6b8c', letterSpacing: '0.14em' }}>MUNIFY · VECINO</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', margin: '4px 0 10px' }}>Nuevo reclamo</div>
      <div className="pres-shimmer" style={{ height: 62, borderRadius: 10, background: 'linear-gradient(135deg,#16233f,#1b2c4f)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, position: 'relative', overflow: 'hidden' }}>
        <Camera size={20} color={AZUL} />
      </div>
      <div className="pres-cascade" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px', background: '#111b30', borderRadius: 8, marginBottom: 6, animationDelay: '300ms' }}>
        <span className="pres-ping-wrap"><MapPin size={10} color={VERDE} /><span className="pres-ping" style={{ background: VERDE }} /></span>
        <div style={{ fontSize: 8.5, color: '#9fb0cc' }}>Belgrano 3747 · detectada</div>
      </div>
      <div className="pres-cascade" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px', background: '#111b30', borderRadius: 8, marginBottom: 10, animationDelay: '700ms' }}>
        <ClipboardList size={10} color={AMBAR} />
        <div style={{ fontSize: 8.5, color: '#9fb0cc' }}>Bacheo y calles · clasificado por IA</div>
      </div>
      <div className="pres-btn-pulse" style={{ padding: '8px 0', borderRadius: 9, background: AZUL_MARCA, textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>
        Enviar reclamo
      </div>
    </div>
  );
}

function MockupBandeja() {
  const filas = [
    { t: 'Bache peligroso en la colectora', c: 'WhatsApp', cc: VERDE, e: 'En curso', ec: AZUL },
    { t: 'Luminaria quemada en la plaza', c: 'App', cc: AZUL, e: 'Recibido', ec: AMBAR },
    { t: 'Poda de arbolado — rama caída', c: 'Ventanilla', cc: VIOLETA, e: 'En curso', ec: AZUL },
    { t: 'Microbasural en terreno baldío', c: 'Web', cc: ROSA, e: 'Finalizado', ec: VERDE },
    { t: 'Semáforo intermitente en la 197', c: 'App', cc: AZUL, e: 'Recibido', ec: AMBAR },
  ];
  return (
    <div style={{ width: 300, padding: 14, background: '#0d1424', borderRadius: 14, border: '1px solid #223050' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Reclamos · Obras Públicas</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="pres-dot-live" style={{ width: 5, height: 5, borderRadius: 99, background: VERDE, display: 'inline-block' }} />
          <div style={{ fontSize: 8, color: '#5b6b8c' }}>en vivo</div>
        </div>
      </div>
      {filas.map((f, i) => (
        <div key={i} className="pres-cascade" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', background: '#111b30', borderRadius: 9, marginBottom: 6, animationDelay: `${200 + i * 260}ms` }}>
          <div className={f.e === 'Recibido' ? 'pres-dot-live' : ''} style={{ width: 5, height: 5, borderRadius: 99, background: f.ec }} />
          <div style={{ flex: 1, fontSize: 8.5, color: '#c7d2e8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.t}</div>
          <span style={{ fontSize: 7, fontWeight: 700, color: f.cc, background: `${f.cc}1c`, padding: '2px 6px', borderRadius: 99 }}>{f.c}</span>
          <span style={{ fontSize: 7, fontWeight: 700, color: f.ec }}>{f.e}</span>
        </div>
      ))}
    </div>
  );
}

function MockupOrdenTrabajo() {
  return (
    <div style={{ width: 250, padding: 14, background: '#0d1424', borderRadius: 14, border: '1px solid #223050' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#fff' }}>OT-2026-0007</div>
        <span className="pres-badge-glow" style={{ fontSize: 7.5, fontWeight: 700, color: AZUL, background: `${AZUL}1c`, padding: '2px 8px', borderRadius: 99 }}>EN CURSO</span>
      </div>
      <div style={{ fontSize: 9.5, color: '#c7d2e8', marginBottom: 10 }}>Bacheo de la calzada — Cuadrilla Bacheo</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        <div className="pres-cascade" style={{ padding: 7, background: '#111b30', borderRadius: 8, animationDelay: '250ms' }}>
          <div style={{ fontSize: 7, color: '#5b6b8c' }}>MATERIALES</div>
          <div style={{ fontSize: 9, color: '#fff', fontWeight: 600 }}>Asfalto x6 bolsas</div>
        </div>
        <div className="pres-cascade" style={{ padding: 7, background: '#111b30', borderRadius: 8, animationDelay: '500ms' }}>
          <div style={{ fontSize: 7, color: '#5b6b8c' }}>AVANCE</div>
          <div style={{ height: 5, borderRadius: 99, background: '#1c2946', marginTop: 5, overflow: 'hidden' }}>
            <div className="pres-bar-grow" style={{ height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${AZUL_MARCA}, ${AZUL})` }} />
          </div>
        </div>
      </div>
      <div className="pres-cascade" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: `${VERDE}12`, border: `1px solid ${VERDE}30`, borderRadius: 8, animationDelay: '800ms' }}>
        <Bell size={10} color={VERDE} />
        <div style={{ fontSize: 8, color: '#9fb0cc' }}>2 reclamos vinculados · los vecinos se enteran al cerrar</div>
      </div>
    </div>
  );
}

function MockupMostradorQR() {
  const pasos: Array<[string, number]> = [
    ['DNI frente y dorso', 0],
    ['Selfie con prueba de vida', 1],
    ['RENAPER verificado', 2],
  ];
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      <div style={{ width: 172, padding: 12, background: '#0d1424', borderRadius: 14, border: '1px solid #223050' }}>
        <div style={{ fontSize: 8, color: '#5b6b8c', marginBottom: 6 }}>VENTANILLA · FUNCIONARIA</div>
        <div style={{ height: 88, borderRadius: 10, background: '#111b30', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, position: 'relative', overflow: 'hidden' }}>
          <QrCode size={46} color="#fff" />
          <div className="pres-scanline" style={{ position: 'absolute', left: 8, right: 8, height: 2, borderRadius: 99, background: AZUL, boxShadow: `0 0 12px 2px ${AZUL}` }} />
        </div>
        <div style={{ fontSize: 8, color: '#9fb0cc', textAlign: 'center' }}>El vecino escanea con SU celular</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[0, 1, 2].map(i => (
          <span key={i} className="pres-flow-dot" style={{ width: 7, height: 7, borderRadius: 99, background: AZUL, animationDelay: `${i * 240}ms`, display: 'inline-block' }} />
        ))}
      </div>
      <div style={{ width: 126, padding: 10, background: '#0d1424', borderRadius: 16, border: '1px solid #223050' }}>
        <div style={{ fontSize: 7, color: '#5b6b8c', marginBottom: 6 }}>CELULAR DEL VECINO</div>
        {pasos.map(([txt, i]) => (
          <div key={i} className="pres-step" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5, animationDelay: `${600 + (i as number) * 1100}ms` }}>
            <CheckCircle2 size={10} color={VERDE} />
            <div style={{ fontSize: 7.5, color: '#c7d2e8' }}>{txt}</div>
          </div>
        ))}
        <div className="pres-step" style={{ marginTop: 6, padding: '5px 0', borderRadius: 7, background: `${VERDE}18`, border: `1px solid ${VERDE}35`, textAlign: 'center', fontSize: 7.5, fontWeight: 700, color: VERDE, animationDelay: '4000ms' }}>
          Identidad validada
        </div>
      </div>
    </div>
  );
}

function MockupAgendaTurnos() {
  const turnos = [
    { h: '09:00', n: 'María González', t: 'Licencia de conducir', e: 'cumplido', c: VERDE },
    { h: '09:45', n: 'Jorge Pérez', t: 'Habilitación comercial', e: 'presente', c: VERDE },
    { h: '10:30', n: 'Ana López', t: 'Licencia de conducir', e: 'reservado', c: AZUL },
    { h: '11:00', n: 'Carlos Ruiz', t: 'Permiso de obra', e: 'reservado', c: AZUL },
  ];
  return (
    <div style={{ width: 290, padding: 14, background: '#0d1424', borderRadius: 14, border: '1px solid #223050' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Agenda · Tránsito y Seguridad Vial</div>
        <div style={{ fontSize: 8, color: '#5b6b8c' }}>hoy</div>
      </div>
      {turnos.map((t, i) => (
        <div key={i} className="pres-cascade" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', background: '#111b30', borderRadius: 9, marginBottom: 6, animationDelay: `${200 + i * 300}ms` }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#fff', width: 32 }}>{t.h}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 8.5, color: '#c7d2e8', fontWeight: 600 }}>{t.n}</div>
            <div style={{ fontSize: 7.5, color: '#5b6b8c' }}>{t.t}</div>
          </div>
          <span className={t.e === 'reservado' ? 'pres-badge-glow' : ''} style={{ fontSize: 7, fontWeight: 700, color: t.c, background: `${t.c}1c`, padding: '2px 7px', borderRadius: 99 }}>{t.e}</span>
        </div>
      ))}
      <div className="pres-cascade" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 2, animationDelay: '1500ms' }}>
        <Bell size={9} color={CIAN} />
        <div style={{ fontSize: 8, color: '#5b6b8c' }}>Recordatorio automático 24 hs antes</div>
      </div>
    </div>
  );
}

function MockupTesoreria() {
  return (
    <div style={{ width: 280, padding: 14, background: '#0d1424', borderRadius: 14, border: '1px solid #223050' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Tesorería · Cajas</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        {[
          ['Tesoro Municipal', '$ 48,2M', VERDE, '200ms'],
          ['FOFINDE', '$ 12,7M', AZUL, '450ms'],
        ].map(([n, v, c, d], i) => (
          <div key={i} className="pres-cascade" style={{ padding: 8, background: '#111b30', borderRadius: 9, animationDelay: d as string }}>
            <div style={{ fontSize: 7, color: '#5b6b8c' }}>{n as string}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: c as string }}>{v as string}</div>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 240 46" style={{ width: '100%' }}>
        <defs>
          <linearGradient id="tesog" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={VIOLETA} stopOpacity="0.5" />
            <stop offset="100%" stopColor={VIOLETA} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="pres-area-fade" d="M0,38 L30,34 L60,36 L90,26 L120,28 L150,18 L180,22 L210,12 L240,15 L240,46 L0,46 Z" fill="url(#tesog)" />
        <path className="pres-draw" d="M0,38 L30,34 L60,36 L90,26 L120,28 L150,18 L180,22 L210,12 L240,15" stroke={VIOLETA} strokeWidth="2" fill="none" pathLength={100} />
      </svg>
      <div style={{ fontSize: 8, color: '#5b6b8c', textAlign: 'center' }}>Gastos · contactos · sueldos · conciliación</div>
    </div>
  );
}

function MockupMapaCalor() {
  const pins = [
    { x: 62, y: 40, c: '#EF4444' }, { x: 118, y: 72, c: AMBAR }, { x: 180, y: 52, c: '#EF4444' },
    { x: 92, y: 108, c: VERDE }, { x: 208, y: 96, c: AMBAR }, { x: 150, y: 30, c: VERDE },
  ];
  return (
    <div style={{ width: 290, padding: 14, background: '#0d1424', borderRadius: 14, border: '1px solid #223050' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Mapa de calor · Reclamos</div>
        <div style={{ fontSize: 8, color: '#5b6b8c' }}>últimos 30 días</div>
      </div>
      <div style={{ position: 'relative', height: 140, borderRadius: 10, background: '#101a30', overflow: 'hidden', marginBottom: 8 }}>
        <svg viewBox="0 0 260 140" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {[28, 62, 96, 124].map((y, i) => <line key={i} x1="0" y1={y} x2="260" y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="3" />)}
          {[52, 118, 186, 232].map((x, i) => <line key={`v${i}`} x1={x} y1="0" x2={x} y2="140" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />)}
          <line x1="0" y1="130" x2="260" y2="8" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
        </svg>
        <div className="pres-heat" style={{ position: 'absolute', left: 34, top: 14, width: 90, height: 90, borderRadius: '50%', background: 'radial-gradient(circle, rgba(239,68,68,0.5), transparent 65%)' }} />
        <div className="pres-heat" style={{ position: 'absolute', left: 150, top: 40, width: 110, height: 110, borderRadius: '50%', background: `radial-gradient(circle, ${AMBAR}55, transparent 65%)`, animationDelay: '900ms' }} />
        <div className="pres-heat" style={{ position: 'absolute', left: 60, top: 76, width: 70, height: 70, borderRadius: '50%', background: `radial-gradient(circle, ${VERDE}40, transparent 65%)`, animationDelay: '1700ms' }} />
        {pins.map((p, i) => (
          <div key={i} className="pres-cascade" style={{ position: 'absolute', left: p.x, top: p.y, animationDelay: `${300 + i * 220}ms` }}>
            <span className="pres-ping-wrap"><MapPin size={13} color={p.c} /><span className="pres-ping" style={{ background: p.c }} /></span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
        {[['Crítico', '#EF4444'], ['Medio', AMBAR], ['Bajo', VERDE]].map(([l, c], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: c as string }} />
            <span style={{ fontSize: 8, color: '#9fb0cc' }}>{l as string}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockupPanel() {
  const kpis: Array<[string, string, string]> = [
    ['HOY', '14', AZUL], ['EN CURSO', '38', AMBAR], ['RESUELTOS', '127', VERDE], ['SLA RIESGO', '3', '#EF4444'],
  ];
  return (
    <div style={{ width: 300, padding: 14, background: '#0d1424', borderRadius: 14, border: '1px solid #223050' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Dashboard · Panel de control</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="pres-dot-live" style={{ width: 5, height: 5, borderRadius: 99, background: VERDE, display: 'inline-block' }} />
          <div style={{ fontSize: 8, color: '#5b6b8c' }}>en vivo</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5, marginBottom: 9 }}>
        {kpis.map(([l, v, c], i) => (
          <div key={i} className="pres-cascade" style={{ padding: '7px 5px', background: `linear-gradient(160deg, ${c}18, #111b30)`, border: `1px solid ${c}40`, borderRadius: 8, textAlign: 'center', animationDelay: `${200 + i * 180}ms` }}>
            <div style={{ fontSize: 5.5, color: '#5b6b8c', fontWeight: 700, letterSpacing: '0.06em' }}>{l}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: c }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 52, padding: '0 4px', marginBottom: 8 }}>
        {[68, 44, 82, 30, 56, 72, 38, 62].map((h, i) => (
          <div key={i} className="pres-bar-rise" style={{ flex: 1, height: `${h}%`, borderRadius: '4px 4px 0 0', background: `linear-gradient(180deg, ${AZUL}, ${AZUL_MARCA})`, animationDelay: `${400 + i * 110}ms` }} />
        ))}
      </div>
      <div className="pres-cascade" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 9px', background: `${CIAN}10`, border: `1px solid ${CIAN}30`, borderRadius: 8, animationDelay: '1400ms' }}>
        <span className="pres-badge-glow" style={{ display: 'inline-flex' }}><Bell size={10} color={CIAN} /></span>
        <div style={{ fontSize: 8, color: '#9fb0cc' }}>"¿Cuántos reclamos de alumbrado este mes?" — Análisis con IA</div>
      </div>
    </div>
  );
}

function MockupTesoreriaFondo() {
  return (
    <div style={{ width: 290, padding: 14, background: '#0d1424', borderRadius: 14, border: '1px solid #223050' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', marginBottom: 9 }}>Liquidaciones · Julio</div>
      {([
        ['Sueldos del personal (42)', '$ 31,4M', '100ms'],
        ['Premio presentismo', '+ $ 1,2M', '350ms'],
        ['Alquiler corralón (recurrente)', '$ 850.000', '600ms'],
      ] as Array<[string, string, string]>).map(([n, v, d], i) => (
        <div key={i} className="pres-cascade" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 9px', background: '#111b30', borderRadius: 8, marginBottom: 5, animationDelay: d }}>
          <div style={{ fontSize: 8.5, color: '#c7d2e8' }}>{n}</div>
          <div style={{ fontSize: 8.5, fontWeight: 800, color: i === 1 ? VERDE : '#fff' }}>{v}</div>
        </div>
      ))}
      <div className="pres-cascade" style={{ display: 'flex', gap: 5, margin: '8px 0', animationDelay: '850ms' }}>
        <div style={{ flex: 1, padding: '6px 8px', background: `${VERDE}10`, border: `1px solid ${VERDE}30`, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 6.5, color: '#5b6b8c', fontWeight: 700 }}>CONCILIADO</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: VERDE }}>96%</div>
        </div>
        <div style={{ flex: 1, padding: '6px 8px', background: `${AMBAR}10`, border: `1px solid ${AMBAR}30`, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 6.5, color: '#5b6b8c', fontWeight: 700 }}>PRÓX. PAGOS</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: AMBAR }}>7 días</div>
        </div>
      </div>
      <div className="pres-cascade" style={{ position: 'relative', height: 54, borderRadius: 9, background: '#101a30', overflow: 'hidden', animationDelay: '1100ms' }}>
        <div className="pres-heat" style={{ position: 'absolute', left: 30, top: -14, width: 70, height: 70, borderRadius: '50%', background: `radial-gradient(circle, ${AMBAR}45, transparent 65%)` }} />
        <div className="pres-heat" style={{ position: 'absolute', right: 40, top: 0, width: 60, height: 60, borderRadius: '50%', background: `radial-gradient(circle, ${VIOLETA}40, transparent 65%)`, animationDelay: '800ms' }} />
        {[{ x: 52, y: 16 }, { x: 130, y: 26 }, { x: 208, y: 12 }].map((p, i) => (
          <MapPin key={i} size={11} color={AMBAR} style={{ position: 'absolute', left: p.x, top: p.y }} />
        ))}
        <div style={{ position: 'absolute', bottom: 4, width: '100%', textAlign: 'center', fontSize: 7.5, color: '#5b6b8c' }}>
          Gastos y contactos georreferenciados en el mapa
        </div>
      </div>
    </div>
  );
}

function MockupCircuitoReclamo() {
  const pasos: Array<[string, string, string, string]> = [
    ['Recibido por App', 'REC-01234 · con foto y ubicación', AZUL, '300ms'],
    ['Derivado a Obras Públicas', 'SLA de 72 hs corriendo', VIOLETA, '1100ms'],
    ['Orden de trabajo asignada', 'OT-0007 · Cuadrilla Bacheo', AMBAR, '1900ms'],
    ['Resuelto por la cuadrilla', 'Con foto del trabajo terminado', VERDE, '2700ms'],
    ['El vecino confirmó', 'El cierre lo valida el vecino', VERDE, '3500ms'],
  ];
  return (
    <div style={{ width: 280, padding: 14, background: '#0d1424', borderRadius: 14, border: '1px solid #223050' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Expediente REC-01234</div>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 8, top: 6, bottom: 6, width: 2, background: 'rgba(255,255,255,0.09)', borderRadius: 99 }} />
        {pasos.map(([t, d, c, delay], i) => (
          <div key={i} className="pres-step" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: i < pasos.length - 1 ? 10 : 0, position: 'relative', animationDelay: delay }}>
            <span style={{ width: 18, height: 18, minWidth: 18, borderRadius: 99, background: `${c}22`, border: `2px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
              <CheckCircle2 size={10} color={c} />
            </span>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>{t}</div>
              <div style={{ fontSize: 7.5, color: '#5b6b8c' }}>{d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockupCircuitoTramite() {
  return (
    <div style={{ width: 280, padding: 14, background: '#0d1424', borderRadius: 14, border: '1px solid #223050' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>SOL-2026-00312</div>
        <span className="pres-badge-glow" style={{ fontSize: 7.5, fontWeight: 700, color: AZUL, background: `${AZUL}1c`, padding: '2px 8px', borderRadius: 99 }}>EN CURSO</span>
      </div>
      <div style={{ fontSize: 9.5, color: '#c7d2e8', marginBottom: 9 }}>Habilitación comercial — Panadería La Espiga</div>
      <div style={{ fontSize: 7, color: '#5b6b8c', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 5 }}>DOCUMENTACIÓN</div>
      {([
        ['DNI del titular', true, '200ms'],
        ['Plano del local', true, '500ms'],
        ['Constancia AFIP', true, '2200ms'],
      ] as Array<[string, boolean, string]>).map(([doc, ok, d], i) => (
        <div key={i} className="pres-step" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: '#111b30', borderRadius: 7, marginBottom: 4, animationDelay: d }}>
          <CheckCircle2 size={10} color={ok ? VERDE : '#5b6b8c'} />
          <div style={{ flex: 1, fontSize: 8.5, color: '#c7d2e8' }}>{doc}</div>
          <FileCheck size={9} color="#5b6b8c" />
        </div>
      ))}
      <div className="pres-cascade" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 9px', background: `${CIAN}10`, border: `1px solid ${CIAN}30`, borderRadius: 8, margin: '8px 0 5px', animationDelay: '2800ms' }}>
        <CalendarClock size={10} color={CIAN} />
        <div style={{ fontSize: 8, color: '#9fb0cc' }}>Turno reservado · Habilitaciones · jueves 10:30</div>
      </div>
      <div className="pres-cascade" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 9px', background: `${VERDE}10`, border: `1px solid ${VERDE}30`, borderRadius: 8, animationDelay: '3300ms' }}>
        <span className="pres-badge-glow" style={{ display: 'inline-flex' }}><Bell size={10} color={VERDE} /></span>
        <div style={{ fontSize: 8, color: '#9fb0cc' }}>El vecino recibe una notificación en cada avance</div>
      </div>
    </div>
  );
}

// ============================================================
// Slides
// ============================================================

function HeroSlide({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 980 }}>
      <div className="pres-float" style={{ display: 'flex', justifyContent: 'center', marginBottom: isMobile ? 16 : 24, filter: `drop-shadow(0 12px 40px ${AZUL_MARCA}70)` }}>
        <MunifyMark size={isMobile ? 72 : 116} />
      </div>
      <div className="pres-hero-title" style={{
        fontSize: isMobile ? 'clamp(52px, 15vw, 84px)' : 'clamp(84px, 10vw, 132px)',
        fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1,
        fontFamily: FONT_DISPLAY,
      }}>
        Munify
      </div>
      <div className="pres-rise" style={{ fontSize: isMobile ? 19 : 30, fontWeight: 700, color: '#fff', marginTop: 18, animationDelay: '350ms' }}>
        El municipio, en el bolsillo del vecino.
      </div>
      <p className="pres-rise" style={{ fontSize: isMobile ? 13.5 : 17, color: 'rgba(255,255,255,0.65)', marginTop: 14, lineHeight: 1.6, animationDelay: '700ms' }}>
        Una plataforma integral de gestión municipal: reclamos, trámites, turnos,
        identidad digital y finanzas — para el vecino, para el funcionario y para la cuadrilla.
      </p>
      <div className="pres-rise" style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 26, flexWrap: 'wrap', animationDelay: '1050ms' }}>
        {[
          { icon: Smartphone, c: AZUL }, { icon: ClipboardList, c: VERDE }, { icon: Fingerprint, c: ROSA },
          { icon: CalendarClock, c: CIAN }, { icon: PiggyBank, c: VIOLETA },
        ].map((m, i) => (
          <div key={i} className="pres-float" style={{ width: 46, height: 46, borderRadius: 14, background: `${m.c}14`, border: `1px solid ${m.c}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', animationDelay: `${i * 350}ms` }}>
            <m.icon size={20} color={m.c} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Slide personalizado al cliente: /presentacion?para=San%20Martín lo activa.
 *  No es halago — es "escuchamos lo que necesitan": aterriza la presentación
 *  en los dolores que el propio municipio planteó. */
function makeParaMuniSlide(nombreMuni: string) {
  return function ParaMuniSlide({ isMobile }: { isMobile: boolean }) {
    const necesidades = [
      { icon: ClipboardList, c: AZUL, t: 'Reclamos punta a punta', d: 'Del vecino que reporta al cierre confirmado, sin papeles en el medio.' },
      { icon: Hammer, c: AMBAR, t: 'Órdenes de trabajo', d: 'Las cuadrillas con tareas formales: qué, quién, con qué y cuánto llevó.' },
      { icon: MessageCircle, c: VERDE, t: 'Todos los canales', d: 'App, ventanilla, web o teléfono — un solo expediente para el municipio.' },
      { icon: MapPin, c: ROSA, t: 'El trabajo en la calle', d: 'Mapa de calor, SLA y estadísticas para saber qué pasa en el territorio.' },
    ];
    return (
      <div style={{ maxWidth: 1000, width: '100%', textAlign: 'center' }}>
        <div className="pres-rise" style={{ fontSize: isMobile ? 13 : 15, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
          Preparado para
        </div>
        <div className="pres-hero-title" style={{ fontSize: isMobile ? 'clamp(38px, 11vw, 58px)' : 'clamp(56px, 7vw, 88px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: 20, fontFamily: FONT_DISPLAY }}>
          {nombreMuni}
        </div>
        <p className="pres-rise" style={{ fontSize: isMobile ? 13 : 15.5, color: 'rgba(255,255,255,0.7)', maxWidth: 640, margin: '0 auto 24px', lineHeight: 1.6, animationDelay: '300ms' }}>
          Escuchamos lo que están buscando. Esta presentación recorre exactamente eso:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, textAlign: 'left' }}>
          {necesidades.map((n, i) => (
            <Card key={i} color={n.c} className="pres-pop" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 18, animationDelay: `${450 + i * 180}ms` }}>
              <div style={{ minWidth: 40, height: 40, borderRadius: 12, background: `${n.c}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <n.icon size={19} color={n.c} />
              </div>
              <div>
                <div style={{ fontSize: isMobile ? 14.5 : 16, fontWeight: 800, color: '#fff', marginBottom: 3 }}>{n.t}</div>
                <div style={{ fontSize: isMobile ? 12 : 13, color: 'rgba(255,255,255,0.62)', lineHeight: 1.5 }}>{n.d}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  };
}

function ProblemaSlide({ isMobile }: { isMobile: boolean }) {
  const items = [
    { icon: Clock, color: AMBAR, t: 'La cola como único canal', d: 'Para todo hay que ir, esperar y volver. El horario del municipio manda sobre el del vecino.' },
    { icon: AlertTriangle, color: ROSA, t: 'Reclamos que se pierden', d: 'El pozo se denuncia por teléfono, queda en un papel, y nadie sabe en qué quedó.' },
    { icon: Bell, color: AZUL, t: 'El vecino sin respuesta', d: 'Reclamó, y después silencio. La falta de noticia se paga en confianza.' },
    { icon: Layers, color: VIOLETA, t: 'Gestión sin números', d: 'Sin datos por área ni tiempos de resolución, no hay dónde apoyar las decisiones.' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, maxWidth: 1000, width: '100%' }}>
      {items.map((it, i) => (
        <Card key={i} color={it.color} className="pres-pop" style={{ animationDelay: `${i * 160}ms` }}>
          <it.icon size={26} color={it.color} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{it.t}</div>
          <div style={{ fontSize: isMobile ? 12.5 : 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{it.d}</div>
        </Card>
      ))}
    </div>
  );
}

function QueEsSlide({ isMobile }: { isMobile: boolean }) {
  const caras = [
    { icon: Smartphone, color: AZUL, t: 'La app del vecino', d: 'Reclama, saca turnos, sigue sus trámites y paga sus tasas desde el celular. Con notificaciones en cada avance.' },
    { icon: Building2, color: VERDE, t: 'El panel del municipio', d: 'Cada dependencia ve SU bandeja: reclamos, trámites y agenda del día, con SLA y estadísticas.' },
    { icon: Hammer, color: AMBAR, t: 'El trabajo de campo', d: 'Cuadrillas con órdenes de trabajo formales: qué hacer, con qué materiales, cuántas horas llevó.' },
  ];
  return (
    <div style={{ maxWidth: 1050, width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 16 }}>
        {caras.map((c, i) => (
          <Card key={i} color={c.color} className="pres-pop" style={{ textAlign: 'center', padding: 28, animationDelay: `${i * 200}ms` }}>
            <div className="pres-float" style={{ display: 'inline-flex', animationDelay: `${i * 400}ms` }}>
              <c.icon size={34} color={c.color} style={{ marginBottom: 12 }} />
            </div>
            <div style={{ fontSize: isMobile ? 16 : 19, fontWeight: 800, color: '#fff', marginBottom: 8 }}>{c.t}</div>
            <div style={{ fontSize: isMobile ? 12.5 : 13.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{c.d}</div>
          </Card>
        ))}
      </div>
      <div className="pres-rise" style={{ textAlign: 'center', marginTop: 22, fontSize: isMobile ? 14 : 17, color: 'rgba(255,255,255,0.75)', animationDelay: '700ms' }}>
        Tres caras, <span style={{ color: AZUL, fontWeight: 800 }}>un solo expediente</span>: todos ven lo mismo, al mismo tiempo.
      </div>
    </div>
  );
}

function OmnicanalSlide({ isMobile }: { isMobile: boolean }) {
  const canales = [
    { icon: Smartphone, n: 'App', c: AZUL },
    { icon: Globe, n: 'Web', c: CIAN },
    { icon: ScanLine, n: 'Ventanilla', c: VIOLETA },
    { icon: MessageCircle, n: 'WhatsApp', c: VERDE },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.1fr', gap: isMobile ? 18 : 40, alignItems: 'center', maxWidth: 1100, width: '100%' }}>
      <div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          {canales.map((c, i) => (
            <div key={i} className="pres-pop" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 12, background: `${c.c}14`, border: `1px solid ${c.c}35`, animationDelay: `${i * 150}ms` }}>
              <c.icon size={16} color={c.c} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{c.n}</span>
            </div>
          ))}
        </div>
        <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: 12, animationDelay: '400ms' }}>
          Entre por donde entre, cae al mismo lugar.
        </div>
        <p className="pres-rise" style={{ fontSize: isMobile ? 13 : 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, animationDelay: '600ms' }}>
          El vecino digital usa la app. La señora de 70 va a la ventanilla. El apurado manda
          un WhatsApp. Del lado del municipio es siempre el mismo expediente, en la misma
          bandeja, con el canal de origen marcado — nadie carga nada dos veces.
        </p>
      </div>
      <MockupFrame color={AZUL} scale={1.45} isMobile={isMobile}>
        <MockupBandeja />
      </MockupFrame>
    </div>
  );
}

function ReclamoVecinoSlide({ isMobile }: { isMobile: boolean }) {
  const pasos = [
    'Saca una foto — la ubicación se detecta sola',
    'La IA clasifica el reclamo y lo enruta a la dependencia correcta',
    'Recibe una notificación con cada cambio de estado',
    'Al resolverse, confirma él mismo si quedó bien',
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.1fr', gap: isMobile ? 18 : 40, alignItems: 'center', maxWidth: 1100, width: '100%' }}>
      <MockupFrame color={AZUL} scale={1.55} isMobile={isMobile}>
        <MockupReclamoApp />
      </MockupFrame>
      <div>
        <Chip color={AZUL}>La cara del vecino</Chip>
        <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
          Un reclamo en 30 segundos, con seguimiento de principio a fin.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pasos.map((p, i) => (
            <div key={i} className="pres-cascade" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', animationDelay: `${400 + i * 250}ms` }}>
              <div style={{ minWidth: 24, height: 24, borderRadius: 99, background: `${AZUL}1e`, color: AZUL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{i + 1}</div>
              <div style={{ fontSize: isMobile ? 13 : 14.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>{p}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReclamoGestionSlide({ isMobile }: { isMobile: boolean }) {
  const feats = [
    { t: 'Bandeja por dependencia', d: 'Obras ve lo suyo, Servicios lo suyo. Nada se mezcla, nada se pierde.' },
    { t: 'SLA con semáforo', d: 'Cada categoría tiene su tiempo máximo; lo que está por vencer, avisa.' },
    { t: 'Mapa de calor', d: 'Dónde se concentran los problemas del distrito, de un vistazo.' },
    { t: 'Estadísticas por área', d: 'Tiempos de resolución y volumen por dependencia, para decidir con datos.' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr', gap: isMobile ? 18 : 40, alignItems: 'center', maxWidth: 1100, width: '100%' }}>
      <div>
        <Chip color={VERDE}>La cocina interna</Chip>
        <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
          Del otro lado del mostrador, orden.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          {feats.map((f, i) => (
            <div key={i} className="pres-pop" style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', animationDelay: `${350 + i * 170}ms` }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{f.t}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{f.d}</div>
            </div>
          ))}
        </div>
      </div>
      <MockupFrame color={VERDE} scale={1.4} isMobile={isMobile}>
        <MockupBandeja />
      </MockupFrame>
    </div>
  );
}

function OrdenesTrabajoSlide({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.1fr', gap: isMobile ? 18 : 40, alignItems: 'center', maxWidth: 1100, width: '100%' }}>
      <MockupFrame color={AMBAR} scale={1.5} isMobile={isMobile}>
        <MockupOrdenTrabajo />
      </MockupFrame>
      <div>
        <Chip color={AMBAR}>Trabajo de campo</Chip>
        <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 20 : 27, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
          El reclamo es la cara del vecino. La orden de trabajo es la tarea de la cuadrilla.
        </div>
        <p className="pres-rise" style={{ fontSize: isMobile ? 13 : 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 12, animationDelay: '400ms' }}>
          Cada orden lleva número, responsable, materiales y horas — la trazabilidad que un
          secretario de obras necesita. Un reclamo puede generar varias órdenes (el bacheo y
          la señalización del mismo pozo), y varios reclamos de la misma cuadra se resuelven
          con una sola.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Pendiente', 'Asignada', 'En curso', 'Completada'].map((e, i) => (
            <span key={i} className="pres-pop" style={{ fontSize: 11, fontWeight: 700, color: [AMBAR, AZUL, AZUL, VERDE][i], background: `${[AMBAR, AZUL, AZUL, VERDE][i]}1a`, padding: '4px 12px', borderRadius: 99, animationDelay: `${600 + i * 140}ms` }}>{e}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function IdentidadSlide({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ maxWidth: 1050, width: '100%', textAlign: 'center' }}>
      <MockupFrame color={VERDE} scale={1.3} scaleMobile={0.92} isMobile={isMobile} minHeight={260}>
        <MockupMostradorQR />
      </MockupFrame>
      <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 19 : 26, fontWeight: 800, color: '#fff', lineHeight: 1.3, margin: '18px 0 10px', animationDelay: '300ms' }}>
        Identidad real, validada contra <span style={{ color: AZUL }}>RENAPER</span> — sin instalar nada.
      </div>
      <p className="pres-rise" style={{ fontSize: isMobile ? 13 : 15, color: 'rgba(255,255,255,0.68)', lineHeight: 1.6, maxWidth: 780, margin: '0 auto', animationDelay: '500ms' }}>
        La funcionaria muestra un QR. El vecino lo escanea con su propio celular, se saca una
        foto con su DNI, y la biometría confirma quién es. El control vuelve solo a la
        ventanilla: la persona sale con su trámite hecho, sin crear cuentas ni instalar
        aplicaciones. Y si algún día quiere la app, su cuenta ya existe — verificada.
      </p>
      <div className="pres-pop" style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderRadius: 999, background: `${VERDE}14`, border: `1px solid ${VERDE}35`, animationDelay: '800ms' }}>
        <Fingerprint size={16} color={VERDE} />
        <span style={{ fontSize: 13, fontWeight: 700, color: VERDE }}>Los trámites sensibles exigen biometría — un mail no alcanza</span>
      </div>
    </div>
  );
}

function TurneroSlide({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.1fr', gap: isMobile ? 18 : 40, alignItems: 'center', maxWidth: 1100, width: '100%' }}>
      <div>
        <Chip color={CIAN}>Trámites y turnos</Chip>
        <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
          El vecino elige el trámite; el sistema le da el turno.
        </div>
        <p className="pres-rise" style={{ fontSize: isMobile ? 13 : 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 12, animationDelay: '400ms' }}>
          Cada municipio arma su propio catálogo: cuáles trámites se hacen online, cuáles por
          orden de llegada y cuáles con turno. El turno se reserva desde el celular o en la
          ventanilla, llega el recordatorio automático el día antes, y cada oficina abre su
          agenda del día con check-in por nombre, DNI o código.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Catálogo propio', 'Recordatorio 24 hs', 'Check-in en agenda', 'Ausentismo medido'].map((t, i) => (
            <span key={i} className="pres-pop" style={{ fontSize: 11, fontWeight: 700, color: CIAN, background: `${CIAN}1a`, padding: '4px 12px', borderRadius: 99, animationDelay: `${600 + i * 140}ms` }}>{t}</span>
          ))}
        </div>
      </div>
      <MockupFrame color={CIAN} scale={1.4} isMobile={isMobile}>
        <MockupAgendaTurnos />
      </MockupFrame>
    </div>
  );
}

function TesoreriaSlide({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.1fr', gap: isMobile ? 18 : 40, alignItems: 'center', maxWidth: 1100, width: '100%' }}>
      <MockupFrame color={VIOLETA} scale={1.4} isMobile={isMobile}>
        <MockupTesoreria />
      </MockupFrame>
      <div>
        <Chip color={VIOLETA}>Finanzas</Chip>
        <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
          Las cuentas del municipio, claras.
        </div>
        <p className="pres-rise" style={{ fontSize: isMobile ? 13 : 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 12, animationDelay: '400ms' }}>
          Gastos con comprobante, cajas y fondos con saldo en vivo, proveedores y contactos,
          liquidaciones de sueldos y conciliación bancaria. Hoy en uso productivo diario en
          un municipio real.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { icon: Wallet, t: 'Gastos' },
            { icon: PiggyBank, t: 'Cajas' },
            { icon: Users, t: 'Sueldos' },
            { icon: FileCheck, t: 'Conciliación' },
          ].map((f, i) => (
            <div key={i} className="pres-pop" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10, background: `${VIOLETA}14`, border: `1px solid ${VIOLETA}30`, animationDelay: `${600 + i * 140}ms` }}>
              <f.icon size={13} color={VIOLETA} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{f.t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModularSlide({ isMobile }: { isMobile: boolean }) {
  const segundos = useCountUp(10, 1800);
  const modulos = [
    { icon: ClipboardList, n: 'Reclamos', c: AZUL },
    { icon: FileCheck, n: 'Trámites', c: CIAN },
    { icon: CalendarClock, n: 'Turnos', c: VERDE },
    { icon: ScanLine, n: 'Mostrador', c: ROSA },
    { icon: Hammer, n: 'Órdenes', c: AMBAR },
    { icon: PiggyBank, n: 'Tesorería', c: VIOLETA },
  ];
  return (
    <div style={{ maxWidth: 1000, width: '100%', textAlign: 'center' }}>
      <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', marginBottom: 20 }}>
        Cada municipio prende lo que necesita.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6, 1fr)', gap: 12, marginBottom: 26 }}>
        {modulos.map((m, i) => (
          <div key={i} className="pres-pop pres-float" style={{ padding: '18px 8px', borderRadius: 14, background: `${m.c}10`, border: `1px solid ${m.c}30`, animationDelay: `${i * 120}ms, ${i * 380}ms` }}>
            <m.icon size={22} color={m.c} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{m.n}</div>
          </div>
        ))}
      </div>
      <div className="pres-rise" style={{ fontSize: isMobile ? 14 : 16, color: 'rgba(255,255,255,0.7)', animationDelay: '700ms' }}>
        Multi-municipio de nacimiento. Y un municipio de prueba, con datos y todos los módulos, se crea en
      </div>
      <div className="pres-glow-text" style={{ fontSize: isMobile ? 'clamp(56px, 14vw, 80px)' : 'clamp(72px, 9vw, 110px)', fontWeight: 900, color: AZUL, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {segundos} segundos
      </div>
    </div>
  );
}

function CierreSlide({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 900 }}>
      <div className="pres-float" style={{ display: 'flex', justifyContent: 'center', marginBottom: 20, filter: `drop-shadow(0 12px 36px ${AZUL_MARCA}70)` }}>
        <MunifyMark size={isMobile ? 54 : 78} />
      </div>
      <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 24 : 40, fontWeight: 900, color: '#fff', lineHeight: 1.2, marginBottom: 16, fontFamily: FONT_DISPLAY }}>
        Un municipio moderno <span className="pres-glow-text" style={{ color: AZUL }}>se nota</span> —
        en la calle y en el celular del vecino.
      </div>
      <p className="pres-rise" style={{ fontSize: isMobile ? 13.5 : 16, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, marginBottom: 24, animationDelay: '350ms' }}>
        Empezamos por el módulo que más le duela al distrito — reclamos, turnos, lo que sea —
        y crecemos por configuración, sin proyectos eternos. La demo está viva: la recorremos juntos.
      </p>
      <div className="pres-pop pres-btn-pulse" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 28px', borderRadius: 14, background: AZUL_MARCA, boxShadow: `0 18px 44px -12px ${AZUL_MARCA}90`, animationDelay: '650ms' }}>
        <MunifyMark size={18} />
        <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>app.munify.com.ar</span>
      </div>
    </div>
  );
}

function EngagementSlide({ isMobile }: { isMobile: boolean }) {
  const piezas = [
    { Mock: MockupWhatsApp, t: 'Bot de WhatsApp', d: 'Reclamos y consultas desde el chat, sin instalar nada.', c: VERDE },
    { Mock: MockupSeguimiento, t: 'Seguimiento en vivo', d: 'El vecino ve el estado de su reclamo paso a paso.', c: VIOLETA },
    { Mock: MockupLogros, t: 'Gamificación', d: 'Logros y reconocimiento para los vecinos más activos.', c: AMBAR },
  ];
  return (
    <div style={{ maxWidth: 1100, width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: isMobile ? 14 : 22, alignItems: 'start' }}>
        {piezas.map((p, i) => (
          <div key={i} className="pres-pop" style={{ textAlign: 'center', animationDelay: `${i * 220}ms` }}>
            <div className="pres-float" style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, animationDelay: `${i * 500}ms`, filter: `drop-shadow(0 14px 34px ${p.c}30)`, transform: isMobile ? 'scale(0.85)' : undefined }}>
              <p.Mock />
            </div>
            <div className="pres-display" style={{ fontSize: isMobile ? 16 : 19, fontWeight: 800, color: '#fff', marginBottom: 5 }}>{p.t}</div>
            <div style={{ fontSize: isMobile ? 12 : 13, color: 'rgba(255,255,255,0.62)', lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>{p.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CircuitoReclamoSlide({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.1fr', gap: isMobile ? 18 : 40, alignItems: 'center', maxWidth: 1100, width: '100%' }}>
      <MockupFrame color={VERDE} scale={1.35} isMobile={isMobile}>
        <MockupCircuitoReclamo />
      </MockupFrame>
      <div>
        <Chip color={VERDE}>El circuito completo</Chip>
        <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 20 : 27, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
          Cada reclamo es un expediente que se recorre solo.
        </div>
        <p className="pres-rise" style={{ fontSize: isMobile ? 13 : 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 12, animationDelay: '400ms' }}>
          Entra por cualquier canal, la dependencia correcta lo recibe con el SLA corriendo,
          la cuadrilla sale con su orden de trabajo, y al resolverse el vecino recibe la foto
          del trabajo terminado. El detalle que cambia todo: <strong style={{ color: VERDE }}>el
          cierre lo confirma el vecino</strong>, no el municipio — eso construye confianza.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Historial completo', 'SLA visible', 'Foto del antes y después', 'Cierre validado'].map((t, i) => (
            <span key={i} className="pres-pop" style={{ fontSize: 11, fontWeight: 700, color: VERDE, background: `${VERDE}1a`, padding: '4px 12px', borderRadius: 99, animationDelay: `${600 + i * 140}ms` }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MapaCalorSlide({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.1fr', gap: isMobile ? 18 : 40, alignItems: 'center', maxWidth: 1100, width: '100%' }}>
      <div>
        <Chip color={'#EF4444'}>El territorio</Chip>
        <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
          El mapa dice dónde duele el distrito.
        </div>
        <p className="pres-rise" style={{ fontSize: isMobile ? 13 : 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 12, animationDelay: '400ms' }}>
          Cada reclamo cae georreferenciado en el mapa. La capa de calor muestra dónde se
          concentran los problemas — por categoría, por barrio, por zona — y convierte miles
          de reclamos sueltos en una decisión: a qué cuadra mandar la próxima cuadrilla.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Capa de calor', 'Filtro por categoría', 'Zonas y barrios', 'Evolución en el tiempo'].map((t, i) => (
            <span key={i} className="pres-pop" style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', background: '#EF44441a', padding: '4px 12px', borderRadius: 99, animationDelay: `${600 + i * 140}ms` }}>{t}</span>
          ))}
        </div>
      </div>
      <MockupFrame color={'#EF4444'} scale={1.4} isMobile={isMobile}>
        <MockupMapaCalor />
      </MockupFrame>
    </div>
  );
}

function CircuitoTramiteSlide({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.1fr', gap: isMobile ? 18 : 40, alignItems: 'center', maxWidth: 1100, width: '100%' }}>
      <MockupFrame color={CIAN} scale={1.35} isMobile={isMobile}>
        <MockupCircuitoTramite />
      </MockupFrame>
      <div>
        <Chip color={CIAN}>El expediente digital</Chip>
        <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 20 : 27, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
          Del formulario en papel al expediente que avisa solo.
        </div>
        <p className="pres-rise" style={{ fontSize: isMobile ? 13 : 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 12, animationDelay: '400ms' }}>
          Cada trámite del catálogo dice qué documentación hace falta ANTES de empezar — se
          acabó el "le falta un papel, vuelva mañana". El vecino adjunta los documentos desde
          el celular, sigue los estados con su historial, y si el trámite es presencial, el
          turno ya viene incluido en el mismo expediente.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Requisitos claros', 'Documentos digitales', 'Historial de estados', 'Turno integrado'].map((t, i) => (
            <span key={i} className="pres-pop" style={{ fontSize: 11, fontWeight: 700, color: CIAN, background: `${CIAN}1a`, padding: '4px 12px', borderRadius: 99, animationDelay: `${600 + i * 140}ms` }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelSlide({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.1fr', gap: isMobile ? 18 : 40, alignItems: 'center', maxWidth: 1100, width: '100%' }}>
      <div>
        <Chip color={AZUL}>Tablero de control</Chip>
        <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
          La foto del municipio, en vivo.
        </div>
        <p className="pres-rise" style={{ fontSize: isMobile ? 13 : 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 12, animationDelay: '400ms' }}>
          El intendente y cada secretario abren el panel y ven el pulso del día: cuántos
          reclamos entraron, cuántos están en riesgo de vencer, cómo viene cada área. Con
          tablero kanban para la operación, planificación semanal del personal, y consultas
          en lenguaje natural con IA — preguntás como le preguntarías a una persona.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['KPIs del día', 'Tablero kanban', 'Planificación semanal', 'Consultas con IA'].map((t, i) => (
            <span key={i} className="pres-pop" style={{ fontSize: 11, fontWeight: 700, color: AZUL, background: `${AZUL}1a`, padding: '4px 12px', borderRadius: 99, animationDelay: `${600 + i * 140}ms` }}>{t}</span>
          ))}
        </div>
      </div>
      <MockupFrame color={AZUL} scale={1.42} isMobile={isMobile}>
        <MockupPanel />
      </MockupFrame>
    </div>
  );
}

function TesoreriaFondoSlide({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.1fr', gap: isMobile ? 18 : 40, alignItems: 'center', maxWidth: 1100, width: '100%' }}>
      <MockupFrame color={AMBAR} scale={1.38} isMobile={isMobile}>
        <MockupTesoreriaFondo />
      </MockupFrame>
      <div>
        <Chip color={AMBAR}>Tesorería a fondo</Chip>
        <div className="pres-rise pres-display" style={{ fontSize: isMobile ? 20 : 27, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
          Sueldos, pagos recurrentes y cada peso en el mapa.
        </div>
        <p className="pres-rise" style={{ fontSize: isMobile ? 13 : 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 12, animationDelay: '400ms' }}>
          Las liquidaciones se ejecutan en un click con premios configurables (presentismo,
          tareas extra). Los pagos recurrentes avisan antes de vencer. El extracto del banco
          se importa y se concilia contra los movimientos de caja. Y los gastos quedan
          georreferenciados: el mapa muestra dónde se invierte cada peso del municipio.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Liquidación 1-click', 'Premios configurables', 'Conciliación bancaria', 'Gasto en el mapa'].map((t, i) => (
            <span key={i} className="pres-pop" style={{ fontSize: 11, fontWeight: 700, color: AMBAR, background: `${AMBAR}1a`, padding: '4px 12px', borderRadius: 99, animationDelay: `${600 + i * 140}ms` }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Shell (portal fullscreen + auto-avance + controles)
// ============================================================

const SlideContentMemo = memo(function SlideContentMemo({ SlideComponent, isMobile }: {
  SlideComponent: (props: { isMobile: boolean }) => ReactNode;
  isMobile: boolean;
}) {
  return <>{<SlideComponent isMobile={isMobile} />}</>;
});

function useSlides(paraMuni: string | null): Slide[] {
  return useMemo<Slide[]>(() => [
    { key: 'hero', title: 'Munify', subtitle: 'Gestión municipal integral', icon: Building2, color: AZUL, Component: HeroSlide },
    // Slide dedicado al cliente (solo si la URL trae ?para=<Municipio>)
    ...(paraMuni ? [{
      key: 'para-muni', title: paraMuni, subtitle: 'Lo que escuchamos que necesitan',
      icon: Building2, color: AZUL, Component: makeParaMuniSlide(paraMuni),
    } satisfies Slide] : []),
    { key: 'problema', title: 'El problema', subtitle: 'Lo que hoy le pasa a cualquier municipio', icon: AlertTriangle, color: AMBAR, Component: ProblemaSlide },
    { key: 'que-es', title: 'Qué es Munify', subtitle: 'Una plataforma, tres caras', icon: Layers, color: VERDE, Component: QueEsSlide },
    { key: 'omnicanal', title: 'El vínculo con el vecino', subtitle: 'Omnicanalidad real', icon: MessageCircle, color: AZUL, Component: OmnicanalSlide },
    { key: 'engagement', title: 'El vínculo con el vecino', subtitle: 'WhatsApp, seguimiento en vivo y logros', icon: Bell, color: VERDE, Component: EngagementSlide },
    { key: 'rec-vecino', title: 'Reclamos', subtitle: 'La experiencia del vecino', icon: ClipboardList, color: AZUL, Component: ReclamoVecinoSlide },
    { key: 'rec-gestion', title: 'Reclamos', subtitle: 'La gestión puertas adentro', icon: Building2, color: VERDE, Component: ReclamoGestionSlide },
    { key: 'circuito-rec', title: 'Reclamos', subtitle: 'El circuito de punta a punta', icon: CheckCircle2, color: VERDE, Component: CircuitoReclamoSlide },
    { key: 'mapa-calor', title: 'El territorio', subtitle: 'Mapa de calor del distrito', icon: MapPin, color: '#EF4444', Component: MapaCalorSlide },
    { key: 'ot', title: 'Órdenes de trabajo', subtitle: 'La cuadrilla con trazabilidad', icon: Hammer, color: AMBAR, Component: OrdenesTrabajoSlide },
    { key: 'identidad', title: 'Identidad digital', subtitle: 'Biometría + RENAPER en la ventanilla', icon: Fingerprint, color: VERDE, Component: IdentidadSlide },
    { key: 'turnero', title: 'Trámites y turnos', subtitle: 'La agenda de cada oficina', icon: CalendarClock, color: CIAN, Component: TurneroSlide },
    { key: 'circuito-tram', title: 'Trámites', subtitle: 'El expediente digital completo', icon: FileCheck, color: CIAN, Component: CircuitoTramiteSlide },
    { key: 'panel', title: 'Panel de control', subtitle: 'KPIs, kanban, planificación e IA', icon: Layers, color: AZUL, Component: PanelSlide },
    { key: 'tesoreria', title: 'Tesorería', subtitle: 'En producción en un municipio real', icon: PiggyBank, color: VIOLETA, Component: TesoreriaSlide },
    { key: 'tesoreria-fondo', title: 'Tesorería', subtitle: 'Sueldos, conciliación y el gasto en el mapa', icon: Wallet, color: AMBAR, Component: TesoreriaFondoSlide },
    { key: 'modular', title: 'A medida', subtitle: 'Módulos activables por municipio', icon: Layers, color: AZUL, Component: ModularSlide },
    { key: 'cierre', title: 'Munify', subtitle: 'Próximo paso: la demo en vivo', icon: Building2, color: AZUL, Component: CierreSlide },
  ], [paraMuni]);
}

export default function PresentacionMunify() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const paraMuni = searchParams.get('para');
  const slides = useSlides(paraMuni);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(new Date());

  // Fraunces (display de marca) — se carga on-demand, no pesa en la app
  useEffect(() => {
    if (document.getElementById('font-fraunces')) return;
    const link = document.createElement('link');
    link.id = 'font-fraunces';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,900&display=swap';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (paused) return;
    setProgress(0);
    const tickMs = 50;
    const total = SLIDE_DURATION_MS / tickMs;
    let cur = 0;
    const id = setInterval(() => {
      cur++;
      setProgress((cur / total) * 100);
      if (cur >= total) {
        setCurrentSlide(s => (s + 1) % slides.length);
        cur = 0;
      }
    }, tickMs);
    return () => clearInterval(id);
  }, [paused, currentSlide, slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCurrentSlide(s => (s + 1) % slides.length);
      if (e.key === 'ArrowLeft') setCurrentSlide(s => (s - 1 + slides.length) % slides.length);
      if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
      if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length, navigate]);

  const slide = slides[currentSlide];

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: INK, color: '#fff', overflow: 'hidden' }}>
      {/* fondo vivo: orbes flotantes + grid sutil (navy/azure de marca) */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div className="pres-orb" style={{ position: 'absolute', top: '-12%', right: '-6%', width: 520, height: 520, borderRadius: '50%', background: `radial-gradient(circle, ${AZUL_MARCA}38, transparent 65%)`, filter: 'blur(10px)' }} />
        <div className="pres-orb" style={{ position: 'absolute', bottom: '-18%', left: '-8%', width: 620, height: 620, borderRadius: '50%', background: `radial-gradient(circle, ${NAVY}55, transparent 65%)`, filter: 'blur(12px)', animationDelay: '4s' }} />
        <div className="pres-orb" style={{ position: 'absolute', top: '30%', left: '42%', width: 380, height: 380, borderRadius: '50%', background: `radial-gradient(circle, ${AMBAR}16, transparent 65%)`, filter: 'blur(14px)', animationDelay: '8s' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '56px 56px', maskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)' }} />
      </div>

      {/* barra de progreso */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', position: 'relative', zIndex: 1 }}>
        <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg, ${AZUL_MARCA}, ${AZUL})`, transition: 'width 50ms linear', boxShadow: `0 0 10px ${AZUL}` }} />
      </div>

      {/* header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '12px 16px' : '16px 32px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="pres-logo-glow" style={{ width: 34, height: 34, borderRadius: 10, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MunifyMark size={19} />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.01em', fontFamily: FONT_DISPLAY }}>Munify</span>
          {!isMobile && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.14em', textTransform: 'uppercase', marginLeft: 8 }}>Presentación</span>}
        </div>
        {!isMobile && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
            {now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}
      </header>

      {/* slide actual */}
      <main key={currentSlide} className="pres-anim-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '10px 16px' : '10px 56px', minHeight: 0, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isMobile ? 14 : 22 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `${slide.color}1c`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <slide.icon size={18} color={slide.color} />
          </div>
          <div>
            <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 800, lineHeight: 1.1 }}>{slide.title}</div>
            {slide.subtitle && <div style={{ fontSize: isMobile ? 10.5 : 12, color: 'rgba(255,255,255,0.5)' }}>{slide.subtitle}</div>}
          </div>
        </div>
        <SlideContentMemo SlideComponent={slide.Component} isMobile={isMobile} />
      </main>

      {/* footer: contador + dots + controles */}
      <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '10px 16px 14px' : '12px 32px 18px', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontVariantNumeric: 'tabular-nums', minWidth: 52 }}>
          {currentSlide + 1} / {slides.length}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {slides.map((s, i) => (
            <button key={s.key} onClick={() => setCurrentSlide(i)} aria-label={s.title} style={{
              width: i === currentSlide ? 22 : 7, height: 7, borderRadius: 99, border: 'none', cursor: 'pointer',
              background: i === currentSlide ? AZUL : 'rgba(255,255,255,0.18)', transition: 'all 250ms ease', padding: 0,
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <CtrlBtn onClick={() => setCurrentSlide(s => (s - 1 + slides.length) % slides.length)}><ChevronLeft size={16} /></CtrlBtn>
          <CtrlBtn onClick={() => setPaused(p => !p)} active={paused}>{paused ? <Play size={16} /> : <Pause size={16} />}</CtrlBtn>
          <CtrlBtn onClick={() => setCurrentSlide(s => (s + 1) % slides.length)}><ChevronRight size={16} /></CtrlBtn>
          <CtrlBtn onClick={() => navigate('/')}><X size={16} /></CtrlBtn>
        </div>
      </footer>

      <style>{`
        .pres-display { font-family: 'Fraunces', Georgia, 'Times New Roman', serif; letter-spacing: -0.01em; }
        @keyframes presIn { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
        .pres-anim-in { animation: presIn 560ms cubic-bezier(0.16, 1, 0.3, 1) both; }

        @keyframes presPop { from { opacity: 0; transform: translateY(14px) scale(0.94); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .pres-pop { animation: presPop 560ms cubic-bezier(0.16, 1, 0.3, 1) both; }

        @keyframes presRise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .pres-rise { animation: presRise 640ms cubic-bezier(0.16, 1, 0.3, 1) both; }

        @keyframes presCascade { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: translateX(0); } }
        .pres-cascade { animation: presCascade 480ms cubic-bezier(0.16, 1, 0.3, 1) both; }

        @keyframes presFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
        .pres-float { animation: presFloat 5.5s ease-in-out infinite; }

        @keyframes presOrb { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(40px, -30px) scale(1.08); } 66% { transform: translate(-30px, 24px) scale(0.95); } }
        .pres-orb { animation: presOrb 16s ease-in-out infinite; }

        @keyframes presHeroGrad { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        .pres-hero-title {
          background: linear-gradient(110deg, #ffffff 20%, ${AZUL} 40%, #ffffff 60%, ${AZUL} 80%);
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: presHeroGrad 6s linear infinite;
        }

        @keyframes presScan { 0% { top: 8%; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { top: 88%; opacity: 0; } }
        .pres-scanline { animation: presScan 2.6s ease-in-out infinite; }

        @keyframes presStep { 0% { opacity: 0.18; filter: grayscale(1); } 100% { opacity: 1; filter: grayscale(0); } }
        .pres-step { animation: presStep 700ms ease both; }

        @keyframes presFlow { 0%, 100% { opacity: 0.15; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.15); } }
        .pres-flow-dot { animation: presFlow 1.4s ease-in-out infinite; }

        @keyframes presPing { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(3.2); opacity: 0; } }
        .pres-ping-wrap { position: relative; display: inline-flex; }
        .pres-ping { position: absolute; inset: 0; border-radius: 999px; animation: presPing 1.8s cubic-bezier(0, 0, 0.2, 1) infinite; }

        @keyframes presDotLive { 0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); } 50% { box-shadow: 0 0 0 5px rgba(34,197,94,0); } }
        .pres-dot-live { animation: presDotLive 1.6s ease-in-out infinite; }

        @keyframes presBarGrow { 0% { width: 6%; } 55% { width: 72%; } 100% { width: 72%; } }
        .pres-bar-grow { animation: presBarGrow 3.2s ease-in-out infinite; }

        @keyframes presDraw { from { stroke-dasharray: 100; stroke-dashoffset: 100; } to { stroke-dasharray: 100; stroke-dashoffset: 0; } }
        .pres-draw { animation: presDraw 2.2s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 300ms; }
        @keyframes presAreaFade { from { opacity: 0; } to { opacity: 1; } }
        .pres-area-fade { animation: presAreaFade 1.4s ease both; animation-delay: 1200ms; }

        @keyframes presShimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(220%); } }
        .pres-shimmer::after {
          content: ''; position: absolute; top: 0; bottom: 0; width: 45%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,0.09), transparent);
          animation: presShimmer 2.8s ease-in-out infinite;
        }

        @keyframes presBtnPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(0,136,204,0.45); } 50% { box-shadow: 0 0 0 9px rgba(0,136,204,0); } }
        .pres-btn-pulse { animation: presBtnPulse 2.2s ease-in-out infinite; }

        @keyframes presBadgeGlow { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        .pres-badge-glow { animation: presBadgeGlow 1.8s ease-in-out infinite; }

        @keyframes presLogoGlow { 0%, 100% { box-shadow: 0 0 14px 0 rgba(0,136,204,0.55); } 50% { box-shadow: 0 0 26px 4px rgba(56,189,248,0.5); } }
        .pres-logo-glow { animation: presLogoGlow 3.4s ease-in-out infinite; }

        @keyframes presGlowText { 0%, 100% { text-shadow: 0 0 22px rgba(91,155,255,0.45); } 50% { text-shadow: 0 0 44px rgba(91,155,255,0.85); } }
        .pres-glow-text { animation: presGlowText 2.6s ease-in-out infinite; }

        @keyframes presHeat { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 1; transform: scale(1.14); } }
        .pres-heat { animation: presHeat 3.6s ease-in-out infinite; }

        @keyframes presBarRise { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .pres-bar-rise { animation: presBarRise 900ms cubic-bezier(0.16, 1, 0.3, 1) both; transform-origin: bottom; }
      `}</style>
    </div>,
    document.body,
  );
}

function CtrlBtn({ children, onClick, active }: { children: ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} style={{
      width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? `${AZUL}25` : 'rgba(255,255,255,0.06)', border: `1px solid ${active ? AZUL : 'rgba(255,255,255,0.12)'}`,
      color: active ? AZUL : 'rgba(255,255,255,0.75)', cursor: 'pointer',
    }}>{children}</button>
  );
}

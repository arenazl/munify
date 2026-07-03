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
import { useNavigate } from 'react-router-dom';
import {
  Building2, Smartphone, Globe, ScanLine, ClipboardList, FileCheck,
  CalendarClock, Hammer, PiggyBank, MapPin, Users, ChevronLeft, ChevronRight,
  Pause, Play, X, Fingerprint, Bell, CheckCircle2, Layers, MessageCircle,
  AlertTriangle, Clock, Camera, QrCode, Wallet,
} from 'lucide-react';

const SLIDE_DURATION_MS = 14000;
const AZUL = '#38bdf8';
const AZUL_MARCA = '#0088cc';
const VERDE = '#22c55e';
const VIOLETA = '#8b5cf6';
const AMBAR = '#f59e0b';
const ROSA = '#f472b6';
const CIAN = '#06b6d4';

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

// ============================================================
// Slides
// ============================================================

function HeroSlide({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 980 }}>
      <div className="pres-hero-title" style={{
        fontSize: isMobile ? 'clamp(52px, 15vw, 84px)' : 'clamp(84px, 10vw, 132px)',
        fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1,
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
        <div className="pres-rise" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: 12, animationDelay: '400ms' }}>
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
        <div className="pres-rise" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
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
        <div className="pres-rise" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
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
        <div className="pres-rise" style={{ fontSize: isMobile ? 20 : 27, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
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
      <div className="pres-rise" style={{ fontSize: isMobile ? 19 : 26, fontWeight: 800, color: '#fff', lineHeight: 1.3, margin: '18px 0 10px', animationDelay: '300ms' }}>
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
        <div className="pres-rise" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
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
        <div className="pres-rise" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '14px 0', animationDelay: '200ms' }}>
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
      <div className="pres-rise" style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#fff', marginBottom: 20 }}>
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
      <div className="pres-rise" style={{ fontSize: isMobile ? 24 : 40, fontWeight: 900, color: '#fff', lineHeight: 1.2, marginBottom: 16 }}>
        Un municipio moderno <span className="pres-glow-text" style={{ color: AZUL }}>se nota</span> —
        en la calle y en el celular del vecino.
      </div>
      <p className="pres-rise" style={{ fontSize: isMobile ? 13.5 : 16, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, marginBottom: 24, animationDelay: '350ms' }}>
        Empezamos por el módulo que más le duela al distrito — reclamos, turnos, lo que sea —
        y crecemos por configuración, sin proyectos eternos. La demo está viva: la recorremos juntos.
      </p>
      <div className="pres-pop pres-btn-pulse" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 28px', borderRadius: 14, background: AZUL_MARCA, boxShadow: `0 18px 44px -12px ${AZUL_MARCA}90`, animationDelay: '650ms' }}>
        <Building2 size={18} color="#fff" />
        <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>app.munify.com.ar</span>
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

function useSlides(): Slide[] {
  return useMemo<Slide[]>(() => [
    { key: 'hero', title: 'Munify', subtitle: 'Gestión municipal integral', icon: Building2, color: AZUL, Component: HeroSlide },
    { key: 'problema', title: 'El problema', subtitle: 'Lo que hoy le pasa a cualquier municipio', icon: AlertTriangle, color: AMBAR, Component: ProblemaSlide },
    { key: 'que-es', title: 'Qué es Munify', subtitle: 'Una plataforma, tres caras', icon: Layers, color: VERDE, Component: QueEsSlide },
    { key: 'omnicanal', title: 'El vínculo con el vecino', subtitle: 'Omnicanalidad real', icon: MessageCircle, color: AZUL, Component: OmnicanalSlide },
    { key: 'rec-vecino', title: 'Reclamos', subtitle: 'La experiencia del vecino', icon: ClipboardList, color: AZUL, Component: ReclamoVecinoSlide },
    { key: 'rec-gestion', title: 'Reclamos', subtitle: 'La gestión puertas adentro', icon: Building2, color: VERDE, Component: ReclamoGestionSlide },
    { key: 'ot', title: 'Órdenes de trabajo', subtitle: 'La cuadrilla con trazabilidad', icon: Hammer, color: AMBAR, Component: OrdenesTrabajoSlide },
    { key: 'identidad', title: 'Identidad digital', subtitle: 'Biometría + RENAPER en la ventanilla', icon: Fingerprint, color: VERDE, Component: IdentidadSlide },
    { key: 'turnero', title: 'Trámites y turnos', subtitle: 'La agenda de cada oficina', icon: CalendarClock, color: CIAN, Component: TurneroSlide },
    { key: 'tesoreria', title: 'Tesorería', subtitle: 'En producción en un municipio real', icon: PiggyBank, color: VIOLETA, Component: TesoreriaSlide },
    { key: 'modular', title: 'A medida', subtitle: 'Módulos activables por municipio', icon: Layers, color: AZUL, Component: ModularSlide },
    { key: 'cierre', title: 'Munify', subtitle: 'Próximo paso: la demo en vivo', icon: Building2, color: AZUL, Component: CierreSlide },
  ], []);
}

export default function PresentacionMunify() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const slides = useSlides();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(new Date());

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: '#070d1a', color: '#fff', overflow: 'hidden' }}>
      {/* fondo vivo: orbes flotantes + grid sutil */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div className="pres-orb" style={{ position: 'absolute', top: '-12%', right: '-6%', width: 520, height: 520, borderRadius: '50%', background: `radial-gradient(circle, ${AZUL_MARCA}30, transparent 65%)`, filter: 'blur(10px)' }} />
        <div className="pres-orb" style={{ position: 'absolute', bottom: '-18%', left: '-8%', width: 620, height: 620, borderRadius: '50%', background: `radial-gradient(circle, ${AZUL}1e, transparent 65%)`, filter: 'blur(12px)', animationDelay: '4s' }} />
        <div className="pres-orb" style={{ position: 'absolute', top: '30%', left: '42%', width: 380, height: 380, borderRadius: '50%', background: `radial-gradient(circle, ${VIOLETA}14, transparent 65%)`, filter: 'blur(14px)', animationDelay: '8s' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '56px 56px', maskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)' }} />
      </div>

      {/* barra de progreso */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', position: 'relative', zIndex: 1 }}>
        <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg, ${AZUL_MARCA}, ${AZUL})`, transition: 'width 50ms linear', boxShadow: `0 0 10px ${AZUL}` }} />
      </div>

      {/* header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '12px 16px' : '16px 32px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="pres-logo-glow" style={{ width: 30, height: 30, borderRadius: 9, background: AZUL_MARCA, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={17} color="#fff" />
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.02em' }}>MUNIFY</span>
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

        @keyframes presGlowText { 0%, 100% { text-shadow: 0 0 22px rgba(56,189,248,0.45); } 50% { text-shadow: 0 0 44px rgba(56,189,248,0.85); } }
        .pres-glow-text { animation: presGlowText 2.6s ease-in-out infinite; }
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

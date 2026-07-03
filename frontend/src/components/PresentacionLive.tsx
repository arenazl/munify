// ============================================================
// PresentacionLive — recorrido guiado del PRODUCTO Munify.
//
// Modal fullscreen tipo kiosko que rota slides explicando todo el
// sistema: enfoque, modulos (con mockup real de cada pantalla),
// catalogos, reportes, multiplataforma y ventajas. Patron copiado del
// "Modo Live" (DashboardLive) + la guia de Fenix (mockups por slide).
//
// Reglas criticas respetadas (de la guia):
//  - interface Slide usa `Component` (capitalizado), no `render`.
//  - el array de slides va en useMemo([], []) — referencia estable.
//  - el contenido del slide va envuelto en React.memo (sin flicker a 50ms).
//  - las animaciones de entrada son clases CSS, no inline.
//
// Datos: hardcodeados (pitch fijo, igual en cualquier muni). El acento
// de color sale del theme del municipio (theme.primary).
// ============================================================
import { useEffect, useMemo, useState, memo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Play, Pause, ChevronLeft, ChevronRight, Sparkles,
  LayoutDashboard, ClipboardList, FileCheck, Receipt, Banknote, PiggyBank,
  Wallet, Camera, Trophy, ShieldCheck, Smartphone, Layers,
  Zap, Cpu, MapPin, BarChart3, Settings2, Globe,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import {
  MunifyMark, MockupDashboard, MockupReclamos, MockupMapaCalor,
  MockupTramite, MockupTesoreria, MockupCajas, MockupConciliacion,
  MockupSueldos, MockupCaptura, MockupSeguimiento, MockupWhatsApp,
  MockupLogros,
} from './reels/ReelMockups';

const SLIDE_DURATION_MS = 11000;
const BG = '#0E1830';  // ink navy de marca
const NAVY = '#103070'; // M exterior del logo
const FONT_DISPLAY = "'Fraunces', Georgia, 'Times New Roman', serif";

// ---- hooks ----
function useIsMobile(breakpoint = 760): boolean {
  const [is, setIs] = useState(() => typeof window !== 'undefined' && window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setIs(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return is;
}

interface SlideCtx {
  isMobile: boolean;
  accent: string;
  accent2: string;
}
interface Slide {
  key: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  color: string;
  Component: (ctx: SlideCtx) => ReactNode;
}

// ============================================================
// Helpers de layout
// ============================================================
const UPPER: React.CSSProperties = {
  fontSize: 12, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em',
  textTransform: 'uppercase', fontWeight: 700,
};

function Chip({ children, accent }: { children: ReactNode; accent: string }) {
  return (
    <div style={{
      padding: '6px 14px', borderRadius: 999, background: `${accent}1f`, color: accent,
      fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
      alignSelf: 'flex-start', border: `1px solid ${accent}44`,
    }}>{children}</div>
  );
}

// Slide de modulo: mockup grande a la izquierda + texto a la derecha.
function makeModuleSlide(opts: {
  q: string; use: string; example: string;
  bullets?: string[];
  Mockup: () => ReactNode;
}) {
  const { q, use, example, bullets, Mockup } = opts;
  return function ModuleSlide({ isMobile, accent }: SlideCtx) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1.05fr 1fr',
        gap: isMobile ? 18 : 44, alignItems: 'center',
        maxWidth: 1240, width: '100%', margin: '0 auto',
      }}>
        {/* Mockup */}
        <div className="presl-float" style={{
          padding: isMobile ? 16 : 30, borderRadius: 20,
          background: `radial-gradient(circle at 100% 0%, ${accent}18, transparent 60%), rgba(255,255,255,0.03)`,
          border: `1px solid ${accent}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: isMobile ? 230 : 400, overflow: 'hidden',
          boxShadow: `0 24px 60px -20px ${accent}33`,
        }}>
          <div style={{
            transform: isMobile ? 'scale(1.0)' : 'scale(1.55)',
            transformOrigin: 'center',
            filter: 'drop-shadow(0 10px 28px rgba(0,0,0,0.5))',
          }}>
            <Mockup />
          </div>
        </div>
        {/* Texto */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16 }}>
          <div className="presl-pop"><Chip accent={accent}>Pantalla en produccion</Chip></div>
          <div className="presl-rise" style={{ animationDelay: '150ms' }}>
            <div style={{ ...UPPER, fontSize: 12, marginBottom: 5 }}>Resuelve</div>
            <div style={{ fontSize: isMobile ? 24 : 32, fontWeight: 800, color: '#fff', lineHeight: 1.15, fontStyle: 'italic', fontFamily: FONT_DISPLAY }}>
              “{q}”
            </div>
          </div>
          <div className="presl-rise" style={{ animationDelay: '350ms' }}>
            <div style={{ ...UPPER, fontSize: 12, marginBottom: 6 }}>Que hace</div>
            <p style={{ fontSize: isMobile ? 14 : 16, color: 'rgba(255,255,255,0.85)', lineHeight: 1.55, margin: 0 }}>{use}</p>
          </div>
          {bullets && bullets.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {bullets.map((b, _bi) => (
                <span key={b} className="presl-pop" style={{
                  animationDelay: `${550 + _bi * 150}ms`,
                  fontSize: 12.5, color: 'rgba(255,255,255,0.82)', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 10px',
                }}>{b}</span>
              ))}
            </div>
          )}
          <div className="presl-rise" style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', animationDelay: '800ms' }}>
            <div style={{ ...UPPER, fontSize: 9.5, letterSpacing: '0.18em', marginBottom: 4 }}>Ejemplo real</div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>{example}</p>
          </div>
        </div>
      </div>
    );
  };
}

// ============================================================
// Slides "especiales" (no-modulo)
// ============================================================
function HeroSlide({ isMobile, accent }: SlideCtx) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: isMobile ? 18 : 26, maxWidth: 900, margin: '0 auto' }}>
      <div style={{
        width: isMobile ? 92 : 128, height: isMobile ? 92 : 128, borderRadius: 28,
        background: NAVY,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 22px 60px -16px ${accent}88`,
      }}>
        <MunifyMark size={isMobile ? 52 : 72} />
      </div>
      <h1 style={{ fontSize: isMobile ? 40 : 'clamp(56px, 8vw, 96px)', fontWeight: 900, color: '#fff', lineHeight: 1.02, margin: 0, letterSpacing: '-0.01em', fontFamily: FONT_DISPLAY }}>
        Una sola plataforma<br />para <span style={{ color: accent }}>todo el municipio</span>
      </h1>
      <p style={{ fontSize: isMobile ? 16 : 21, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, margin: 0, maxWidth: 720 }}>
        Reclamos, tramites y gestion financiera en un unico sistema con login unico.
        El vecino desde el celular; el municipio desde el panel. En tiempo real.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['Reclamos', 'Tramites', 'Tesoreria', 'Contaduria', 'Sueldos', 'Turnos'].map((m) => (
          <span key={m} style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '7px 16px' }}>{m}</span>
        ))}
      </div>
    </div>
  );
}

function EnfoqueSlide({ isMobile, accent }: SlideCtx) {
  const cols: { icon: ReactNode; t: string; d: string }[] = [
    { icon: <Smartphone />, t: 'App gratis para el vecino', d: 'iOS, Android, PWA y bot de WhatsApp. El vecino no paga nada — por eso la adopcion es real.' },
    { icon: <LayoutDashboard />, t: 'Panel unico de gestion', d: 'Login unico para reclamos, tramites y finanzas. El municipio gestiona todo desde un lugar.' },
    { icon: <ShieldCheck />, t: 'Validacion oficial RENAPER', d: 'Foto de DNI + selfie con prueba de vida. Le da validez gubernamental a cada tramite.' },
    { icon: <Layers />, t: 'Multi-tenant real', d: 'Los datos de cada municipio estan aislados, con sus colores, logo y dependencias.' },
  ];
  return (
    <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 26 }}>
      <p style={{ fontSize: isMobile ? 18 : 24, color: 'rgba(255,255,255,0.9)', lineHeight: 1.4, margin: 0, textAlign: 'center', fontWeight: 600 }}>
        El vecino reclama un bache, inicia un tramite o paga una tasa desde el celular.
        El municipio lo recibe, lo deriva, lo resuelve y le avisa — <span style={{ color: accent }}>todo conectado</span>.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
        {cols.map((c) => (
          <div key={c.t} style={{ display: 'flex', gap: 14, padding: 18, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, background: `${accent}22`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.icon}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 3 }}>{c.t}</div>
              <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{c.d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GridInfoSlide({ isMobile, accent, items, intro }: SlideCtx & { items: { icon: ReactNode; t: string; d: string }[]; intro?: string }) {
  return (
    <div style={{ maxWidth: 1140, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 22 }}>
      {intro && <p style={{ fontSize: isMobile ? 16 : 20, color: 'rgba(255,255,255,0.85)', textAlign: 'center', margin: 0, lineHeight: 1.45 }}>{intro}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 13 }}>
        {items.map((c) => (
          <div key={c.t} style={{ padding: 18, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: `${accent}22`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>{c.icon}</span>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{c.t}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{c.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VentajasSlide({ isMobile, accent, accent2 }: SlideCtx) {
  const ventajas: { icon: ReactNode; t: string; d: string }[] = [
    { icon: <Layers />, t: 'Integral', d: 'Un solo sistema con login unico para los tres bloques. La competencia los vende por separado.' },
    { icon: <Smartphone />, t: 'App gratis para el vecino', d: 'Play Store, App Store, PWA y WhatsApp. Si el vecino pagara, la adopcion seria cero.' },
    { icon: <ShieldCheck />, t: 'Validacion RENAPER', d: 'Le da validez oficial al tramite. No es solo un formulario en internet.' },
    { icon: <Layers />, t: 'Multi-tenant real', d: 'Datos de cada muni totalmente aislados, con su identidad.' },
    { icon: <Globe />, t: 'Multiplataforma', d: 'Panel web, PWA, app nativa, bot de WhatsApp y modo offline para cuadrillas.' },
    { icon: <Zap />, t: 'Implementacion en 1-2 semanas', d: 'No en 6 meses. Importa los datos existentes y convive con sistemas legacy via API.' },
    { icon: <Cpu />, t: 'IA integrada sin costo extra', d: 'Clasifica reclamos, detecta duplicados, sugiere asignacion y categoriza gastos.' },
    { icon: <Banknote />, t: 'Argentino, en pesos', d: 'Planes al tamano del municipio. La competencia internacional cobra en dolares.' },
  ];
  return (
    <div style={{ maxWidth: 1180, width: '100%', margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
      {ventajas.map((v, i) => (
        <div key={v.t} style={{
          display: 'flex', gap: 13, padding: 16, borderRadius: 14,
          background: `linear-gradient(135deg, ${(i % 2 ? accent2 : accent)}14, rgba(255,255,255,0.03))`,
          border: `1px solid ${(i % 2 ? accent2 : accent)}33`,
        }}>
          <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 11, background: `${(i % 2 ? accent2 : accent)}22`, color: (i % 2 ? accent2 : accent), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{v.icon}</span>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: '#fff', marginBottom: 2 }}>{v.t}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.66)', lineHeight: 1.45 }}>{v.d}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CierreSlide({ isMobile, accent }: SlideCtx) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: isMobile ? 18 : 28, maxWidth: 820, margin: '0 auto' }}>
      <div style={{ width: isMobile ? 80 : 104, height: isMobile ? 80 : 104, borderRadius: 24, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 22px 60px -16px ${accent}88` }}>
        <MunifyMark size={isMobile ? 46 : 60} />
      </div>
      <h2 style={{ fontSize: isMobile ? 34 : 'clamp(44px, 6vw, 72px)', fontWeight: 900, color: '#fff', lineHeight: 1.05, margin: 0, fontFamily: FONT_DISPLAY }}>
        Tu municipio, <span style={{ color: accent }}>en una sola app</span>
      </h2>
      <p style={{ fontSize: isMobile ? 16 : 20, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5, margin: 0 }}>
        Reclamos, tramites y finanzas conectados. App gratis para el vecino, validacion oficial,
        implementacion en semanas. <span style={{ color: '#fff', fontWeight: 700 }}>Munify.</span>
      </p>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
        {[['3', 'modulos integrados'], ['1-2', 'semanas de implementacion'], ['$0', 'para el vecino']].map(([n, l]) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: isMobile ? 30 : 42, fontWeight: 900, color: accent, lineHeight: 1 }}>{n}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Definicion de los slides (memoizada afuera del componente)
// ============================================================
function buildSlides(): Slide[] {
  return [
    { key: 'hero', title: 'Munify', subtitle: 'Recorrido del producto', icon: <Sparkles />, color: '#f5a623', Component: HeroSlide },
    { key: 'enfoque', title: 'El enfoque', subtitle: 'Vecino + municipio, conectados', icon: <Globe />, color: '#3b82f6', Component: EnfoqueSlide },

    { key: 'm-dashboard', title: 'Dashboard', subtitle: 'La foto del municipio en vivo', icon: <LayoutDashboard />, color: '#f5a623', Component: makeModuleSlide({
      q: 'Como venimos?',
      use: 'El resumen ejecutivo del municipio: reclamos activos, tiempos de resolucion, tendencia, mapa de calor y comparativa por periodo. Todo en tiempo real.',
      bullets: ['KPIs en vivo', 'Tendencia 30 dias', 'Modo Live para TV'],
      example: 'El intendente abre el panel y ve 245 reclamos, 89% resueltos, tiempo promedio 3.2 dias.',
      Mockup: MockupDashboard,
    }) },
    { key: 'm-reclamos', title: 'Reclamos', subtitle: 'Del vecino a la cuadrilla', icon: <ClipboardList />, color: '#3b82f6', Component: makeModuleSlide({
      q: 'Quien resuelve este bache?',
      use: 'El vecino reporta con foto y GPS. La IA clasifica y lo deriva a la dependencia correcta; el supervisor lo asigna a una cuadrilla y se cierra con foto antes/despues. El vecino recibe notificacion en cada paso.',
      bullets: ['Clasificacion por IA', 'Foto + GPS', 'Cuadrillas', 'Antes / despues'],
      example: 'Un vecino reporta una luminaria apagada; en 30 segundos queda derivada a Alumbrado con su numero de seguimiento.',
      Mockup: MockupReclamos,
    }) },
    { key: 'm-mapa', title: 'Mapa de calor', subtitle: 'Donde se concentran los problemas', icon: <MapPin />, color: '#22c55e', Component: makeModuleSlide({
      q: 'Donde tengo que mandar la cuadrilla?',
      use: 'Todos los reclamos georreferenciados en un mapa de calor. Se ven los focos por barrio, por categoria y la evolucion en el tiempo para planificar el trabajo.',
      bullets: ['Hotspots por zona', 'Filtros por categoria', 'Evolucion temporal'],
      example: 'El area de obras ve que el 40% de los baches se concentran en una avenida y prioriza esa cuadrilla.',
      Mockup: MockupMapaCalor,
    }) },
    { key: 'm-tramites', title: 'Tramites', subtitle: 'Sin pisar el municipio', icon: <FileCheck />, color: '#8b5cf6', Component: makeModuleSlide({
      q: 'Puedo hacer el tramite sin ir?',
      use: 'Habilitaciones, libre deuda, certificados y mas, desde el celular. El vecino sube la documentacion, se valida con biometria RENAPER, paga online y firma digital cuando corresponde.',
      bullets: ['RENAPER (DNI + selfie)', 'Pago online', 'Mostrador asistido'],
      example: 'Un comerciante inicia su habilitacion, valida su identidad con una selfie y la sigue online hasta la aprobacion.',
      Mockup: MockupTramite,
    }) },
    { key: 'm-tesoreria', title: 'Tesoreria', subtitle: 'La plata real del municipio', icon: <Receipt />, color: '#22d3ee', Component: makeModuleSlide({
      q: 'Cuanta plata tengo y donde?',
      use: 'Movimientos reales y saldos en vivo de cada caja y fondo (FOFINDE, coparticipacion, tesoro propio). Imputacion a obras, proyeccion a 30/60/90 dias y mapa de contactos con drill-down de gastos por proveedor.',
      bullets: ['Cajas y fondos en vivo', 'Proyeccion 30/60/90', 'Gastos por proveedor'],
      example: 'El tesorero ve el saldo de cada caja al instante y proyecta el flujo de los proximos 60 dias.',
      Mockup: MockupTesoreria,
    }) },
    { key: 'm-cajas', title: 'Cajas', subtitle: 'Cada fondo, su saldo', icon: <Wallet />, color: '#f5a623', Component: makeModuleSlide({
      q: 'Como esta cada caja?',
      use: 'El detalle de cada caja y fondo del municipio con su saldo, sus movimientos y su conciliacion. Sin Excel: todo el circuito queda registrado y trazable.',
      bullets: ['Saldo por caja', 'Movimientos trazables', 'Reemplaza el Excel'],
      example: 'Se carga un pago y la caja correspondiente actualiza su saldo automaticamente, sin doble carga.',
      Mockup: MockupCajas,
    }) },
    { key: 'm-contaduria', title: 'Contaduria', subtitle: 'Ordenes de pago con trazabilidad', icon: <Banknote />, color: '#a855f7', Component: makeModuleSlide({
      q: 'Esta todo en regla para el Tribunal de Cuentas?',
      use: 'El circuito formal de Ordenes de Pago: numero correlativo, PDF de factura adjunto, circuito pendiente -> autorizada -> pagada. Al pagar, genera el movimiento en Tesoreria automaticamente, sin doble carga.',
      bullets: ['OP con PDF adjunto', 'Circuito autorizada/pagada', 'Trazabilidad bidireccional'],
      example: 'Se emite la OP-2026-0001, se autoriza y al pagarla queda el movimiento en Tesoreria, todo enlazado.',
      Mockup: MockupConciliacion,
    }) },
    { key: 'm-sueldos', title: 'Sueldos', subtitle: 'Liquidaciones del personal', icon: <PiggyBank />, color: '#ec4899', Component: makeModuleSlide({
      q: 'Como liquido los sueldos este mes?',
      use: 'Liquidaciones al personal con monto base editable mes a mes y premios variables (presentismo, trabajo extra) desde un catalogo configurable. Vista de empleados y reportes de masa salarial.',
      bullets: ['Monto editable por mes', 'Premios variables', 'Masa salarial'],
      example: 'Se liquida la quincena con los premios de presentismo aplicados desde el catalogo, en minutos.',
      Mockup: MockupSueldos,
    }) },
    { key: 'm-captura', title: 'Cuadrillas en la calle', subtitle: 'Captura movil, hasta sin senal', icon: <Camera />, color: '#22c55e', Component: makeModuleSlide({
      q: 'Como cargo el trabajo desde la calle?',
      use: 'La cuadrilla saca la foto del antes/despues desde el celular, incluso sin senal (modo offline) — se sincroniza cuando vuelve la conexion. El vecino ve el avance en vivo.',
      bullets: ['Modo offline', 'Foto antes / despues', 'Sincroniza solo'],
      example: 'La cuadrilla termina el bacheo en una zona sin senal; al volver al radio urbano, se sube solo.',
      Mockup: MockupCaptura,
    }) },

    { key: 'catalogos', title: 'Catalogos y configuracion', subtitle: 'Cada muni, a su medida', icon: <Settings2 />, color: '#8b5cf6', Component: (ctx) => GridInfoSlide({ ...ctx,
      intro: 'Todo el sistema se configura por municipio, sin tocar codigo. Cada area arma sus propios catalogos.',
      items: [
        { icon: <ClipboardList />, t: 'Categorias de reclamo', d: 'Bacheo, alumbrado, residuos, arbolado... con su color, dependencia y SLA.' },
        { icon: <FileCheck />, t: 'Tipos de tramite', d: 'Documentacion requerida, validaciones, area que aprueba y si lleva pago.' },
        { icon: <Layers />, t: 'Dependencias', d: 'Las areas del municipio y quien gestiona cada cosa.' },
        { icon: <Receipt />, t: 'Conceptos financieros', d: 'Catalogos de cobros, pagos y liquidacion, separados.' },
        { icon: <Wallet />, t: 'Cajas y tarjetas', d: 'Los fondos del municipio y los medios de pago.' },
        { icon: <Settings2 />, t: 'Identidad del muni', d: 'Colores, logo, modulos activos. Multi-tenant real.' },
      ],
    }) },

    { key: 'reportes', title: 'Reportes', subtitle: 'Para decidir con datos', icon: <BarChart3 />, color: '#3b82f6', Component: (ctx) => GridInfoSlide({ ...ctx,
      intro: 'Cada modulo trae sus reportes exportables, pensados para rendir cuentas y tomar decisiones.',
      items: [
        { icon: <ClipboardList />, t: 'Reclamos', d: 'Tiempos por categoria y cuadrilla, hotspots, ranking de resolucion.' },
        { icon: <FileCheck />, t: 'Tramites', d: 'Volumen, tiempos y estados por tipo de tramite.' },
        { icon: <Banknote />, t: 'Contaduria', d: 'OPs vencidas, proximas a vencer y top beneficiarios.' },
        { icon: <Receipt />, t: 'Tesoreria', d: 'Egresos por caja, proyeccion y gastos por proveedor.' },
        { icon: <PiggyBank />, t: 'Sueldos', d: 'Masa salarial y evolucion del costo de personal.' },
        { icon: <BarChart3 />, t: 'Exportables', d: 'Todo se baja a Excel/PDF para el Tribunal de Cuentas.' },
      ],
    }) },

    { key: 'multi', title: 'Multiplataforma', subtitle: 'El vecino, por donde quiera', icon: <Smartphone />, color: '#22d3ee', Component: (ctx) => (
      <div style={{ display: 'grid', gridTemplateColumns: ctx.isMobile ? '1fr' : '1fr 1fr 1fr', gap: 16, maxWidth: 1100, margin: '0 auto', alignItems: 'center' }}>
        {[
          { M: MockupWhatsApp, t: 'Bot de WhatsApp', d: 'Reclamos y consultas desde el chat, sin instalar nada.' },
          { M: MockupSeguimiento, t: 'Seguimiento en vivo', d: 'El vecino ve el estado de su reclamo paso a paso.' },
          { M: MockupLogros, t: 'Gamificacion', d: 'Logros y reconocimiento para los vecinos mas activos.' },
        ].map((c) => (
          <div key={c.t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <div style={{ transform: ctx.isMobile ? 'scale(0.92)' : 'scale(1.0)', filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.5))' }}><c.M /></div>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: '#fff' }}>{c.t}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.62)', lineHeight: 1.45, maxWidth: 240 }}>{c.d}</div>
          </div>
        ))}
      </div>
    ) },

    { key: 'ventajas', title: 'Por que Munify', subtitle: 'Las ventajas, en claro', icon: <Trophy />, color: '#f5a623', Component: VentajasSlide },
    { key: 'cierre', title: 'Munify', subtitle: 'Gracias', icon: <Sparkles />, color: '#f5a623', Component: CierreSlide },
  ];
}

// memo del contenido — evita re-render por el tick del progress (50ms)
const SlideContentMemo = memo(function SlideContentMemo({ Comp, ctx }: { Comp: (c: SlideCtx) => ReactNode; ctx: SlideCtx }) {
  return <>{Comp(ctx)}</>;
});

// ============================================================
// Componente principal
// ============================================================
export default function PresentacionLive({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  const slides = useMemo(() => buildSlides(), []);
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  // Acentos de MARCA Munify (azul del logo), no del theme del muni:
  // el recorrido vende Munify, y la marca es el logo + su azul.
  void theme;
  const accent = '#5B9BFF';
  const accent2 = '#4070C0';

  // reset al abrir + tipografia de marca on-demand
  useEffect(() => {
    if (open) { setCurrent(0); setProgress(0); setPaused(false); }
    if (open && !document.getElementById('font-fraunces')) {
      const link = document.createElement('link');
      link.id = 'font-fraunces';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,900&display=swap';
      document.head.appendChild(link);
    }
  }, [open]);

  // auto-avance + barra de progreso
  useEffect(() => {
    if (!open || paused) return;
    setProgress(0);
    const tickMs = 50;
    const total = SLIDE_DURATION_MS / tickMs;
    let cur = 0;
    const id = setInterval(() => {
      cur++;
      setProgress((cur / total) * 100);
      if (cur >= total) { setCurrent((s) => (s + 1) % slides.length); cur = 0; }
    }, tickMs);
    return () => clearInterval(id);
  }, [open, paused, current, slides.length]);

  // teclado
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCurrent((s) => (s + 1) % slides.length);
      else if (e.key === 'ArrowLeft') setCurrent((s) => (s - 1 + slides.length) % slides.length);
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, slides.length, onClose]);

  if (!open) return null;

  const slide = slides[current];
  const ctx: SlideCtx = { isMobile, accent, accent2 };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: BG, color: '#fff' }}>
      {/* fondo decorativo */}
      <div className="pres-bg-blob" style={{ background: `radial-gradient(circle, ${accent}55, transparent 70%)` }} />
      <div className="pres-bg-blob pres-bg-blob-2" style={{ background: `radial-gradient(circle, ${accent2}44, transparent 70%)` }} />

      {/* barra de progreso */}
      <div style={{ position: 'relative', zIndex: 10, height: 3, width: '100%', background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg, ${accent}, ${accent2})`, boxShadow: `0 0 12px ${accent}`, transition: 'width 60ms linear' }} />
      </div>

      {/* header */}
      <header style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', gap: 12, padding: isMobile ? '12px 16px' : '16px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <MunifyMark size={26} />
        <span style={{ fontWeight: 700, fontSize: 16, fontFamily: FONT_DISPLAY }}>Munify</span>
        <span style={{ marginLeft: 6, fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Recorrido del producto</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>{current + 1} / {slides.length}</span>
        <button onClick={onClose} aria-label="Cerrar" style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}>
          <X size={18} />
        </button>
      </header>

      {/* contenido del slide */}
      <main className="pres-slide-anim" key={slide.key} style={{ position: 'relative', zIndex: 10, flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', padding: isMobile ? '18px 16px' : '28px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: isMobile ? 14 : 22, flexShrink: 0 }}>
          <span style={{ width: isMobile ? 40 : 48, height: isMobile ? 40 : 48, borderRadius: 14, background: `linear-gradient(135deg, ${slide.color}, ${slide.color}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: `0 8px 24px ${slide.color}55` }}>{slide.icon}</span>
          <div>
            <h2 style={{ fontSize: isMobile ? 20 : 28, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.1, fontFamily: FONT_DISPLAY }}>{slide.title}</h2>
            {slide.subtitle && <p style={{ fontSize: isMobile ? 12 : 14, color: 'rgba(255,255,255,0.5)', margin: 0 }}>{slide.subtitle}</p>}
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', minHeight: 0 }}>
          <SlideContentMemo Comp={slide.Component} ctx={ctx} />
        </div>
      </main>

      {/* footer: controles + dots */}
      <footer style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', gap: 14, padding: isMobile ? '10px 16px' : '14px 28px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.25)' }}>
        <button onClick={() => setCurrent((s) => (s - 1 + slides.length) % slides.length)} aria-label="Anterior" style={ctrlBtn}><ChevronLeft size={18} /></button>
        <button onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Reanudar' : 'Pausar'} style={{ ...ctrlBtn, background: accent, color: '#0b0f1a', borderColor: accent }}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>
        <button onClick={() => setCurrent((s) => (s + 1) % slides.length)} aria-label="Siguiente" style={ctrlBtn}><ChevronRight size={18} /></button>
        <div style={{ flex: 1, display: 'flex', gap: 5, overflowX: 'auto', justifyContent: 'center', maskImage: 'linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent)' }}>
          {slides.map((s, i) => (
            <button key={s.key} onClick={() => setCurrent(i)} aria-label={s.title} style={{
              height: 7, width: i === current ? 30 : 7, borderRadius: 999, flexShrink: 0,
              background: i === current ? accent : 'rgba(255,255,255,0.2)', border: 'none', transition: 'all 0.3s',
            }} />
          ))}
        </div>
      </footer>

      <style>{`
        @keyframes presSlideIn { from { opacity: 0; transform: translateX(36px); } to { opacity: 1; transform: translateX(0); } }
        .pres-slide-anim { animation: presSlideIn 600ms cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes preslRise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .presl-rise { animation: preslRise 640ms cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes preslPop { from { opacity: 0; transform: translateY(12px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .presl-pop { animation: preslPop 520ms cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes preslFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
        .presl-float { animation: preslFloat 5.5s ease-in-out infinite; }
        @keyframes presBlob { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(40px,-30px) scale(1.15); } }
        .pres-bg-blob { position: absolute; top: -10%; left: -5%; width: 50vw; height: 50vw; filter: blur(80px); opacity: 0.5; pointer-events: none; animation: presBlob 14s ease-in-out infinite; z-index: 0; }
        .pres-bg-blob-2 { top: auto; bottom: -15%; left: auto; right: -5%; animation-duration: 18s; animation-direction: reverse; }
      `}</style>
    </div>,
    document.body
  );
}

const ctrlBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.14)', flexShrink: 0,
};

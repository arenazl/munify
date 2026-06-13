// ============================================================
// Mockups de las pantallas de Munify para los reels.
// DARK MODE + acento naranja — copiando el look real de la app
// (dashboard, lista de trámites/reclamos, wizards, tesorería).
// Números ilustrativos/genéricos (marketing), nunca de un muni real.
// ============================================================
import {
  ClipboardList, FileCheck, Receipt, PiggyBank, Banknote, Camera,
  CheckCircle2, Bell, Trophy, MapPin, TrendingUp, Calendar, Clock,
  Wallet, User, X, ChevronRight, Sparkles, Radio,
} from 'lucide-react';
import { FONT_SANS } from './reelBrand';

// ---- Tokens del tema real de la app (dark + naranja) ----
const APP = {
  bg: '#14151A',
  card: '#1E1F27',
  card2: '#262834',
  line: 'rgba(255,255,255,0.08)',
  line2: 'rgba(255,255,255,0.05)',
  text: '#F4F5F7',
  text2: '#9AA1AC',
  text3: '#6B7280',
  orange: '#F5A623',
  orangeD: '#E08A12',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#22C55E',
  cyan: '#22D3EE',
  pink: '#EC4899',
  red: '#EF4444',
};

// ---- Logo oficial de Munify (paths del mark real) ----
export function MunifyMark({ size = 40, mono }: { size?: number; mono?: string }) {
  const white = mono || '#FFFFFF';
  const azure = mono || '#4070C0';
  return (
    <svg width={size} height={size * (1426 / 1271.65)} viewBox="0 0 1271.65 1426" style={{ display: 'block', overflow: 'visible' }}>
      <polygon fill={white} points="1271.65 371.24 1271.65 1069.5 635.82 1426 0 1069.5 0 356.5 635.82 0 1128.59 276.29 1000.48 381.26 636.9 177.4 160.18 444.69 160.18 979.27 636.9 1246.56 1113.62 979.27 1113.62 544.87 1271.65 371.24" />
      <polygon fill={azure} points="1446.79 79.97 1225.77 330.78 1113.62 458.05 644.86 989.99 448.06 781.76 448.06 568.98 637.63 759.38 1052.94 410.67 1179.19 304.66 1446.79 79.97" />
      <polygon fill={white} points="404.64 517.83 404.64 1037.89 253.8 953.49 253.8 500.38 332.09 454.86 404.64 517.83" />
      <polygon fill={white} points="1020.14 650.78 1020.14 954.08 867.22 1039.31 868.09 818.95 1020.14 650.78" />
    </svg>
  );
}

// ---- Frame base: ventana oscura de la app ----
function frame(w = 300): React.CSSProperties {
  return {
    width: w, background: APP.bg, borderRadius: 22, border: `1px solid ${APP.line}`,
    overflow: 'hidden', fontFamily: FONT_SANS, color: APP.text,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
  };
}

const STATUS: Record<string, string> = {
  Recibido: APP.blue, 'En curso': APP.purple, Finalizado: APP.green,
  Pendiente: APP.red, Pagado: APP.green, Programado: APP.orange,
};
function Pill({ label }: { label: string }) {
  const c = STATUS[label] || APP.blue;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 700, color: c, background: `${c}22`, border: `1px solid ${c}44`, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: c }} /> {label}
    </span>
  );
}

// KPI card oscura con borde de color (como la pantalla de Trámites)
function KpiBordered({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: `linear-gradient(160deg, ${color}1c, ${APP.card})`, border: `1px solid ${color}66`, borderRadius: 12, padding: '9px 10px' }}>
      <div style={{ fontSize: 7.5, color: APP.text2, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: APP.text, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 7.5, color: APP.text3 }}>{sub}</div>}
    </div>
  );
}

// ============================================================
// 1) Dashboard — hero muni + KPIs con icon chip + delta
// ============================================================
export function MockupDashboard() {
  const kpis = [
    { l: 'Total reclamos', v: '245', d: '+12%', up: true, c: APP.orange, Ic: ClipboardList },
    { l: 'Nuevos hoy', v: '8', d: '+5', up: true, c: APP.pink, Ic: Calendar },
    { l: 'Esta semana', v: '34', d: '+8%', up: true, c: APP.green, Ic: TrendingUp },
    { l: 'Tiempo prom.', v: '3.2d', d: '-0.5d', up: true, c: APP.purple, Ic: Clock },
  ];
  return (
    <div style={frame(308)}>
      {/* hero */}
      <div style={{ position: 'relative', padding: '13px 14px', background: 'linear-gradient(120deg, #1b2336, #14151A)', borderBottom: `1px solid ${APP.line}` }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ef444422', border: '1px solid #ef444455', color: APP.red, fontSize: 8, fontWeight: 800, padding: '2px 7px', borderRadius: 999, marginBottom: 7 }}>
          <Radio size={9} /> LIVE
        </div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Municipalidad de <span style={{ color: APP.orange }}>tu ciudad</span></div>
        <div style={{ fontSize: 8.5, color: APP.text2, marginTop: 2 }}>245 reclamos · 9.2d promedio</div>
      </div>
      {/* KPIs */}
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {kpis.map((k) => (
          <div key={k.l} style={{ background: APP.card, border: `1px solid ${APP.line}`, borderRadius: 12, padding: '9px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 7.5, color: APP.text2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.l}</span>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: `${k.c}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><k.Ic size={12} color={k.c} /></span>
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1 }}>{k.v}</div>
            <div style={{ display: 'inline-block', fontSize: 8, fontWeight: 700, color: APP.green, background: '#22c55e1f', borderRadius: 6, padding: '1px 6px', marginTop: 4 }}>{k.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 2) Reclamos — lista con tabs + status pills
// ============================================================
export function MockupReclamos() {
  const rows = [
    { t: 'Bache en Av. San Martín', cat: 'Vialidad', e: 'En curso', c: APP.orange },
    { t: 'Luminaria apagada', cat: 'Alumbrado', e: 'Recibido', c: APP.blue },
    { t: 'Recolección de ramas', cat: 'Higiene urbana', e: 'Finalizado', c: APP.green },
    { t: 'Semáforo intermitente', cat: 'Tránsito', e: 'En curso', c: APP.purple },
  ];
  return (
    <div style={frame(312)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderBottom: `1px solid ${APP.line}` }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>Reclamos</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, color: APP.bg, background: APP.orange, borderRadius: 7, padding: '4px 9px' }}>+ Nuevo</span>
      </div>
      {/* tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '9px 12px 4px' }}>
        {[['Todos', 245, true], ['Recibidos', 50], ['En curso', 58]].map(([l, n, active]) => (
          <span key={l as string} style={{ fontSize: 9, fontWeight: 700, color: active ? APP.orange : APP.text2, border: `1px solid ${active ? APP.orange : APP.line}`, background: active ? `${APP.orange}1a` : 'transparent', borderRadius: 999, padding: '4px 10px' }}>{l} ({n as number})</span>
        ))}
      </div>
      <div style={{ padding: '6px 12px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: APP.card, border: `1px solid ${APP.line}`, borderRadius: 11, padding: '9px 11px' }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: `${r.c}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ClipboardList size={13} color={r.c} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.t}</div>
              <div style={{ fontSize: 8.5, color: r.c }}>{r.cat}</div>
            </div>
            <Pill label={r.e} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 3) Mapa de calor — grilla oscura con focos
// ============================================================
export function MockupMapaCalor() {
  const dots = [
    { x: 28, y: 32, r: 30, c: '#ef4444' }, { x: 64, y: 28, r: 22, c: '#f59e0b' },
    { x: 46, y: 54, r: 38, c: '#ef4444' }, { x: 74, y: 62, r: 18, c: '#22c55e' },
    { x: 22, y: 70, r: 20, c: '#f59e0b' }, { x: 58, y: 76, r: 24, c: '#ef4444' },
  ];
  return (
    <div style={frame(308)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderBottom: `1px solid ${APP.line}` }}>
        <MapPin size={14} color={APP.orange} />
        <span style={{ fontSize: 12.5, fontWeight: 800 }}>Mapa de calor</span>
        <span style={{ marginLeft: 'auto', fontSize: 8.5, color: APP.text2 }}>Concentración de reclamos</span>
      </div>
      <div style={{ position: 'relative', height: 220, background: '#0c0d11' }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.14 }}>
          {[16, 32, 48, 64, 80].map((p) => <line key={`h${p}`} x1="0" y1={`${p}%`} x2="100%" y2={`${p}%`} stroke="#fff" strokeWidth="1" />)}
          {[16, 32, 48, 64, 80].map((p) => <line key={`v${p}`} x1={`${p}%`} y1="0" x2={`${p}%`} y2="100%" stroke="#fff" strokeWidth="1" />)}
        </svg>
        {dots.map((d, i) => (
          <div key={i} style={{ position: 'absolute', left: `${d.x}%`, top: `${d.y}%`, width: d.r, height: d.r, marginLeft: -d.r / 2, marginTop: -d.r / 2, borderRadius: 999, background: `radial-gradient(circle, ${d.c}, transparent 70%)`, filter: 'blur(2px)' }} />
        ))}
        <MapPin size={18} color="#fff" style={{ position: 'absolute', left: '46%', top: '50%' }} />
      </div>
    </div>
  );
}

// ============================================================
// 4) Trámite — wizard "Nuevo reclamo" (stepper + input + IA)
// ============================================================
export function MockupTramite() {
  const steps = [FileCheck, User, MapPin, ClipboardList, Camera, CheckCircle2];
  return (
    <div style={{ ...frame(330), borderTop: `3px solid ${APP.orange}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 4px' }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nuevo trámite</div>
          <div style={{ fontSize: 8.5, color: APP.text2 }}>Paso 1 de 6</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          {steps.map((Ic, i) => (
            <span key={i} style={{ width: 20, height: 20, borderRadius: 999, background: i === 0 ? APP.orange : APP.card2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic size={10} color={i === 0 ? APP.bg : APP.text3} />
            </span>
          ))}
          <X size={13} color={APP.text3} style={{ marginLeft: 2 }} />
        </div>
      </div>
      <div style={{ padding: '8px 14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: `${APP.orange}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileCheck size={14} color={APP.orange} /></span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>Qué</div>
            <div style={{ fontSize: 8.5, color: APP.text2 }}>Elegí el tipo de trámite</div>
          </div>
        </div>
        <div style={{ fontSize: 9.5, fontWeight: 700, marginBottom: 6 }}>Contanos qué necesitás</div>
        <div style={{ border: `1.5px solid ${APP.blue}`, background: '#1118', borderRadius: 10, padding: '11px 12px', fontSize: 10, color: APP.text3, boxShadow: `0 0 0 3px ${APP.blue}22` }}>
          Ej: "licencia de conducir", "certificado de domicilio"...
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: APP.orange, marginTop: 7 }}>
          <Sparkles size={10} /> Escribí en tus palabras y la IA sugiere la categoría
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderTop: `1px solid ${APP.line}`, background: '#0e0f13' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: APP.text2 }}>Anterior</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, color: APP.bg, background: `linear-gradient(135deg, ${APP.orange}, ${APP.orangeD})`, borderRadius: 9, padding: '7px 14px' }}>Siguiente <ChevronRight size={12} /></span>
      </div>
    </div>
  );
}

// ============================================================
// 5) Tesorería — lista de pagos (dark)
// ============================================================
export function MockupTesoreria() {
  const rows = [
    { t: 'Proveedor de insumos', m: '$ 480.000', e: 'Programado', Ic: Receipt },
    { t: 'Servicio eléctrico', m: '$ 1.250.000', e: 'Pagado', Ic: Wallet },
    { t: 'Combustible flota', m: '$ 320.000', e: 'Pendiente', Ic: Receipt },
  ];
  return (
    <div style={frame(312)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderBottom: `1px solid ${APP.line}` }}>
        <Receipt size={14} color={APP.orange} />
        <span style={{ fontSize: 12.5, fontWeight: 800 }}>Pagos</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, color: APP.bg, background: APP.orange, borderRadius: 7, padding: '4px 9px' }}>+ Nuevo</span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, i) => {
          const c = STATUS[r.e];
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: APP.card, border: `1px solid ${APP.line}`, borderRadius: 11, padding: '10px 12px' }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: `${c}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><r.Ic size={13} color={c} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.t}</div>
                <Pill label={r.e} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 800 }}>{r.m}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 6) Cajas — saldos (dark)
// ============================================================
export function MockupCajas() {
  const cajas = [
    { t: 'Caja central', m: '$ 4.820.000', c: APP.green },
    { t: 'Caja chica', m: '$ 145.000', c: APP.blue },
    { t: 'Banco Provincia', m: '$ 12.340.000', c: APP.orange },
  ];
  return (
    <div style={frame(300)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderBottom: `1px solid ${APP.line}` }}>
        <PiggyBank size={14} color={APP.orange} />
        <span style={{ fontSize: 12.5, fontWeight: 800 }}>Cajas y saldos</span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {cajas.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, background: `linear-gradient(160deg, ${c.c}14, ${APP.card})`, border: `1px solid ${c.c}55`, borderRadius: 12, padding: '12px 13px' }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: `${c.c}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PiggyBank size={16} color={c.c} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{c.t}</div>
              <div style={{ fontSize: 8.5, color: APP.text2 }}>Saldo actual</div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: c.c }}>{c.m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 7) Conciliación bancaria (dark)
// ============================================================
export function MockupConciliacion() {
  return (
    <div style={frame(316)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderBottom: `1px solid ${APP.line}` }}>
        <Banknote size={14} color={APP.orange} />
        <span style={{ fontSize: 12.5, fontWeight: 800 }}>Conciliación</span>
      </div>
      <div style={{ padding: 13 }}>
        {[
          { a: 'Extracto · -480.000', b: 'Pago insumos', ok: true },
          { a: 'Extracto · -1.250.000', b: 'Serv. eléctrico', ok: true },
          { a: 'Extracto · -75.000', b: 'Sin asignar', ok: false },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <div style={{ flex: 1, fontSize: 10, fontWeight: 600, background: APP.card, border: `1px solid ${APP.line}`, borderRadius: 9, padding: '8px 10px', color: APP.text2 }}>{r.a}</div>
            <Banknote size={14} color={r.ok ? APP.green : APP.text3} />
            <div style={{ flex: 1, fontSize: 10, fontWeight: 700, background: r.ok ? `${APP.green}1a` : `${APP.red}1a`, color: r.ok ? APP.green : APP.red, border: `1px solid ${r.ok ? APP.green : APP.red}44`, borderRadius: 9, padding: '8px 10px' }}>{r.b}</div>
          </div>
        ))}
        <div style={{ marginTop: 4, fontSize: 9.5, fontWeight: 700, color: APP.green, textAlign: 'center' }}>92% conciliado automáticamente</div>
      </div>
    </div>
  );
}

// ============================================================
// 8) Sueldos / Liquidaciones (dark)
// ============================================================
export function MockupSueldos() {
  const emp = [
    { n: 'Personal de planta', q: '142 empleados', m: '$ 38.4M' },
    { n: 'Contratados', q: '36 empleados', m: '$ 7.1M' },
  ];
  return (
    <div style={frame(300)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderBottom: `1px solid ${APP.line}` }}>
        <Wallet size={14} color={APP.orange} />
        <span style={{ fontSize: 12.5, fontWeight: 800 }}>Sueldos</span>
      </div>
      <div style={{ padding: 13 }}>
        <div style={{ background: `linear-gradient(135deg, ${APP.orange}, ${APP.orangeD})`, borderRadius: 13, padding: 13, marginBottom: 11, color: APP.bg }}>
          <div style={{ fontSize: 8.5, opacity: 0.85, fontWeight: 800, letterSpacing: '0.05em' }}>MASA SALARIAL DEL MES</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>$ 45.5M</div>
        </div>
        {emp.map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: APP.card, border: `1px solid ${APP.line}`, borderRadius: 11, padding: '10px 12px', marginBottom: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: `${APP.purple}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={13} color={APP.purple} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{e.n}</div>
              <div style={{ fontSize: 8.5, color: APP.text2 }}>{e.q}</div>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 800 }}>{e.m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 9) Captura móvil — el vecino saca la foto del problema
// ============================================================
export function MockupCaptura() {
  return (
    <div style={{ ...frame(230), background: '#0b0c10' }}>
      <div style={{ position: 'relative', height: 300, background: 'linear-gradient(180deg,#3a4a5a,#1f2933)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#5b6b7a 0%,#6b7280 55%,#4b5563 100%)' }} />
        <div style={{ position: 'absolute', left: '34%', top: '52%', width: 70, height: 42, borderRadius: '50%', background: 'radial-gradient(ellipse,#1a1f26,#33414e)', boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.6)' }} />
        <div style={{ position: 'absolute', inset: 16, border: '2px solid rgba(255,255,255,0.85)', borderRadius: 10 }} />
        {['tl', 'tr', 'bl', 'br'].map((c) => (
          <div key={c} style={{ position: 'absolute', width: 18, height: 18, border: `3px solid ${APP.orange}`, [c.includes('t') ? 'top' : 'bottom']: 12, [c.includes('l') ? 'left' : 'right']: 12, [c.includes('t') ? 'borderBottom' : 'borderTop']: 'none', [c.includes('l') ? 'borderRight' : 'borderLeft']: 'none', borderRadius: 3 } as React.CSSProperties} />
        ))}
        <div style={{ position: 'absolute', bottom: 18, left: '50%', marginLeft: -26, width: 52, height: 52, borderRadius: 999, background: '#fff', border: `4px solid ${APP.orange}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Camera size={22} color="#111" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 10) Seguimiento — timeline de estado (dark)
// ============================================================
export function MockupSeguimiento() {
  const steps = [
    { t: 'Recibido', d: 'Hoy 09:14', done: true },
    { t: 'Asignado a Obras', d: 'Hoy 09:20', done: true },
    { t: 'En curso', d: 'Cuadrilla en camino', done: true, active: true },
    { t: 'Resuelto', d: 'Pendiente', done: false },
  ];
  return (
    <div style={frame(256)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderBottom: `1px solid ${APP.line}` }}>
        <ClipboardList size={14} color={APP.orange} />
        <span style={{ fontSize: 12.5, fontWeight: 800 }}>Mi reclamo</span>
        <span style={{ marginLeft: 'auto' }}><Pill label="En curso" /></span>
      </div>
      <div style={{ padding: 16 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 11 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 18, height: 18, borderRadius: 999, background: s.done ? APP.orange : APP.card2, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: s.active ? `0 0 0 5px ${APP.orange}33` : 'none' }}>
                {s.done && <CheckCircle2 size={12} color={APP.bg} />}
              </div>
              {i < steps.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 22, background: s.done ? APP.orange : APP.card2 }} />}
            </div>
            <div style={{ paddingBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: s.active ? APP.orange : APP.text }}>{s.t}</div>
              <div style={{ fontSize: 9, color: APP.text2 }}>{s.d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 11) WhatsApp / IA — el bot atiende
// ============================================================
export function MockupWhatsApp() {
  return (
    <div style={{ ...frame(244), background: '#0b141a', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', background: '#1f2c34' }}>
        <div style={{ width: 26, height: 26, borderRadius: 999, background: APP.orange, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MunifyMark size={14} mono="#0b141a" />
        </div>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#fff' }}>Municipio</div>
          <div style={{ fontSize: 8.5, color: '#34d399' }}>en línea</div>
        </div>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200 }}>
        <Bubble side="in" c="#1f2c34" tc="#e9edef">Hola! Hay un árbol caído en Belgrano 450</Bubble>
        <Bubble side="out" c="#005c4b" tc="#e9fff5">Gracias. Registré tu reclamo <b>#1287</b> como <b>Arbolado · urgente</b> y lo derivé a Espacios Verdes.</Bubble>
        <Bubble side="out" c="#005c4b" tc="#e9fff5">Te aviso cuando la cuadrilla esté en camino.</Bubble>
      </div>
    </div>
  );
}
function Bubble({ side, c, tc, children }: { side: 'in' | 'out'; c: string; tc: string; children: React.ReactNode }) {
  return (
    <div style={{ alignSelf: side === 'out' ? 'flex-end' : 'flex-start', maxWidth: '82%', background: c, color: tc, fontSize: 10.5, lineHeight: 1.4, padding: '8px 11px', borderRadius: 12, borderBottomRightRadius: side === 'out' ? 3 : 12, borderBottomLeftRadius: side === 'in' ? 3 : 12 }}>
      {children}
    </div>
  );
}

// ============================================================
// 12) Logros — gamificación del vecino (dark)
// ============================================================
export function MockupLogros() {
  return (
    <div style={frame(248)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderBottom: `1px solid ${APP.line}` }}>
        <Trophy size={14} color={APP.orange} />
        <span style={{ fontSize: 12.5, fontWeight: 800 }}>Mis logros</span>
      </div>
      <div style={{ padding: 16, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, margin: '0 auto 10px', borderRadius: 999, background: `linear-gradient(135deg, ${APP.orange}, ${APP.orangeD})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 24px ${APP.orange}55` }}>
          <Trophy size={30} color={APP.bg} />
        </div>
        <div style={{ fontSize: 27, fontWeight: 800, color: APP.orange }}>+1.250</div>
        <div style={{ fontSize: 9.5, color: APP.text2, fontWeight: 700, marginBottom: 12, letterSpacing: '0.04em' }}>PUNTOS DE VECINO ACTIVO</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          {[TrendingUp, CheckCircle2, Bell].map((Ic, i) => (
            <div key={i} style={{ width: 36, height: 36, borderRadius: 10, background: APP.card, border: `1px solid ${APP.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic size={17} color={[APP.green, APP.blue, APP.purple][i]} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

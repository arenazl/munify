// ============================================================
// Mockups de las pantallas de Munify para los reels.
// Son versiones simplificadas (divs/SVG) de las pantallas REALES de la
// app — no screenshots. Surfaces claras para que "floten" sobre el navy.
// Números ilustrativos/genéricos (marketing), nunca de un muni real.
// ============================================================
import {
  ClipboardList, FileCheck, Wallet, Receipt, PiggyBank, Banknote,
  Camera, CheckCircle2, Bell, Trophy, MapPin, TrendingUp,
} from 'lucide-react';
import { BRAND, FONT_SANS } from './reelBrand';

// ---- Logo oficial de Munify (paths del mark real) ----
export function MunifyMark({ size = 40, mono }: { size?: number; mono?: string }) {
  const white = mono || '#FFFFFF';
  const azure = mono || BRAND.azure;
  return (
    <svg width={size} height={size * (1426 / 1271.65)} viewBox="0 0 1271.65 1426" style={{ display: 'block', overflow: 'visible' }}>
      <polygon fill={white} points="1271.65 371.24 1271.65 1069.5 635.82 1426 0 1069.5 0 356.5 635.82 0 1128.59 276.29 1000.48 381.26 636.9 177.4 160.18 444.69 160.18 979.27 636.9 1246.56 1113.62 979.27 1113.62 544.87 1271.65 371.24" />
      <polygon fill={azure} points="1446.79 79.97 1225.77 330.78 1113.62 458.05 644.86 989.99 448.06 781.76 448.06 568.98 637.63 759.38 1052.94 410.67 1179.19 304.66 1446.79 79.97" />
      <polygon fill={white} points="404.64 517.83 404.64 1037.89 253.8 953.49 253.8 500.38 332.09 454.86 404.64 517.83" />
      <polygon fill={white} points="1020.14 650.78 1020.14 954.08 867.22 1039.31 868.09 818.95 1020.14 650.78" />
    </svg>
  );
}

// ---- Frame base de "captura de pantalla" (surface clara sobre navy) ----
const CARD: React.CSSProperties = {
  width: 300,
  background: '#FFFFFF',
  borderRadius: 22,
  border: '1px solid rgba(14,24,48,0.08)',
  boxShadow: '0 24px 60px -18px rgba(0,0,0,0.55)',
  overflow: 'hidden',
  fontFamily: FONT_SANS,
  color: BRAND.ink,
};

function TopBar({ title, color }: { title: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid rgba(14,24,48,0.07)' }}>
      <div style={{ width: 9, height: 9, borderRadius: 99, background: color }} />
      <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</span>
      <span style={{ marginLeft: 'auto', fontSize: 9.5, color: '#8C948F', fontWeight: 600 }}>MUNIFY</span>
    </div>
  );
}

function Bars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56 }}>
      {values.map((v, i) => (
        <div key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, background: i === values.length - 1 ? color : `${color}55`, borderRadius: '4px 4px 0 0' }} />
      ))}
    </div>
  );
}

// ============================================================
// 1) Dashboard — KPIs + tendencia
// ============================================================
export function MockupDashboard() {
  return (
    <div style={CARD}>
      <TopBar title="Dashboard" color={BRAND.reclamos} />
      <div style={{ padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            { l: 'Reclamos', v: '1.284', c: BRAND.tramites },
            { l: 'Resueltos', v: '87%', c: BRAND.reclamos },
            { l: 'Esta semana', v: '156', c: '#8b5cf6' },
            { l: 'Promedio', v: '3.2d', c: BRAND.tesoreria },
          ].map((k) => (
            <div key={k.l} style={{ background: '#F7F8F7', borderRadius: 12, padding: '9px 11px' }}>
              <div style={{ fontSize: 8.5, color: '#8C948F', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.l}</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: k.c, lineHeight: 1.1 }}>{k.v}</div>
            </div>
          ))}
        </div>
        <div style={{ background: '#F7F8F7', borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 9, color: '#8C948F', fontWeight: 700, marginBottom: 8 }}>TENDENCIA 30 DÍAS</div>
          <Bars values={[5, 8, 6, 11, 9, 14, 12, 17]} color={BRAND.reclamos} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 2) Reclamos — lista con estados
// ============================================================
export function MockupReclamos() {
  const rows = [
    { t: 'Bache en Av. San Martín', e: 'En curso', c: BRAND.tesoreria },
    { t: 'Luminaria apagada', e: 'Recibido', c: BRAND.tramites },
    { t: 'Recolección de ramas', e: 'Finalizado', c: BRAND.reclamos },
    { t: 'Semáforo intermitente', e: 'En curso', c: BRAND.tesoreria },
  ];
  return (
    <div style={CARD}>
      <TopBar title="Reclamos" color={BRAND.reclamos} />
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F7F8F7', borderRadius: 12, padding: '10px 12px' }}>
            <ClipboardList size={16} color={r.c} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.t}</div>
              <div style={{ fontSize: 9, color: '#8C948F' }}>Reclamo #{1240 + i}</div>
            </div>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: r.c, background: `${r.c}1f`, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>{r.e}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 3) Mapa de calor
// ============================================================
export function MockupMapaCalor() {
  const dots = [
    { x: 28, y: 32, r: 30, c: '#ef4444' }, { x: 64, y: 28, r: 22, c: '#f59e0b' },
    { x: 46, y: 54, r: 38, c: '#ef4444' }, { x: 74, y: 62, r: 18, c: '#22c55e' },
    { x: 22, y: 70, r: 20, c: '#f59e0b' }, { x: 58, y: 76, r: 24, c: '#ef4444' },
  ];
  return (
    <div style={CARD}>
      <TopBar title="Mapa de calor" color="#ef4444" />
      <div style={{ position: 'relative', height: 220, background: 'linear-gradient(135deg,#16223f,#0E1830)' }}>
        {/* grilla de calles */}
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.18 }}>
          {[20, 40, 60, 80].map((p) => <line key={`h${p}`} x1="0" y1={`${p}%`} x2="100%" y2={`${p}%`} stroke="#fff" strokeWidth="1" />)}
          {[20, 40, 60, 80].map((p) => <line key={`v${p}`} x1={`${p}%`} y1="0" x2={`${p}%`} y2="100%" stroke="#fff" strokeWidth="1" />)}
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
// 4) Trámites — RENAPER / stepper
// ============================================================
export function MockupTramite() {
  return (
    <div style={CARD}>
      <TopBar title="Trámite online" color={BRAND.tramites} />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          {['DNI', 'Datos', 'Listo'].map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div style={{ width: 22, height: 22, borderRadius: 99, background: i <= 1 ? BRAND.tramites : '#E9ECE8', color: i <= 1 ? '#fff' : '#8C948F', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
              {i < 2 && <div style={{ flex: 1, height: 3, background: i < 1 ? BRAND.tramites : '#E9ECE8', borderRadius: 9 }} />}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: `${BRAND.tramites}12`, border: `1px solid ${BRAND.tramites}33`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <FileCheck size={20} color={BRAND.tramites} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700 }}>Identidad validada</div>
            <div style={{ fontSize: 9, color: '#8C948F' }}>RENAPER · DNI 30.111.222</div>
          </div>
          <CheckCircle2 size={18} color={BRAND.reclamos} style={{ marginLeft: 'auto' }} />
        </div>
        <div style={{ height: 11, background: '#F2F4F1', borderRadius: 9, marginBottom: 7 }} />
        <div style={{ height: 11, width: '70%', background: '#F2F4F1', borderRadius: 9 }} />
      </div>
    </div>
  );
}

// ============================================================
// 5) Tesorería — pagos programados
// ============================================================
export function MockupTesoreria() {
  const rows = [
    { t: 'Proveedor de insumos', m: '$ 480.000', e: 'Programado', c: BRAND.tesoreria },
    { t: 'Servicio eléctrico', m: '$ 1.250.000', e: 'Pagado', c: BRAND.reclamos },
    { t: 'Combustible flota', m: '$ 320.000', e: 'Pendiente', c: '#ef4444' },
  ];
  return (
    <div style={CARD}>
      <TopBar title="Pagos" color={BRAND.tesoreria} />
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F7F8F7', borderRadius: 12, padding: '11px 12px' }}>
            <Receipt size={16} color={r.c} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.t}</div>
              <span style={{ fontSize: 9, fontWeight: 700, color: r.c }}>{r.e}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 800 }}>{r.m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 6) Cajas — saldos
// ============================================================
export function MockupCajas() {
  const cajas = [
    { t: 'Caja central', m: '$ 4.820.000', c: BRAND.reclamos },
    { t: 'Caja chica', m: '$ 145.000', c: BRAND.tramites },
    { t: 'Banco Provincia', m: '$ 12.340.000', c: BRAND.tesoreria },
  ];
  return (
    <div style={CARD}>
      <TopBar title="Cajas y saldos" color={BRAND.tesoreria} />
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {cajas.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#F7F8F7', borderRadius: 12, padding: '12px 13px' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `${c.c}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PiggyBank size={17} color={c.c} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700 }}>{c.t}</div>
              <div style={{ fontSize: 9, color: '#8C948F' }}>Saldo actual</div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: c.c }}>{c.m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 7) Conciliación bancaria — match
// ============================================================
export function MockupConciliacion() {
  return (
    <div style={CARD}>
      <TopBar title="Conciliación" color={BRAND.tramites} />
      <div style={{ padding: 14 }}>
        {[
          { a: 'Extracto · -480.000', b: 'Pago insumos', ok: true },
          { a: 'Extracto · -1.250.000', b: 'Serv. eléctrico', ok: true },
          { a: 'Extracto · -75.000', b: 'Sin asignar', ok: false },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <div style={{ flex: 1, fontSize: 10.5, fontWeight: 600, background: '#F2F4F1', borderRadius: 9, padding: '8px 10px' }}>{r.a}</div>
            <Banknote size={14} color={r.ok ? BRAND.reclamos : '#E9ECE8'} />
            <div style={{ flex: 1, fontSize: 10.5, fontWeight: 600, background: r.ok ? `${BRAND.reclamos}14` : '#FDECEC', color: r.ok ? BRAND.ink : '#E5484D', borderRadius: 9, padding: '8px 10px' }}>{r.b}</div>
          </div>
        ))}
        <div style={{ marginTop: 4, fontSize: 10, fontWeight: 700, color: BRAND.reclamos, textAlign: 'center' }}>92% conciliado automáticamente</div>
      </div>
    </div>
  );
}

// ============================================================
// 8) Sueldos / Liquidaciones
// ============================================================
export function MockupSueldos() {
  const emp = [
    { n: 'Personal de planta', q: '142 empleados', m: '$ 38.4M' },
    { n: 'Contratados', q: '36 empleados', m: '$ 7.1M' },
  ];
  return (
    <div style={CARD}>
      <TopBar title="Sueldos" color="#8b5cf6" />
      <div style={{ padding: 14 }}>
        <div style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', borderRadius: 14, padding: 14, marginBottom: 11, color: '#fff' }}>
          <div style={{ fontSize: 9.5, opacity: 0.85, fontWeight: 700, letterSpacing: '0.05em' }}>MASA SALARIAL DEL MES</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>$ 45.5M</div>
        </div>
        {emp.map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F7F8F7', borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700 }}>{e.n}</div>
              <div style={{ fontSize: 9, color: '#8C948F' }}>{e.q}</div>
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
    <div style={{ ...CARD, width: 230 }}>
      <div style={{ position: 'relative', height: 300, background: 'linear-gradient(180deg,#3a4a5a,#1f2933)' }}>
        {/* "calle" con bache */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#5b6b7a 0%,#6b7280 55%,#4b5563 100%)' }} />
        <div style={{ position: 'absolute', left: '34%', top: '52%', width: 70, height: 42, borderRadius: '50%', background: 'radial-gradient(ellipse,#1a1f26,#33414e)', boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.6)' }} />
        {/* marco de cámara */}
        <div style={{ position: 'absolute', inset: 16, border: '2px solid rgba(255,255,255,0.85)', borderRadius: 10 }} />
        {['tl', 'tr', 'bl', 'br'].map((c) => (
          <div key={c} style={{ position: 'absolute', width: 18, height: 18, border: '3px solid ' + BRAND.reclamos, [c.includes('t') ? 'top' : 'bottom']: 12, [c.includes('l') ? 'left' : 'right']: 12, [c.includes('t') ? 'borderBottom' : 'borderTop']: 'none', [c.includes('l') ? 'borderRight' : 'borderLeft']: 'none', borderRadius: 3 } as React.CSSProperties} />
        ))}
        {/* botón de captura */}
        <div style={{ position: 'absolute', bottom: 18, left: '50%', marginLeft: -26, width: 52, height: 52, borderRadius: 999, background: '#fff', border: `4px solid ${BRAND.reclamos}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Camera size={22} color={BRAND.ink} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 10) Seguimiento — timeline de estado del reclamo
// ============================================================
export function MockupSeguimiento() {
  const steps = [
    { t: 'Recibido', d: 'Hoy 09:14', done: true },
    { t: 'Asignado a Obras', d: 'Hoy 09:20', done: true },
    { t: 'En curso', d: 'Cuadrilla en camino', done: true, active: true },
    { t: 'Resuelto', d: 'Pendiente', done: false },
  ];
  return (
    <div style={{ ...CARD, width: 250 }}>
      <TopBar title="Mi reclamo" color={BRAND.reclamos} />
      <div style={{ padding: 16 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 11, marginBottom: i < steps.length - 1 ? 4 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 18, height: 18, borderRadius: 999, background: s.done ? BRAND.reclamos : '#E9ECE8', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: s.active ? `0 0 0 5px ${BRAND.reclamos}33` : 'none' }}>
                {s.done && <CheckCircle2 size={12} color="#fff" />}
              </div>
              {i < steps.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 22, background: s.done ? BRAND.reclamos : '#E9ECE8' }} />}
            </div>
            <div style={{ paddingBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: s.active ? BRAND.reclamos : BRAND.ink }}>{s.t}</div>
              <div style={{ fontSize: 9.5, color: '#8C948F' }}>{s.d}</div>
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
    <div style={{ ...CARD, width: 240, background: '#0b141a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', background: '#1f2c34' }}>
        <div style={{ width: 26, height: 26, borderRadius: 999, background: BRAND.ia, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MunifyMark size={14} mono="#0b141a" />
        </div>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#fff' }}>Municipio</div>
          <div style={{ fontSize: 8.5, color: BRAND.ia }}>en línea</div>
        </div>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#0b141a', minHeight: 200 }}>
        <Bubble side="in" c="#1f2c34" tc="#e9edef">Hola! Hay un árbol caído en Belgrano 450</Bubble>
        <Bubble side="out" c={BRAND.ia} tc="#04231a">Gracias. Registré tu reclamo <b>#1287</b> como <b>Arbolado · urgente</b> y lo derivé a Espacios Verdes.</Bubble>
        <Bubble side="out" c={BRAND.ia} tc="#04231a">Te aviso cuando la cuadrilla esté en camino.</Bubble>
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
// 12) Logros — gamificación del vecino
// ============================================================
export function MockupLogros() {
  return (
    <div style={{ ...CARD, width: 240 }}>
      <TopBar title="Mis logros" color={BRAND.tesoreria} />
      <div style={{ padding: 16, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, margin: '0 auto 10px', borderRadius: 999, background: `linear-gradient(135deg,${BRAND.tesoreria},#f59e0b)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 24px ${BRAND.tesoreria}66` }}>
          <Trophy size={30} color="#fff" />
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: BRAND.tesoreria }}>+1.250</div>
        <div style={{ fontSize: 10, color: '#8C948F', fontWeight: 600, marginBottom: 12 }}>PUNTOS DE VECINO ACTIVO</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          {[TrendingUp, CheckCircle2, Bell].map((Ic, i) => (
            <div key={i} style={{ width: 36, height: 36, borderRadius: 10, background: '#F7F8F7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic size={17} color={[BRAND.reclamos, BRAND.tramites, '#8b5cf6'][i]} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

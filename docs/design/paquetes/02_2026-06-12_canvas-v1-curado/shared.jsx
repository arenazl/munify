// Shared icons (Lucide-style, 2px stroke, currentColor) and mock data.

const Icon = ({ d, size = 18, stroke = 2, fill = 'none', children, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {d ? <path d={d} /> : children}
  </svg>
);

// Common icon paths
const Icons = {
  Search:    (p) => <Icon size={p.size||18}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>,
  Plus:      (p) => <Icon size={p.size||18}><path d="M12 5v14M5 12h14"/></Icon>,
  Eye:       (p) => <Icon size={p.size||18}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></Icon>,
  Calendar:  (p) => <Icon size={p.size||18}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></Icon>,
  ChevronD:  (p) => <Icon size={p.size||14}><path d="m6 9 6 6 6-6"/></Icon>,
  ChevronL:  (p) => <Icon size={p.size||16}><path d="m15 18-6-6 6-6"/></Icon>,
  ChevronR:  (p) => <Icon size={p.size||16}><path d="m9 18 6-6-6-6"/></Icon>,
  ChevronU:  (p) => <Icon size={p.size||14}><path d="m18 15-6-6-6 6"/></Icon>,
  Grid:      (p) => <Icon size={p.size||18}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Icon>,
  Rows:      (p) => <Icon size={p.size||18}><path d="M3 6h18M3 12h18M3 18h18"/></Icon>,
  Sparkle:   (p) => <Icon size={p.size||18}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></Icon>,
  Contacts:  (p) => <Icon size={p.size||18}><circle cx="9" cy="8" r="4"/><path d="M2 22a7 7 0 0 1 14 0M17 11l2 2 4-4"/></Icon>,
  Folder:    (p) => <Icon size={p.size||18}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></Icon>,
  Map:       (p) => <Icon size={p.size||18}><path d="M3 6v15l6-3 6 3 6-3V3l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/></Icon>,
  Chart:     (p) => <Icon size={p.size||18}><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-7"/></Icon>,
  Settings:  (p) => <Icon size={p.size||18}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></Icon>,
  Dashboard: (p) => <Icon size={p.size||18}><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></Icon>,
  Wallet:    (p) => <Icon size={p.size||18}><path d="M3 7a2 2 0 0 1 2-2h14v4H5a2 2 0 0 1-2-2Z"/><rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="16" cy="13" r="1.2" fill="currentColor"/></Icon>,
  Bell:      (p) => <Icon size={p.size||18}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z"/><path d="M10 21a2 2 0 0 0 4 0"/></Icon>,
  Filter:    (p) => <Icon size={p.size||18}><path d="M3 5h18l-7 9v6l-4-2v-4Z"/></Icon>,
  Check:     (p) => <Icon size={p.size||18}><path d="m5 12 4.5 4.5L19 7"/></Icon>,
  X:         (p) => <Icon size={p.size||18}><path d="M6 6 18 18M6 18 18 6"/></Icon>,
  ArrowU:    (p) => <Icon size={p.size||14}><path d="M12 19V5M5 12l7-7 7 7"/></Icon>,
  ArrowD:    (p) => <Icon size={p.size||14}><path d="M12 5v14M5 12l7 7 7-7"/></Icon>,
  Sliders:   (p) => <Icon size={p.size||18}><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></Icon>,
  More:      (p) => <Icon size={p.size||18}><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></Icon>,
  Sort:      (p) => <Icon size={p.size||12}><path d="M7 4v16M3 8l4-4 4 4M17 4v16M13 16l4 4 4-4"/></Icon>,
  Receipt:   (p) => <Icon size={p.size||18}><path d="M4 3h16v18l-3-2-3 2-3-2-3 2-4-2V3Z"/><path d="M8 8h8M8 12h8M8 16h5"/></Icon>,
  Pin:       (p) => <Icon size={p.size||16}><path d="M12 17v5M9 3h6l-1 4 3 3v3H7v-3l3-3-1-4Z"/></Icon>,
  Refresh:   (p) => <Icon size={p.size||18}><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></Icon>,
  Download:  (p) => <Icon size={p.size||18}><path d="M12 3v12M6 11l6 6 6-6M5 21h14"/></Icon>,
  Bank:      (p) => <Icon size={p.size||18}><path d="M3 10 12 4l9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 21h18"/></Icon>,
  Card:      (p) => <Icon size={p.size||18}><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 11h20M6 16h4"/></Icon>,
  Wifi:      (p) => <Icon size={p.size||14}><path d="M5 12a10 10 0 0 1 14 0M8 15a6 6 0 0 1 8 0M11 18h2"/></Icon>,
};

// Avatar component (initials + brand-tinted background)
const COLORS = ['#00B37E','#FFB800','#3B82F6','#E5484D','#8B5CF6','#0EA5E9','#F472B6','#14B8A6'];
const Avatar = ({ name, size = 24 }) => {
  const initials = name.split(' ').filter(Boolean).slice(0,2).map(s => s[0]).join('').toUpperCase();
  const idx = name.split('').reduce((a,c) => a + c.charCodeAt(0), 0) % COLORS.length;
  const color = COLORS[idx];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '22', color: color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 600, flexShrink: 0,
      fontFamily: 'var(--font-sans)',
    }}>{initials}</div>
  );
};

// Logo mark (rounded square with stylized "m")
const Logo = ({ size = 36, color = '#00B37E' }) => (
  <svg width={size} height={size} viewBox="0 0 36 36">
    <rect x="0" y="0" width="36" height="36" rx="9" fill={color}/>
    <path d="M9 11v14M9 11c0-1 1-2 3-2s3 1 3 2v14M15 11c0-1 1-2 3-2s3 1 3 2v14M21 11c0-1 1-2 3-2s3 1 3 2v14"
      stroke="white" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
  </svg>
);

// Mock dataset — realistic municipal treasury entries.
const NOW = '2026-05-09';
const TXS = [
  // Pendientes IA (a revisar)
  { id:'p1', date:'09/05', day:'Hoy',     concept:'Combustible YPF · Camión recolector', dest:'YPF San Pedro Norte', tipo:'Servicios', monto:182500, pago:'Tarjeta corp.', financ:'Crédito', estado:'pendiente', aiFlag:'Revisar', aiReason:'Categoría sugerida: Combustibles', aiConf:0.94 },
  { id:'p2', date:'09/05', day:'Hoy',     concept:'Compras varias',                       dest:'Ferretería Don Aldo',  tipo:'Insumos',    monto:48200,  pago:'Efectivo',     financ:'Contado',  estado:'pendiente', aiFlag:'Revisar', aiReason:'Sin proveedor cargado', aiConf:0.62 },
  { id:'p3', date:'09/05', day:'Hoy',     concept:'Mantenimiento alumbrado público',      dest:'Elec. Norte SRL',      tipo:'Servicios', monto:96000,  pago:'Transferencia',financ:'Contado',  estado:'pendiente', aiFlag:'Revisar', aiReason:'Monto inusual para este proveedor', aiConf:0.78 },
  // Completados
  { id:'1', date:'09/05', day:'Hoy',      concept:'Pago de sueldos y jornales',           dest:'Nómina · 142 empleados', tipo:'Personal',  monto:13320000, pago:'Transferencia',financ:'Contado',  estado:'completado' },
  { id:'2', date:'09/05', day:'Hoy',      concept:'Pago de honorarios profesionales',     dest:'Avila Antonella',      tipo:'Personal',  monto:185000, pago:'Transferencia',financ:'Contado',  estado:'completado' },
  { id:'3', date:'09/05', day:'Hoy',      concept:'Compras varias',                       dest:'Elpidio Sosa',         tipo:'Insumos',   monto:30000,  pago:'Transferencia',financ:'Contado',  estado:'completado' },
  { id:'4', date:'09/05', day:'Hoy',      concept:'Compras varias',                       dest:'Caro Ávila',           tipo:'Insumos',   monto:30000,  pago:'Transferencia',financ:'Contado',  estado:'completado' },
  { id:'5', date:'08/05', day:'Ayer',     concept:'Pago de honorarios profesionales',     dest:'Alejandro Loza',       tipo:'Personal',  monto:124000, pago:'Transferencia',financ:'Contado',  estado:'completado' },
  { id:'6', date:'08/05', day:'Ayer',     concept:'Insumos de oficina',                   dest:'Guada Carranza',       tipo:'Insumos',   monto:54200,  pago:'Efectivo',     financ:'Contado',  estado:'completado' },
  { id:'7', date:'08/05', day:'Ayer',     concept:'Compras varias',                       dest:'Aldrin Garay',         tipo:'Insumos',   monto:30000,  pago:'Transferencia',financ:'Contado',  estado:'completado' },
  { id:'8', date:'08/05', day:'Ayer',     concept:'Servicio agua corriente',              dest:'Cooperativa Norte',    tipo:'Servicios', monto:78400,  pago:'Débito autom.',financ:'Contado',  estado:'completado' },
  { id:'9', date:'07/05', day:'7 mayo',   concept:'Reparación bomba sumergible',          dest:'HidroSur SRL',         tipo:'Servicios', monto:412000, pago:'Transferencia',financ:'Crédito',  estado:'completado' },
  { id:'10',date:'07/05', day:'7 mayo',   concept:'Compra papelería',                     dest:'Librería Centro',      tipo:'Insumos',   monto:22300,  pago:'Tarjeta corp.',financ:'Contado',  estado:'completado' },
  { id:'11',date:'07/05', day:'7 mayo',   concept:'Honorarios contables abril',           dest:'Estudio Pereyra',      tipo:'Personal',  monto:340000, pago:'Transferencia',financ:'Contado',  estado:'programado' },
];

const fmt = (n) => '$' + n.toLocaleString('es-AR');
const compact = (n) => n >= 1_000_000 ? '$' + (n/1_000_000).toFixed(1) + 'M' : n >= 1000 ? '$' + Math.round(n/1000) + 'k' : '$' + n;

// Tipos with colors
const TIPO_COLOR = {
  Personal:  '#3B82F6',
  Insumos:   '#FFB800',
  Servicios: '#8B5CF6',
  Obras:     '#00B37E',
};

Object.assign(window, { Icons, Avatar, Logo, TXS, fmt, compact, TIPO_COLOR });

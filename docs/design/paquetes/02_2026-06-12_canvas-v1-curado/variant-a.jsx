// Variant A — Conservadora con marca Mandao.
// Misma estructura, mismos componentes, mejor jerarquía + brand.

const A_W = 1480;
const A_H = 980;

const FORMAS = {
  'Transferencia': { icon: 'Bank', short: 'Transf.' },
  'Tarjeta corp.': { icon: 'Card', short: 'Tarjeta' },
  'Efectivo':      { icon: 'Wallet', short: 'Efectivo' },
  'Débito autom.': { icon: 'Refresh', short: 'Débito' },
};

const EstadoPill = ({ estado }) => {
  const map = {
    completado: { bg: '#E6F7F0', fg: '#008F63', dot: '#00B37E', label: 'Completado' },
    pendiente:  { bg: '#FEF3D9', fg: '#92660A', dot: '#F59E0B', label: 'Pendiente' },
    programado: { bg: '#E8F0FE', fg: '#1E40AF', dot: '#3B82F6', label: 'Programado' },
  };
  const s = map[estado];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px 3px 8px', borderRadius: 999,
      background: s.bg, color: s.fg, fontSize: 11.5, fontWeight: 600,
      letterSpacing: '.01em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }}/>
      {s.label}
    </span>
  );
};

const KPI = ({ label, value, sub, trend, accent }) => (
  <div style={{
    flex: 1, padding: '16px 18px',
    background: 'var(--surface)',
    border: '1px solid var(--border-1)',
    borderRadius: 14,
  }}>
    <div style={{ fontSize: 11.5, color: 'var(--fg-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
      <div className="display tnum" style={{ fontSize: 26, fontWeight: 600, color: accent || 'var(--fg-1)' }}>{value}</div>
      {trend && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          fontSize: 11, fontWeight: 600,
          color: trend.startsWith('+') ? '#008F63' : '#B43E42',
        }}>{trend}</span>
      )}
    </div>
    {sub && <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 4 }}>{sub}</div>}
  </div>
);

const FilterChip = ({ label, value, active, hasArrow = true }) => (
  <button style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 12px', borderRadius: 10,
    background: active ? 'var(--primary-soft)' : 'var(--surface)',
    border: `1px solid ${active ? 'var(--primary)' : 'var(--border-1)'}`,
    color: active ? 'var(--primary-dark)' : 'var(--fg-2)',
    fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
  }}>
    <span style={{ color: 'var(--fg-3)' }}>{label}:</span>
    <span style={{ fontWeight: 600 }}>{value}</span>
    {hasArrow && <Icons.ChevronD size={12} />}
  </button>
);

const SortHeader = ({ children, active, dir='desc' }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    color: active ? 'var(--fg-1)' : 'var(--fg-3)',
    fontWeight: 600, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase',
    cursor: 'pointer', userSelect: 'none',
  }}>
    {children}
    <span style={{ opacity: active ? 1 : 0.45, display: 'inline-flex' }}>
      {active && (dir === 'desc' ? <Icons.ArrowD size={11}/> : <Icons.ArrowU size={11}/>)}
      {!active && <Icons.Sort size={10}/>}
    </span>
  </div>
);

const PagoIcon = ({ kind }) => {
  const def = FORMAS[kind] || FORMAS['Transferencia'];
  const I = Icons[def.icon];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--fg-2)', fontSize: 13 }}>
      <span style={{ color: 'var(--fg-3)' }}><I size={14}/></span>
      {def.short}
    </span>
  );
};

const TableRowA = ({ tx, last }) => (
  <tr style={{
    borderBottom: last ? 'none' : '1px solid var(--border-1)',
  }}>
    <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
      <div style={{ color: 'var(--fg-2)', fontSize: 13, fontWeight: 500 }}>{tx.day}</div>
      <div style={{ color: 'var(--fg-4)', fontSize: 11.5, marginTop: 1 }} className="tnum">{tx.date}/2026</div>
    </td>
    <td style={{ padding: '14px 12px', verticalAlign: 'middle' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: TIPO_COLOR[tx.tipo] || 'var(--fg-4)', flexShrink: 0,
        }}/>
        <div>
          <div style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500 }}>{tx.concept}</div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 1 }}>{tx.tipo}</div>
        </div>
      </div>
    </td>
    <td style={{ padding: '14px 12px', verticalAlign: 'middle' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar name={tx.dest} size={26}/>
        <span style={{ fontSize: 13, color: 'var(--fg-1)' }}>{tx.dest}</span>
      </div>
    </td>
    <td style={{ padding: '14px 12px', verticalAlign: 'middle', textAlign: 'right' }}>
      <div className="display tnum" style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-1)' }}>{fmt(tx.monto)}</div>
      {tx.financ === 'Crédito' && (
        <div style={{ fontSize: 11, color: '#92660A', marginTop: 2, fontWeight: 500 }}>· crédito</div>
      )}
    </td>
    <td style={{ padding: '14px 12px', verticalAlign: 'middle' }}>
      <PagoIcon kind={tx.pago}/>
    </td>
    <td style={{ padding: '14px 12px', verticalAlign: 'middle' }}>
      <EstadoPill estado={tx.estado}/>
    </td>
    <td style={{ padding: '14px 16px', verticalAlign: 'middle', textAlign: 'right' }}>
      <button style={{
        background: 'transparent', border: 'none', padding: 6,
        color: 'var(--fg-3)', cursor: 'pointer', borderRadius: 6,
        display: 'inline-flex', alignItems: 'center',
      }}><Icons.More size={16}/></button>
    </td>
  </tr>
);

const NavItem = ({ icon: I, label, active, badge }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 12px', borderRadius: 10,
    background: active ? 'var(--primary-soft)' : 'transparent',
    color: active ? 'var(--primary-dark)' : 'var(--fg-2)',
    fontSize: 13.5, fontWeight: active ? 600 : 500, cursor: 'pointer',
    position: 'relative',
  }}>
    <I size={18}/>
    <span style={{ flex: 1 }}>{label}</span>
    {badge && (
      <span style={{
        background: 'var(--accent)', color: '#3a2a00',
        fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
      }}>{badge}</span>
    )}
    {active && <span style={{
      position: 'absolute', left: -16, top: 8, bottom: 8, width: 3,
      background: 'var(--primary)', borderRadius: '0 3px 3px 0',
    }}/>}
  </div>
);

const VariantA = () => {
  return (
    <div style={{
      width: A_W, height: A_H, background: 'var(--bg-1)', display: 'flex',
      fontFamily: 'var(--font-sans)', color: 'var(--fg-1)',
      overflow: 'hidden', position: 'relative',
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 240, background: 'var(--surface)',
        borderRight: '1px solid var(--border-1)',
        display: 'flex', flexDirection: 'column',
        padding: '18px 16px',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 18px' }}>
          <Logo size={32}/>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' }}>Munify</div>
            <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>San Pedro Norte</div>
          </div>
        </div>

        {/* User */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 10px', borderRadius: 12,
          background: 'var(--bg-2)', marginBottom: 18,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'var(--primary)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, fontSize: 12,
          }}>AD</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Admin De</div>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>Administrador</div>
          </div>
          <Icons.ChevronD size={12}/>
        </div>

        <div style={{ fontSize: 10.5, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '0 4px 6px', fontWeight: 600 }}>Gestión</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem icon={Icons.Dashboard} label="Dashboard"/>
          <NavItem icon={Icons.Wallet} label="Tesorería" active badge="7"/>
          <NavItem icon={Icons.Contacts} label="Contactos"/>
          <NavItem icon={Icons.Folder} label="Proyectos"/>
          <NavItem icon={Icons.Calendar} label="Agenda"/>
          <NavItem icon={Icons.Chart} label="Resumen"/>
        </div>

        <div style={{ flex: 1 }}/>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem icon={Icons.Settings} label="Configuración"/>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <header style={{
          padding: '18px 28px 14px',
          display: 'flex', alignItems: 'center', gap: 14,
          borderBottom: '1px solid var(--border-1)',
          background: 'var(--surface)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 500 }}>Gestión municipal</div>
            <h1 className="display" style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Tesorería</h1>
          </div>
          <div style={{
            position: 'relative', width: 320,
          }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)' }}>
              <Icons.Search size={16}/>
            </span>
            <input placeholder="Buscar concepto, proveedor, monto…" style={{
              width: '100%', padding: '9px 12px 9px 36px',
              borderRadius: 10, border: '1px solid var(--border-1)',
              background: 'var(--bg-2)', fontSize: 13, color: 'var(--fg-1)',
              fontFamily: 'inherit', outline: 'none',
            }}/>
          </div>
          <button style={{
            background: 'transparent', border: '1px solid var(--border-1)',
            borderRadius: 10, padding: '8px 10px', cursor: 'pointer',
            color: 'var(--fg-2)', display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'inherit', fontSize: 13,
          }}><Icons.Download size={15}/> Exportar</button>
          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-2)', position: 'relative' }}>
            <Icons.Bell size={20}/>
            <span style={{ position: 'absolute', top: 0, right: 0, width: 7, height: 7, borderRadius: '50%', background: 'var(--danger)', border: '2px solid white' }}/>
          </button>
          <button style={{
            background: 'var(--fg-1)', color: 'white',
            border: 'none', borderRadius: 10, padding: '9px 14px',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
          }}><Icons.Plus size={16}/> Nuevo gasto</button>
        </header>

        {/* Body */}
        <div style={{ flex: 1, padding: '20px 28px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* KPI strip + AI widget */}
          <div style={{ display: 'flex', gap: 12 }}>
            <KPI label="Gastado en mayo" value="$15,4M" sub="vs. $13,1M mes anterior" trend="+17%"/>
            <KPI label="Pendientes de pago" value="$340k" sub="1 movimiento programado"/>
            <KPI label="Movimientos del mes" value="143" sub="11 de hoy"/>
            {/* AI widget — sidebar/widget rol */}
            <div style={{
              flex: 1.3, padding: '14px 16px',
              background: 'linear-gradient(135deg, #0E2E25 0%, #0D1412 100%)',
              borderRadius: 14, color: 'white',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(0,179,126,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--primary)', flexShrink: 0,
              }}>
                <Icons.Sparkle size={18}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>3 gastos importados esperan revisión</div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
                  IA sugirió categoría · total <span className="tnum">$326.700</span>
                </div>
              </div>
              <button style={{
                background: 'var(--primary)', color: '#062B1F',
                border: 'none', borderRadius: 10, padding: '8px 12px',
                fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}>Revisar</button>
            </div>
          </div>

          {/* Filters bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <div style={{
              display: 'inline-flex', borderRadius: 10,
              border: '1px solid var(--border-1)', background: 'var(--surface)',
              padding: 2,
            }}>
              {['Mes','Año','Todos'].map((t, i) => (
                <button key={t} style={{
                  padding: '6px 12px', border: 'none',
                  background: i === 0 ? 'var(--fg-1)' : 'transparent',
                  color: i === 0 ? 'white' : 'var(--fg-2)',
                  fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                  borderRadius: 8, cursor: 'pointer',
                }}>{t}</button>
              ))}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border-1)',
              fontSize: 12.5, color: 'var(--fg-2)', fontWeight: 500,
            }}>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--fg-3)' }}><Icons.ChevronL size={14}/></button>
              <Icons.Calendar size={14}/>
              <span style={{ color: 'var(--fg-1)', fontWeight: 600 }}>Mayo 2026</span>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--fg-3)' }}><Icons.ChevronR size={14}/></button>
            </div>
            <div style={{ width: 1, height: 22, background: 'var(--border-1)', margin: '0 4px' }}/>
            <FilterChip label="Tipo" value="Todos"/>
            <FilterChip label="Forma de pago" value="Todas"/>
            <FilterChip label="Estado" value="Todos"/>
            <FilterChip label="Contacto" value="Todos"/>
            <div style={{ flex: 1 }}/>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 10px', borderRadius: 10,
              background: 'transparent', border: '1px dashed var(--border-2)',
              color: 'var(--fg-3)', fontSize: 12.5, fontWeight: 500,
              fontFamily: 'inherit', cursor: 'pointer',
            }}><Icons.Plus size={13}/> Más filtros</button>
          </div>

          {/* Table */}
          <div style={{
            background: 'var(--surface)', borderRadius: 14,
            border: '1px solid var(--border-1)', overflow: 'hidden',
            boxShadow: 'var(--shadow-card)',
          }}>
            {/* Table header strip */}
            <div style={{
              padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: '1px solid var(--border-1)',
              background: 'var(--bg-1)',
            }}>
              <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>
                <span style={{ fontWeight: 600, color: 'var(--fg-1)' }}>143 movimientos</span>
                <span style={{ color: 'var(--fg-3)' }}> · Mayo 2026</span>
              </div>
              <div style={{ flex: 1 }}/>
              <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>Total filtrado:</div>
              <div className="display tnum" style={{ fontSize: 15, fontWeight: 600 }}>$15.412.500</div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-1)', background: 'var(--bg-1)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left' }}><SortHeader active dir="desc">Fecha</SortHeader></th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}><SortHeader>Concepto</SortHeader></th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}><SortHeader>Destino</SortHeader></th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}><SortHeader>Monto</SortHeader></th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}><SortHeader>Forma de pago</SortHeader></th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}><SortHeader>Estado</SortHeader></th>
                  <th style={{ padding: '10px 16px', width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {TXS.filter(t => t.estado !== 'pendiente').slice(0, 9).map((tx, i, arr) =>
                  <TableRowA key={tx.id} tx={tx} last={i === arr.length - 1}/>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

window.VariantA = VariantA;
window.A_DIMS = { width: A_W, height: A_H };

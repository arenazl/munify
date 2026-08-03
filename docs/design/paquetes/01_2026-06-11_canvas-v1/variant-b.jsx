// Variant B — Arriesgada. Misma estructura, pero agrupada por día,
// panel IA permanente con cola de revisión visible, jerarquía marcada.

const B_W = 1480;
const B_H = 980;

const FORMAS_B = {
  'Transferencia': 'Bank',
  'Tarjeta corp.': 'Card',
  'Efectivo':      'Wallet',
  'Débito autom.': 'Refresh',
};

const TipoChip = ({ tipo }) => {
  const color = TIPO_COLOR[tipo] || '#5A6562';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px 2px 7px', borderRadius: 999,
      background: color + '14', color: color,
      fontSize: 11, fontWeight: 600, letterSpacing: '.01em',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }}/>
      {tipo}
    </span>
  );
};

const EstadoDot = ({ estado }) => {
  const map = {
    completado: { c: '#00B37E', l: 'Completado' },
    pendiente:  { c: '#F59E0B', l: 'Pendiente' },
    programado: { c: '#3B82F6', l: 'Programado' },
  };
  const s = map[estado];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-2)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.c, boxShadow: `0 0 0 3px ${s.c}1A` }}/>
      {s.l}
    </span>
  );
};

const NavItemB = ({ icon: I, label, active, badge }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 12px', borderRadius: 10,
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? 'white' : 'rgba(255,255,255,0.75)',
    fontSize: 13.5, fontWeight: active ? 600 : 500, cursor: 'pointer',
  }}>
    <I size={18}/>
    <span style={{ flex: 1 }}>{label}</span>
    {badge && (
      <span style={{
        background: active ? 'rgba(0,0,0,0.25)' : 'var(--accent)',
        color: active ? 'white' : '#3a2a00',
        fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
      }}>{badge}</span>
    )}
  </div>
);

const DayHeader = ({ label, sub, count, total }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 18px 10px', borderBottom: '1px solid var(--border-1)',
    background: 'var(--bg-2)',
  }}>
    <div style={{
      width: 38, height: 38, borderRadius: 10,
      background: 'var(--surface)', border: '1px solid var(--border-1)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <div className="display tnum" style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{sub.split('/')[0]}</div>
      <div style={{ fontSize: 8.5, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>{['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][parseInt(sub.split('/')[1])-1]}</div>
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 1 }}>{count} movimientos</div>
    </div>
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10.5, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>Subtotal</div>
      <div className="display tnum" style={{ fontSize: 16, fontWeight: 600, marginTop: 1 }}>{fmt(total)}</div>
    </div>
  </div>
);

const RowB = ({ tx, last }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: '52px 1fr 200px 110px 130px 36px',
    alignItems: 'center', gap: 14,
    padding: '14px 18px',
    borderBottom: last ? 'none' : '1px solid var(--border-1)',
  }}>
    <Avatar name={tx.dest} size={36}/>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-1)' }}>{tx.concept}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{tx.dest}</span>
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--fg-5)' }}/>
        <TipoChip tipo={tx.tipo}/>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--fg-2)', fontSize: 12.5 }}>
      <span style={{ color: 'var(--fg-3)', display: 'inline-flex' }}>
        {(() => { const I = Icons[FORMAS_B[tx.pago] || 'Bank']; return <I size={14}/>; })()}
      </span>
      <span>
        {tx.pago}
        {tx.financ === 'Crédito' && <span style={{ color: '#92660A', fontWeight: 600 }}> · crédito</span>}
      </span>
    </div>
    <EstadoDot estado={tx.estado}/>
    <div className="display tnum" style={{ fontSize: 16, fontWeight: 600, textAlign: 'right' }}>
      {fmt(tx.monto)}
    </div>
    <button style={{
      background: 'transparent', border: 'none', padding: 6, color: 'var(--fg-3)',
      cursor: 'pointer', borderRadius: 6, justifySelf: 'end',
    }}><Icons.More size={16}/></button>
  </div>
);

const AICard = ({ tx }) => (
  <div style={{
    padding: '14px',
    background: 'var(--surface)',
    border: '1px solid var(--border-1)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-card)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 7px', borderRadius: 999,
        background: 'var(--primary-soft)', color: 'var(--primary-dark)',
        fontSize: 10.5, fontWeight: 600,
      }}>
        <Icons.Sparkle size={10}/>
        IA · {Math.round(tx.aiConf * 100)}%
      </span>
      <span style={{ fontSize: 11, color: 'var(--fg-3)', marginLeft: 'auto' }}>{tx.date}</span>
    </div>
    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg-1)', lineHeight: 1.3 }}>{tx.concept}</div>
    <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 3 }}>{tx.dest}</div>

    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 10,
      marginTop: 10, paddingTop: 10,
      borderTop: '1px dashed var(--border-1)',
    }}>
      <div className="display tnum" style={{ fontSize: 18, fontWeight: 700 }}>{fmt(tx.monto)}</div>
      <TipoChip tipo={tx.tipo}/>
    </div>

    <div style={{
      fontSize: 11.5, color: 'var(--fg-3)', marginTop: 8, lineHeight: 1.4,
      display: 'flex', alignItems: 'flex-start', gap: 6,
    }}>
      <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}><Icons.Pin size={12}/></span>
      <span>{tx.aiReason}</span>
    </div>

    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
      <button style={{
        flex: 1, padding: '8px 10px', borderRadius: 9,
        background: 'var(--primary)', color: 'white', border: 'none',
        fontWeight: 600, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}><Icons.Check size={13}/> Aprobar</button>
      <button style={{
        padding: '8px 10px', borderRadius: 9,
        background: 'var(--bg-2)', color: 'var(--fg-2)', border: 'none',
        fontWeight: 600, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
      }}>Editar</button>
      <button style={{
        padding: '8px 9px', borderRadius: 9,
        background: 'transparent', color: 'var(--fg-3)', border: '1px solid var(--border-1)',
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
      }}><Icons.X size={14}/></button>
    </div>
  </div>
);

const MiniBar = ({ values, color = 'var(--primary)' }) => {
  const max = Math.max(...values);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 28 }}>
      {values.map((v, i) => (
        <div key={i} style={{
          width: 5, height: `${(v / max) * 100}%`,
          background: i === values.length - 1 ? color : color + '55',
          borderRadius: 2,
        }}/>
      ))}
    </div>
  );
};

const VariantB = () => {
  const pendientes = TXS.filter(t => t.estado === 'pendiente');
  const completados = TXS.filter(t => t.estado !== 'pendiente');

  // Group by day label
  const groups = {};
  for (const t of completados) {
    const k = `${t.day}|${t.date}`;
    (groups[k] = groups[k] || { label: t.day, sub: t.date, items: [] }).items.push(t);
  }
  const groupList = Object.values(groups);

  return (
    <div style={{
      width: B_W, height: B_H, background: 'var(--bg-2)', display: 'flex',
      fontFamily: 'var(--font-sans)', color: 'var(--fg-1)',
      overflow: 'hidden',
    }}>
      {/* Sidebar — DARK variant for boldness */}
      <aside style={{
        width: 232, background: '#0E1F1A',
        display: 'flex', flexDirection: 'column',
        padding: '18px 16px', color: 'white',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 18px' }}>
          <Logo size={32}/>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' }}>Munify</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>San Pedro Norte</div>
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px', borderRadius: 12,
          background: 'rgba(255,255,255,0.05)', marginBottom: 18,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'var(--primary)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, fontSize: 12,
          }}>AD</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Admin De</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)' }}>Administrador</div>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}><Icons.ChevronD size={12}/></span>
        </div>

        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '0 4px 6px', fontWeight: 600 }}>Gestión</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItemB icon={Icons.Dashboard} label="Dashboard"/>
          <NavItemB icon={Icons.Wallet} label="Tesorería" active badge="3"/>
          <NavItemB icon={Icons.Contacts} label="Contactos"/>
          <NavItemB icon={Icons.Folder} label="Proyectos"/>
          <NavItemB icon={Icons.Calendar} label="Agenda"/>
          <NavItemB icon={Icons.Chart} label="Resumen"/>
        </div>

        <div style={{ flex: 1 }}/>

        {/* Mini-stat */}
        <div style={{
          padding: '12px 14px', borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(0,179,126,0.18), rgba(0,179,126,0.06))',
          border: '1px solid rgba(0,179,126,0.25)',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>Disponible</div>
          <div className="display tnum" style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: 'white' }}>$8.412.500</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Banco Provincia · 1234</div>
        </div>

        <NavItemB icon={Icons.Settings} label="Configuración"/>
      </aside>

      {/* Main + AI right panel */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Center */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top bar */}
          <header style={{
            padding: '20px 24px 16px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-3)', fontWeight: 500 }}>
                Gestión <span style={{ color: 'var(--fg-5)' }}>/</span> <span>Tesorería</span>
              </div>
              <h1 className="display" style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em' }}>Movimientos del mes</h1>
            </div>
            <div style={{ position: 'relative', width: 280 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)' }}>
                <Icons.Search size={16}/>
              </span>
              <input placeholder="Buscar…" style={{
                width: '100%', padding: '9px 12px 9px 36px',
                borderRadius: 10, border: '1px solid var(--border-1)',
                background: 'var(--surface)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }}/>
            </div>
            <button style={{
              background: 'transparent', border: '1px solid var(--border-1)',
              borderRadius: 10, padding: '9px 11px', cursor: 'pointer',
              color: 'var(--fg-2)', display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit', fontSize: 13, background: 'var(--surface)',
            }}><Icons.Download size={15}/> Exportar</button>
            <button style={{
              background: 'var(--primary)', color: 'white',
              border: 'none', borderRadius: 10, padding: '10px 14px',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
              boxShadow: '0 1px 0 rgba(0,143,99,0.6), 0 4px 12px rgba(0,179,126,0.25)',
            }}><Icons.Plus size={16}/> Nuevo gasto</button>
          </header>

          {/* KPI strip */}
          <div style={{ padding: '0 24px 16px', display: 'flex', gap: 12 }}>
            <div style={{
              flex: 1, padding: '16px 18px', borderRadius: 14,
              background: 'linear-gradient(135deg, #00B37E 0%, #008F63 100%)',
              color: 'white', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em' }}>Gastado en mayo</div>
              <div className="display tnum" style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>$15.412.500</div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>+17% vs. mes anterior</div>
              <div style={{ position: 'absolute', right: 14, bottom: 14, color: 'rgba(255,255,255,0.85)' }}>
                <MiniBar values={[3,5,4,6,5,7,8,6,9,8,10,9]} color="white"/>
              </div>
            </div>
            <div style={{ flex: 1, padding: '16px 18px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border-1)' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em' }}>Personal</div>
              <div className="display tnum" style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>$13.969k</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 4 }}>90,6% · 3 mov.</div>
            </div>
            <div style={{ flex: 1, padding: '16px 18px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border-1)' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em' }}>Servicios</div>
              <div className="display tnum" style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>$586k</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 4 }}>3,8% · 4 mov.</div>
            </div>
            <div style={{ flex: 1, padding: '16px 18px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border-1)' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em' }}>Insumos</div>
              <div className="display tnum" style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>$184k</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 4 }}>1,2% · 5 mov.</div>
            </div>
          </div>

          {/* Filters (compact, segmented) */}
          <div style={{ padding: '0 24px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              display: 'inline-flex', borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border-1)', padding: 2,
            }}>
              {['Mes','Año','Todos'].map((t, i) => (
                <button key={t} style={{
                  padding: '6px 14px', border: 'none',
                  background: i === 0 ? 'var(--primary)' : 'transparent',
                  color: i === 0 ? 'white' : 'var(--fg-2)',
                  fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                  borderRadius: 8, cursor: 'pointer',
                }}>{t}</button>
              ))}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border-1)',
              fontSize: 12.5, color: 'var(--fg-2)', fontWeight: 500,
            }}>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--fg-3)' }}><Icons.ChevronL size={14}/></button>
              <Icons.Calendar size={14}/>
              <span style={{ color: 'var(--fg-1)', fontWeight: 600 }}>Mayo 2026</span>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--fg-3)' }}><Icons.ChevronR size={14}/></button>
            </div>
            <div style={{ width: 1, height: 22, background: 'var(--border-1)', margin: '0 4px' }}/>
            {[
              { l: 'Tipo', v: 'Todos', active: false },
              { l: 'Contacto', v: 'Todos', active: false },
              { l: 'Forma de pago', v: 'Transferencia', active: true },
              { l: 'Estado', v: 'Todos', active: false },
            ].map(f => (
              <button key={f.l} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 11px', borderRadius: 10,
                background: f.active ? 'var(--primary-soft)' : 'var(--surface)',
                border: `1px solid ${f.active ? 'rgba(0,179,126,0.4)' : 'var(--border-1)'}`,
                color: f.active ? 'var(--primary-dark)' : 'var(--fg-2)',
                fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
              }}>
                <span style={{ color: f.active ? 'var(--primary-dark)' : 'var(--fg-3)' }}>{f.l}:</span>
                <span style={{ fontWeight: 600 }}>{f.v}</span>
                <Icons.ChevronD size={12}/>
              </button>
            ))}
            <div style={{ flex: 1 }}/>
            <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>Ordenar:</div>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '6px 10px', borderRadius: 10,
              background: 'transparent', border: '1px solid var(--border-1)',
              color: 'var(--fg-2)', fontSize: 12.5, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
            }}>Fecha <Icons.ChevronD size={12}/></button>
          </div>

          {/* Grouped list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px' }}>
            <div style={{
              background: 'var(--surface)', borderRadius: 14,
              border: '1px solid var(--border-1)', overflow: 'hidden',
              boxShadow: 'var(--shadow-card)',
            }}>
              {groupList.map((g, gi) => (
                <div key={gi}>
                  <DayHeader
                    label={g.label}
                    sub={g.sub}
                    count={g.items.length}
                    total={g.items.reduce((a, t) => a + t.monto, 0)}
                  />
                  {g.items.map((tx, i) => (
                    <RowB key={tx.id} tx={tx} last={i === g.items.length - 1}/>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Right Panel */}
        <aside style={{
          width: 330, flexShrink: 0,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border-1)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '20px 18px 14px',
            borderBottom: '1px solid var(--border-1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: 'linear-gradient(135deg, #00B37E, #008F63)',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icons.Sparkle size={16}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg-1)' }}>Revisión IA</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>3 gastos esperando aprobación</div>
              </div>
            </div>
            <div style={{
              display: 'flex', gap: 8, marginTop: 12,
              padding: '10px 12px', borderRadius: 10,
              background: 'var(--bg-2)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>Total a revisar</div>
                <div className="display tnum" style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>$326.700</div>
              </div>
              <button style={{
                background: 'var(--fg-1)', color: 'white',
                border: 'none', borderRadius: 9, padding: '0 14px',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              }}>Aprobar todo</button>
            </div>
          </div>

          {/* Cards */}
          <div style={{ flex: 1, overflow: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pendientes.map(tx => <AICard key={tx.id} tx={tx}/>)}
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'var(--bg-2)', border: '1px dashed var(--border-1)',
              textAlign: 'center', fontSize: 12, color: 'var(--fg-3)',
              fontStyle: 'italic',
            }}>
              La IA aprende de tus decisiones · cada confirmación mejora la categorización
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

window.VariantB = VariantB;
window.B_DIMS = { width: B_W, height: B_H };

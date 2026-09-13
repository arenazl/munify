/**
 * NuevaObraWizard — el alta de una obra con el WizardModal del kit, en su variante ANCHA.
 *
 * Cuatro pasos (dueño, 2026-09-13): 1 la obra · 2 las etapas (plantilla por tipo de obra,
 * incidencia y fechas) · 3 QUIÉNES, en baterías guiadas (los actores; hoy contratista,
 * proveedores previstos como nota, inspector) · 4 el vecino. A la derecha, lo que ya se
 * cargó, que se completa paso a paso. Diseño: docs/design-sync/obras/NuevaObra.dc.html.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Building2, Layers, Users, Megaphone } from 'lucide-react';
import { WizardModal, type WizardStep } from '../ui/WizardModal';
import { SelectorAdaptativo } from '../abmv2/SelectorAdaptativo';
import { obrasApi, personasApi } from '../../lib/api';
import { useTheme } from '../../contexts/ThemeContext';

interface Etapa { nombre: string; incidencia_pct: number; fecha_inicio_prevista: string; fecha_fin_prevista: string; monto_previsto: string }
interface PersonaOpt { id: number; nombre_completo: string; roles: { codigo: string }[] }

// Plantillas de etapas por tipo de obra: se ajustan, no se imponen.
const PLANTILLAS: Record<string, string[]> = {
  pavimento: ['Movimiento de suelos', 'Base y cordón cuneta', 'Carpeta asfáltica', 'Señalización'],
  cordon_cuneta: ['Excavación', 'Hormigonado', 'Terminaciones'],
  agua_cloacas: ['Zanjeo', 'Cañería y conexiones', 'Relleno y compactación', 'Pruebas'],
  edificio: ['Suelos y platea', 'Estructura', 'Techado y cerramientos', 'Terminaciones'],
  plaza: ['Preparación del terreno', 'Solados y mobiliario', 'Parquización e iluminación'],
  luminarias: ['Tendido', 'Columnas y luminarias', 'Puesta en marcha'],
  otra: ['Ejecución'],
};
const TIPOS_OBRA = [
  { value: 'pavimento', label: 'Pavimento' }, { value: 'cordon_cuneta', label: 'Cordón cuneta' },
  { value: 'agua_cloacas', label: 'Agua y cloacas' }, { value: 'edificio', label: 'Edificio' },
  { value: 'plaza', label: 'Plaza o espacio público' }, { value: 'luminarias', label: 'Luminarias' }, { value: 'otra', label: 'Otra' },
];
const FUENTES = [
  { value: 'municipal', label: 'Municipal' }, { value: 'provincial', label: 'Provincial' },
  { value: 'nacional', label: 'Nacional' }, { value: 'mixta', label: 'Mixta' },
];

function repartir(nombres: string[], inicio: string, plazoDias: number): Etapa[] {
  const n = nombres.length;
  const base = Math.floor(100 / n);
  const ini = inicio ? new Date(inicio + 'T00:00:00') : null;
  const dur = plazoDias > 0 ? plazoDias / n : 30;
  return nombres.map((nombre, i) => {
    const a = ini ? new Date(ini.getTime() + i * dur * 86400000) : null;
    const b = ini ? new Date(ini.getTime() + (i + 1) * dur * 86400000 - 86400000) : null;
    return {
      nombre, incidencia_pct: i === n - 1 ? 100 - base * (n - 1) : base,
      fecha_inicio_prevista: a ? a.toISOString().slice(0, 10) : '', fecha_fin_prevista: b ? b.toISOString().slice(0, 10) : '', monto_previsto: '',
    };
  });
}

export default function NuevaObraWizard({ open, onClose, onCreada, icono }: { open: boolean; onClose: () => void; onCreada: (id: number) => void; icono?: ReactNode }) {
  const { theme } = useTheme();
  const [paso, setPaso] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [obra, setObra] = useState({
    nombre: '', descripcion: '', tipo_obra: 'pavimento', modalidad: 'contrato', expediente: '', fuente_financiamiento: 'municipal',
    monto_contrato: '', plazo_dias: '', fecha_inicio: '', publico: false, mostrar_monto: false,
  });
  const [etapas, setEtapas] = useState<Etapa[]>(() => repartir(PLANTILLAS.pavimento, '', 0));
  const [plantillaTocada, setPlantillaTocada] = useState(false);
  const [contratista, setContratista] = useState<PersonaOpt | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [candidatos, setCandidatos] = useState<PersonaOpt[]>([]);
  const [proveedoresNota, setProveedoresNota] = useState('');

  useEffect(() => {
    if (!open) { setPaso(0); }
  }, [open]);

  // La plantilla sigue al tipo de obra mientras el usuario no la haya tocado.
  useEffect(() => {
    if (!plantillaTocada) setEtapas(repartir(PLANTILLAS[obra.tipo_obra] ?? PLANTILLAS.otra, obra.fecha_inicio, Number(obra.plazo_dias) || 0));
  }, [obra.tipo_obra, obra.fecha_inicio, obra.plazo_dias, plantillaTocada]);

  useEffect(() => {
    if (busqueda.trim().length < 2) { setCandidatos([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await personasApi.list({ q: busqueda.trim(), page_size: 8 });
        setCandidatos(r.data.items);
      } catch { setCandidatos([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda]);

  const sumaInc = etapas.reduce((a, e) => a + Number(e.incidencia_pct || 0), 0);
  const inputStyle = { backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text };
  const input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
  );
  const campo = (label: string, el: ReactNode, full = false) => (
    <div className={full ? 'av2-field av2-field--full' : 'av2-field'}><label className="av2-field-label">{label}</label>{el}</div>
  );

  const guardar = async () => {
    if (!obra.nombre.trim()) { setPaso(0); return toast.error('La obra necesita un nombre'); }
    setGuardando(true);
    try {
      const r = await obrasApi.create({
        nombre: obra.nombre.trim(), descripcion: [obra.descripcion, proveedoresNota ? `Proveedores previstos: ${proveedoresNota}` : ''].filter(Boolean).join('\n') || null,
        tipo: 'obra', tipo_obra: TIPOS_OBRA.find((t) => t.value === obra.tipo_obra)?.label ?? obra.tipo_obra, modalidad: obra.modalidad,
        expediente: obra.expediente || null, fuente_financiamiento: obra.fuente_financiamiento,
        monto_contrato: obra.monto_contrato ? Number(obra.monto_contrato) : null, presupuesto: obra.monto_contrato ? Number(obra.monto_contrato) : null,
        plazo_dias: obra.plazo_dias ? Number(obra.plazo_dias) : null, fecha_inicio: obra.fecha_inicio || null,
        fecha_fin: obra.fecha_inicio && obra.plazo_dias ? new Date(new Date(obra.fecha_inicio + 'T00:00:00').getTime() + Number(obra.plazo_dias) * 86400000).toISOString().slice(0, 10) : null,
        contratista_persona_id: contratista?.id ?? null, publico: obra.publico, mostrar_monto: obra.mostrar_monto,
        estado_obra: obra.fecha_inicio && obra.fecha_inicio <= new Date().toISOString().slice(0, 10) ? 'en_ejecucion' : 'por_empezar',
        etapas: etapas.filter((e) => e.nombre.trim()).map((e, i) => ({
          orden: i + 1, nombre: e.nombre.trim(), incidencia_pct: Number(e.incidencia_pct || 0),
          fecha_inicio_prevista: e.fecha_inicio_prevista || null, fecha_fin_prevista: e.fecha_fin_prevista || null,
          monto_previsto: e.monto_previsto ? Number(e.monto_previsto) : null,
          estado: i === 0 && obra.fecha_inicio && obra.fecha_inicio <= new Date().toISOString().slice(0, 10) ? 'en_curso' : 'pendiente',
        })),
      });
      onCreada(r.data.id);
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo crear la obra');
    } finally {
      setGuardando(false);
    }
  };

  const resumen = (
    <div style={{ padding: '4px 0 0 20px', borderLeft: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <div className="av2-pagehead-eyebrow">Lo que ya tenemos de esta obra</div>
      <div>
        <div style={{ fontFamily: 'var(--pl-font-display)', fontSize: 18, fontWeight: 700 }}>{obra.nombre || 'Sin nombre todavía'}</div>
        <div style={{ fontSize: 'var(--pl-fs-body-sm)', color: 'var(--pl-text-muted)' }}>
          {[TIPOS_OBRA.find((t) => t.value === obra.tipo_obra)?.label, obra.modalidad === 'contrato' ? 'por contrato' : 'por administración', obra.expediente && `exp. ${obra.expediente}`, obra.monto_contrato && `$${Number(obra.monto_contrato).toLocaleString('es-AR')}`, obra.plazo_dias && `${obra.plazo_dias} días`].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Las etapas</div>
        <div style={{ display: 'flex', gap: 4, height: 40 }}>
          {etapas.filter((e) => e.nombre).map((e, i) => (
            <div key={i} style={{ flex: `0 0 ${Math.max(8, Number(e.incidencia_pct) || 0)}%`, minWidth: 0, borderRadius: 8, padding: '4px 8px', background: 'color-mix(in srgb, var(--pl-green) 18%, var(--pl-surface))', border: '1px solid color-mix(in srgb, var(--pl-green) 45%, transparent)', overflow: 'hidden' }}>
              <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i + 1} · {e.nombre}</div>
              <div style={{ fontSize: 10.5, color: 'var(--pl-text-muted)' }}>{e.incidencia_pct}%</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: sumaInc === 100 ? 'var(--pl-text-muted)' : 'var(--pl-amber-700, var(--pl-amber-strong))', marginTop: 4 }}>las incidencias suman {sumaInc}{sumaInc === 100 ? '' : ' (tienen que sumar 100)'}</div>
      </div>
      <div style={{ paddingTop: 12, borderTop: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Quiénes, hasta ahora</div>
        {[['Contratista', contratista?.nombre_completo ?? (obra.modalidad === 'administracion' ? 'no aplica, es por administración' : 'falta')], ['Proveedores', proveedoresNota || 'falta']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderTop: `1px solid ${theme.border}`, fontSize: 'var(--pl-fs-body-sm)' }}>
            <span style={{ color: 'var(--pl-text-muted)' }}>{k}</span><span style={{ textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const dosColumnas = (izq: ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 24, padding: '8px 4px' }}>
      <div style={{ minWidth: 0 }}>{izq}</div>
      {resumen}
    </div>
  );

  const pasos: WizardStep[] = useMemo(() => [
    {
      id: 'obra', title: 'La obra', description: 'Qué se hace, dónde, con qué plata y en cuánto tiempo', icon: icono ?? <Building2 className="h-5 w-5" />, isValid: !!obra.nombre.trim(),
      content: dosColumnas(
        <div className="av2-form-grid">
          {campo('Nombre', input({ value: obra.nombre, onChange: (e) => setObra({ ...obra, nombre: e.target.value }), placeholder: 'Ej: Pavimentación calle San Martín', autoFocus: true }), true)}
          <div className="av2-field av2-field--full"><SelectorAdaptativo label="Tipo de obra" value={obra.tipo_obra} onChange={(v) => setObra({ ...obra, tipo_obra: v })} options={TIPOS_OBRA} /></div>
          <div className="av2-field av2-field--full"><SelectorAdaptativo label="Modalidad" value={obra.modalidad} onChange={(v) => setObra({ ...obra, modalidad: v })} options={[{ value: 'contrato', label: 'Por contrato (un contratista presenta certificados)' }, { value: 'administracion', label: 'Por administración (cuadrilla propia)' }]} /></div>
          {campo('Expediente', input({ value: obra.expediente, onChange: (e) => setObra({ ...obra, expediente: e.target.value }), placeholder: '0455/26' }))}
          <div className="av2-field"><SelectorAdaptativo label="Financiamiento" value={obra.fuente_financiamiento} onChange={(v) => setObra({ ...obra, fuente_financiamiento: v })} options={FUENTES} /></div>
          {campo('Presupuesto (contrato)', input({ type: 'number', min: 0, value: obra.monto_contrato, onChange: (e) => setObra({ ...obra, monto_contrato: e.target.value }), placeholder: '86000000' }))}
          {campo('Plazo en días', input({ type: 'number', min: 0, value: obra.plazo_dias, onChange: (e) => setObra({ ...obra, plazo_dias: e.target.value }), placeholder: '180' }))}
          {campo('Inicio previsto', input({ type: 'date', value: obra.fecha_inicio, onChange: (e) => setObra({ ...obra, fecha_inicio: e.target.value }) }))}
          {campo('Descripción', <textarea className="av2-sheet-nota" rows={2} value={obra.descripcion} onChange={(e) => setObra({ ...obra, descripcion: e.target.value })} />, true)}
        </div>,
      ),
    },
    {
      id: 'etapas', title: 'Las etapas', description: 'Cómo se segmenta la obra: cada etapa con su peso y sus fechas', icon: <Layers className="h-5 w-5" />, isValid: etapas.some((e) => e.nombre.trim()),
      content: dosColumnas(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="av2-campo-nota">Arrancamos con la plantilla de <b>{TIPOS_OBRA.find((t) => t.value === obra.tipo_obra)?.label}</b>. Cambiá nombres, pesos y fechas; agregá o sacá etapas. Los gastos se van a proponer solos según estas fechas.</p>
          {etapas.map((e, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1.6fr 70px 1fr 1fr 32px', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--pl-text-muted)', fontWeight: 700 }}>{i + 1}</span>
              {input({ value: e.nombre, placeholder: 'Nombre de la etapa', onChange: (ev) => { setPlantillaTocada(true); setEtapas(etapas.map((x, k) => k === i ? { ...x, nombre: ev.target.value } : x)); } })}
              {input({ type: 'number', min: 0, max: 100, value: e.incidencia_pct, title: 'incidencia %', onChange: (ev) => { setPlantillaTocada(true); setEtapas(etapas.map((x, k) => k === i ? { ...x, incidencia_pct: Number(ev.target.value) } : x)); } })}
              {input({ type: 'date', value: e.fecha_inicio_prevista, onChange: (ev) => { setPlantillaTocada(true); setEtapas(etapas.map((x, k) => k === i ? { ...x, fecha_inicio_prevista: ev.target.value } : x)); } })}
              {input({ type: 'date', value: e.fecha_fin_prevista, onChange: (ev) => { setPlantillaTocada(true); setEtapas(etapas.map((x, k) => k === i ? { ...x, fecha_fin_prevista: ev.target.value } : x)); } })}
              <button type="button" className="av2-btn-secundario av2-btn-icono" title="Sacar" onClick={() => { setPlantillaTocada(true); setEtapas(etapas.filter((_, k) => k !== i)); }}>×</button>
            </div>
          ))}
          <div><button type="button" className="av2-btn-secundario" onClick={() => { setPlantillaTocada(true); setEtapas([...etapas, { nombre: '', incidencia_pct: 0, fecha_inicio_prevista: '', fecha_fin_prevista: '', monto_previsto: '' }]); }}>+ Agregar etapa</button></div>
        </div>,
      ),
    },
    {
      id: 'quienes', title: 'Quiénes', description: 'Te voy preguntando de a uno: quién la hace, a quién le compramos', icon: <Users className="h-5 w-5" />, isValid: true,
      content: dosColumnas(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontFamily: 'var(--pl-font-display)', fontSize: 17, fontWeight: 600, lineHeight: 1.35 }}>Ya tenemos la obra y sus {etapas.filter((e) => e.nombre).length} etapas. Ahora, <span style={{ color: 'var(--pl-green)' }}>quiénes la hacen</span>.</div>
          <p className="av2-campo-nota">Los actores los define el municipio en Configuración › Obras › Actores. Cada uno se puede saltear y completar después desde la ficha.</p>
          <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>1 · Quién hace la obra</div>
            {obra.modalidad === 'administracion' ? (
              <p className="av2-campo-nota">Es por administración: la hace la cuadrilla propia. No hay contratista.</p>
            ) : (
              <>
                <p className="av2-campo-nota">Es por contrato, así que hay un contratista. Es una Persona de la libreta: buscala por nombre.</p>
                {contratista ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="av2-tarj-pill" style={{ ['--pill' as string]: 'var(--pl-green)' }}>{contratista.nombre_completo}</span>
                    <button type="button" className="av2-btn-secundario" onClick={() => setContratista(null)}>Cambiar</button>
                  </div>
                ) : (
                  <>
                    {input({ value: busqueda, onChange: (e) => setBusqueda(e.target.value), placeholder: 'Buscar una persona o empresa…' })}
                    {candidatos.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {candidatos.map((c) => (
                          <button key={c.id} type="button" className="av2-btn-secundario" style={{ justifyContent: 'space-between' }} onClick={() => { setContratista(c); setBusqueda(''); setCandidatos([]); }}>
                            <span>{c.nombre_completo}</span><span style={{ color: 'var(--pl-text-muted)', fontSize: 11.5 }}>{c.roles.map((r) => r.codigo).join(', ') || 'sin tipo'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>2 · A quién le vamos a comprar</div>
            <p className="av2-campo-nota">Los proveedores previstos, para que la asignación automática reconozca sus gastos. Podés dejarlo vacío: se van sumando solos.</p>
            {input({ value: proveedoresNota, onChange: (e) => setProveedoresNota(e.target.value), placeholder: 'Ej: Corralón Norte, Rubbertone' })}
          </div>
          <div style={{ border: `1px dashed ${theme.border}`, borderRadius: 12, padding: '12px 14px', opacity: 0.7 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>3 · Quién va a trabajar · 4 · Quién la inspecciona</div>
            <p className="av2-campo-nota">Cuadrillas, gente contratada e inspector se cargan desde la ficha de la obra.</p>
          </div>
        </div>,
      ),
    },
    {
      id: 'vecino', title: 'El vecino', description: 'Si se publica en Obras en tu ciudad, y si se muestra el monto', icon: <Megaphone className="h-5 w-5" />, isValid: true,
      content: dosColumnas(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 'var(--pl-fs-body)' }}>
            <input type="checkbox" checked={obra.publico} onChange={(e) => setObra({ ...obra, publico: e.target.checked })} /> Publicar en "Obras en tu ciudad"
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 'var(--pl-fs-body)', opacity: obra.publico ? 1 : 0.5 }}>
            <input type="checkbox" disabled={!obra.publico} checked={obra.mostrar_monto} onChange={(e) => setObra({ ...obra, mostrar_monto: e.target.checked })} /> Mostrar el monto al vecino
          </label>
          <p className="av2-campo-nota">Publicar es un acto deliberado. El avance que ve el vecino se decide en Comunicación y no tiene por qué coincidir con el real.</p>
        </div>,
      ),
    },
  ], [obra, etapas, contratista, busqueda, candidatos, proveedoresNota, sumaInc, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title="Nueva obra"
      steps={pasos}
      currentStep={paso}
      onStepChange={setPaso}
      onComplete={() => { void guardar(); }}
      loading={guardando}
      completeLabel="Crear la obra"
      ancho
    />
  );
}

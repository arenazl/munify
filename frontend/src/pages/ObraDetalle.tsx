/**
 * ObraDetalle — la SEGUNDA PANTALLA completa de una obra (nunca un modal).
 *
 * Orden (dueño, 2026-09-13): hero semántico (la frase la genera el backend) con los
 * cinco números → la línea de tiempo en dos niveles (la obra entera, y la etapa tocada
 * explotada) → la explosión con los gráficos de la galería → los gastos con enlace a
 * Tesorería, quién estuvo, y la bandeja de gastos sin etapa para confirmar.
 * Diseño: docs/design-sync/obras/Detalle.dc.html.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronLeft, ExternalLink, Layers, Pencil, Plus } from 'lucide-react';
import { PageHeader } from '../components/abmv2/PageHeader';
import { SemanticHero } from '../components/ui/SemanticHero';
import { SideModal, SideModalField } from '../components/abmv2/SideModal';
import { SelectorAdaptativo } from '../components/abmv2/SelectorAdaptativo';
import LineaDeTiempoObra, { type LtEtapa, type LtGasto, type LtHito } from '../components/abmv2/LineaDeTiempoObra';
import { ApiladaPorEtapa, AreaAcumulado, DumbbellPrevistoReal, type EtapaGrafico } from '../components/abmv2/GraficosObra';
import { seg, type Veredicto } from '../lib/semanticHero';
import { obrasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { fmtMoney } from '../lib/obras-helpers';
import { CrearGastoWizard } from '../components/tesoreria/CrearGastoWizard';

interface Etapa {
  id: number; orden: number; nombre: string; descripcion?: string | null; incidencia_pct: string; avance_pct: number; estado: string;
  fecha_inicio_prevista?: string | null; fecha_fin_prevista?: string | null; fecha_inicio_real?: string | null; fecha_fin_real?: string | null;
  monto_previsto?: string | null; ejecutado: string; n_gastos: number; contratista: string; materiales: string; mano_de_obra: string; otros: string;
}
interface GastoObra {
  imputacion_id: number; gasto_id: number; fecha: string; monto: string; monto_gasto: string; concepto: string; descripcion?: string | null;
  destino?: { id: number; nombre: string; tipo?: string | null } | null; rubro: string; estado_pago?: string | null;
  etapa_id?: number | null; origen: string; etapa_propuesta_id?: number | null;
}
interface Detalle {
  id: number;
  obra: { nombre: string; descripcion?: string | null; tipo: string; tipo_obra?: string | null; modalidad?: string | null; expediente?: string | null; fuente_financiamiento?: string | null; monto_contrato?: string | null; presupuesto?: string | null; plazo_dias?: number | null; fecha_inicio?: string | null; fecha_fin?: string | null; fecha_inicio_real?: string | null; fecha_fin_real?: string | null; estado: string; estado_obra?: string | null; avance?: number | null; publico: boolean; mostrar_monto: boolean };
  contratista?: { id: number; nombre: string } | null; inspector?: { id: number; nombre: string } | null; barrio?: string | null;
  kpis: { presupuesto_vigente?: string | null; ejecutado: string; comprometido: string; programado: string; avance?: number | null; pct_plata?: number | null; atraso_dias: number; sin_etapa: number; veredicto: Veredicto };
  frase: string; etapas: Etapa[]; gastos: GastoObra[];
  proveedores: { persona: { id: number; nombre: string; tipo?: string | null }; n_gastos: number; total: string }[];
  mes_a_mes: { mes: string; monto: string; acumulado: string; programado: boolean }[];
  gente: { ordenes_trabajo: number; horas: number; cuadrillas: string[]; personas_ot: string[]; sueldos_personas: number; sueldos_total: string };
  linea_desde?: string | null; linea_hasta?: string | null;
}

const RUBRO_LABEL: Record<string, string> = { contratista: 'contratista', materiales: 'materiales', mano_de_obra: 'mano de obra', otros: 'otros' };
const ESTADOS_ETAPA = [{ value: 'pendiente', label: 'Por empezar' }, { value: 'en_curso', label: 'En curso' }, { value: 'terminada', label: 'Terminada' }, { value: 'parada', label: 'Parada' }];
const fechaAR = (iso?: string | null) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—';

export default function ObraDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [d, setD] = useState<Detalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [etapaActiva, setEtapaActiva] = useState<number | null>(null);
  const [editEtapas, setEditEtapas] = useState<Etapa[] | null>(null);
  const [editObra, setEditObra] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [cargarGasto, setCargarGasto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await obrasApi.get(Number(id));
      setD(r.data);
    } catch {
      toast.error('No se pudo cargar la obra');
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { void cargar(); }, [cargar]);

  // Al abrir, la etapa en curso queda explotada: es lo que el intendente quiere ver.
  useEffect(() => {
    if (d && etapaActiva === null) {
      const enCurso = d.etapas.find((e) => e.estado === 'en_curso');
      if (enCurso) setEtapaActiva(enCurso.id);
    }
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  const hoy = new Date().toISOString().slice(0, 10);
  const ltEtapas: LtEtapa[] = useMemo(() => (d?.etapas ?? []).map((e) => ({
    id: e.id, orden: e.orden, nombre: e.nombre, estado: e.estado, avance_pct: e.avance_pct, ejecutado: Number(e.ejecutado),
    monto_previsto: e.monto_previsto ? Number(e.monto_previsto) : null,
    fecha_inicio_prevista: e.fecha_inicio_prevista, fecha_fin_prevista: e.fecha_fin_prevista, fecha_inicio_real: e.fecha_inicio_real, fecha_fin_real: e.fecha_fin_real,
  })), [d]);
  const ltGastos: LtGasto[] = useMemo(() => (d?.gastos ?? []).map((g) => ({
    id: g.imputacion_id, fecha: g.fecha, monto: Number(g.monto), etiqueta: `${g.destino?.nombre ?? 'sin destino'} · ${g.concepto}`,
    rubro: g.rubro, programado: g.fecha > hoy, etapa_id: g.etapa_id, sin_etapa: g.etapa_id == null && (d?.etapas.length ?? 0) > 0,
  })), [d, hoy]);
  const hitos: LtHito[] = useMemo(() => {
    if (!d) return [];
    const h: LtHito[] = [];
    if (d.obra.fecha_inicio_real || d.obra.fecha_inicio) h.push({ fecha: (d.obra.fecha_inicio_real || d.obra.fecha_inicio)!, label: `Inicio · ${fechaAR(d.obra.fecha_inicio_real || d.obra.fecha_inicio)}`, tono: 'primario' });
    if (d.obra.fecha_fin) h.push({ fecha: d.obra.fecha_fin, label: `Fin previsto · ${fechaAR(d.obra.fecha_fin)}`, tono: d.obra.fecha_fin_real ? 'bueno' : 'previsto' });
    return h;
  }, [d]);

  const etapasGrafico: EtapaGrafico[] = useMemo(() => (d?.etapas ?? []).map((e) => ({
    id: e.id, orden: e.orden, nombre: e.nombre, contratista: Number(e.contratista), materiales: Number(e.materiales), mano_de_obra: Number(e.mano_de_obra), otros: Number(e.otros),
    ejecutado: Number(e.ejecutado), previsto: e.monto_previsto ? Number(e.monto_previsto) : null, activa: etapaActiva ? e.id === etapaActiva : undefined,
  })), [d, etapaActiva]);
  const meses = useMemo(() => (d?.mes_a_mes ?? []).map((m) => ({ mes: m.mes, acumulado: Number(m.acumulado), programado: m.programado })), [d]);

  const activa = d?.etapas.find((e) => e.id === etapaActiva) ?? null;
  const gastosVisibles = useMemo(() => {
    if (!d) return [];
    if (!activa) return d.gastos;
    const ini = activa.fecha_inicio_real || activa.fecha_inicio_prevista || '';
    const fin = activa.fecha_fin_real || activa.fecha_fin_prevista || '9999';
    return d.gastos.filter((g) => g.etapa_id === activa.id || (g.etapa_id == null && g.fecha >= ini && g.fecha <= fin));
  }, [d, activa]);
  const sinEtapa = useMemo(() => (d?.gastos ?? []).filter((g) => g.etapa_id == null && g.etapa_propuesta_id != null), [d]);

  const confirmar = async (ids: number[], etapaId?: number) => {
    if (!d) return;
    try {
      const r = await obrasApi.confirmar(d.id, ids, etapaId);
      setD(r.data);
      toast.success(ids.length === 1 ? 'Gasto imputado a su etapa' : `${ids.length} gastos imputados`);
    } catch {
      toast.error('No se pudo confirmar');
    }
  };

  const guardarEtapas = async () => {
    if (!d || !editEtapas) return;
    setGuardando(true);
    try {
      const r = await obrasApi.etapas(d.id, editEtapas.filter((e) => e.nombre.trim()).map((e, i) => ({
        id: e.id > 0 ? e.id : undefined, orden: i + 1, nombre: e.nombre.trim(), descripcion: e.descripcion ?? null,
        incidencia_pct: Number(e.incidencia_pct || 0), avance_pct: Number(e.avance_pct || 0), estado: e.estado,
        fecha_inicio_prevista: e.fecha_inicio_prevista || null, fecha_fin_prevista: e.fecha_fin_prevista || null,
        fecha_inicio_real: e.fecha_inicio_real || null, fecha_fin_real: e.fecha_fin_real || null,
        monto_previsto: e.monto_previsto ? Number(e.monto_previsto) : null,
      })));
      setD(r.data);
      setEditEtapas(null);
      toast.success('Etapas guardadas');
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudieron guardar las etapas');
    } finally {
      setGuardando(false);
    }
  };

  const abrirEditObra = () => {
    if (!d) return;
    setForm({
      nombre: d.obra.nombre, tipo_obra: d.obra.tipo_obra ?? '', modalidad: d.obra.modalidad ?? 'contrato', expediente: d.obra.expediente ?? '',
      fuente_financiamiento: d.obra.fuente_financiamiento ?? '', monto_contrato: d.obra.monto_contrato ?? '', plazo_dias: d.obra.plazo_dias != null ? String(d.obra.plazo_dias) : '',
      fecha_inicio: d.obra.fecha_inicio ?? '', fecha_fin: d.obra.fecha_fin ?? '', fecha_inicio_real: d.obra.fecha_inicio_real ?? '', fecha_fin_real: d.obra.fecha_fin_real ?? '',
      tipo: d.obra.tipo, avance: d.obra.avance != null ? String(d.obra.avance) : '', descripcion: d.obra.descripcion ?? '',
    });
    setEditObra(true);
  };
  const guardarObra = async () => {
    if (!d) return;
    setGuardando(true);
    try {
      const r = await obrasApi.update(d.id, {
        nombre: form.nombre, tipo: form.tipo, tipo_obra: form.tipo_obra || null, modalidad: form.modalidad || null, expediente: form.expediente || null,
        fuente_financiamiento: form.fuente_financiamiento || null, monto_contrato: form.monto_contrato ? Number(form.monto_contrato) : null,
        plazo_dias: form.plazo_dias ? Number(form.plazo_dias) : null, fecha_inicio: form.fecha_inicio || null, fecha_fin: form.fecha_fin || null,
        fecha_inicio_real: form.fecha_inicio_real || null, fecha_fin_real: form.fecha_fin_real || null,
        avance: form.avance !== '' ? Number(form.avance) : null, descripcion: form.descripcion || null,
      });
      setD(r.data);
      setEditObra(false);
      toast.success('Obra guardada');
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const inputStyle = { backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text };
  const inp = (key: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input {...props} value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
  );

  if (loading && !d) return <div className="av2-page"><PageHeader eyebrow="Obras" title="Cargando…" /></div>;
  if (!d) return <div className="av2-page"><PageHeader eyebrow="Obras" title="Obra no encontrada" /></div>;

  const k = d.kpis;
  const kpis = [
    { etiqueta: 'Presupuesto vigente', valor: k.presupuesto_vigente ? fmtMoney(k.presupuesto_vigente) : '—', sub: k.presupuesto_vigente ? (d.obra.monto_contrato ? 'contrato' : 'presupuesto') : 'sin cargar' },
    { etiqueta: 'Ejecutado', valor: fmtMoney(k.ejecutado), sub: k.pct_plata != null ? `el ${k.pct_plata}% de la plata` : `${d.gastos.length} gastos`, veredicto: k.veredicto === 'malo' ? ('malo' as const) : undefined },
    { etiqueta: 'Programado', valor: fmtMoney(k.programado), sub: Number(k.programado) > 0 ? 'todavía sin pagar' : 'nada pendiente' },
    { etiqueta: 'Avance real', valor: k.avance != null ? `${k.avance}%` : '—', sub: d.etapas.length ? `${d.etapas.filter((e) => e.estado === 'terminada').length} de ${d.etapas.length} etapas` : 'sin etapas', veredicto: k.atraso_dias > 0 ? ('advertencia' as const) : undefined },
    { etiqueta: k.atraso_dias > 0 ? 'Atraso' : 'Gastos sin etapa', valor: k.atraso_dias > 0 ? `${k.atraso_dias} d` : String(k.sin_etapa), sub: k.atraso_dias > 0 ? 'pasada del plazo' : (k.sin_etapa ? 'confirmar la propuesta' : 'nada pendiente'), veredicto: k.atraso_dias > 0 || k.sin_etapa > 0 ? ('advertencia' as const) : ('bueno' as const) },
  ];
  const subtitulo = [d.obra.tipo_obra, d.obra.modalidad === 'contrato' ? 'por contrato' : d.obra.modalidad === 'administracion' ? 'por administración' : null, d.contratista?.nombre, d.obra.expediente && `exp. ${d.obra.expediente}`, d.obra.fuente_financiamiento && `financiamiento ${d.obra.fuente_financiamiento}`, d.barrio].filter(Boolean).join(' · ');

  const fila = (k1: React.ReactNode, v: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '1px solid var(--pl-border)', fontSize: 'var(--pl-fs-body-sm)' }}>
      <span>{k1}</span><span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{v}</span>
    </div>
  );

  return (
    <div className="av2-page" data-module="obras">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Link to="/gestion/obras" className="av2-pagehead-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}><ChevronLeft size={12} /> Obras</Link>
          <PageHeader title={d.obra.nombre} description={subtitulo || undefined} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 20 }}>
          <button type="button" className="av2-btn-secundario" onClick={() => setCargarGasto(true)}><Plus size={14} /> Cargar gasto</button>
          <button type="button" className="av2-btn-secundario" onClick={() => setEditEtapas(d.etapas.map((e) => ({ ...e })))}><Layers size={14} /> Etapas</button>
          <button type="button" className="av2-btn-secundario" onClick={abrirEditObra}><Pencil size={14} /> Editar</button>
        </div>
      </div>

      <div className="av2-hero-wrap">
        <SemanticHero etiqueta={`OBRA · ${(d.obra.estado_obra ?? d.obra.estado).replace('_', ' ').toUpperCase()}`} frases={[{ segmentos: [seg(d.frase, k.veredicto)] }]} kpis={kpis} className="av2-hero" sinAutoRotacion />
      </div>

      <section className="av2-controles" style={{ marginTop: 18 }}>
        <div className="gr-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Línea de tiempo</h3>
            <span style={{ fontSize: 'var(--pl-fs-caption)', color: 'var(--pl-text-muted)' }}>Toda la obra, siempre entera. Tocá una etapa y se explota abajo. La línea ámbar es hoy.</span>
          </div>
          <LineaDeTiempoObra
            desde={d.linea_desde ?? hoy}
            hasta={d.linea_hasta ?? hoy}
            etapas={ltEtapas}
            gastos={ltGastos}
            hitos={hitos}
            hoy={hoy}
            etapaActivaId={etapaActiva}
            onEtapa={setEtapaActiva}
            fmtMoney={(n) => fmtMoney(n)}
          />
        </div>
      </section>

      {sinEtapa.length > 0 && (
        <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'color-mix(in srgb, var(--pl-amber-strong) 10%, var(--pl-surface))', border: '1px solid color-mix(in srgb, var(--pl-amber-strong) 35%, transparent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 'var(--pl-fs-body-sm)' }}>
          <span><strong>{sinEtapa.length} gasto{sinEtapa.length === 1 ? '' : 's'} sin etapa</strong> · el sistema propone la etapa en curso a la fecha de cada uno; vos confirmás.</span>
          <button type="button" className="av2-btn-primario" onClick={() => { void confirmar(sinEtapa.map((g) => g.imputacion_id)); }}>Confirmar {sinEtapa.length === 1 ? 'la propuesta' : `las ${sinEtapa.length}`}</button>
        </div>
      )}

      {d.etapas.length > 0 && (
        <div className="gr-grid" style={{ marginTop: 16 }}>
          <ApiladaPorEtapa etapas={etapasGrafico} fmtMoney={(n) => fmtMoney(n)} />
          <DumbbellPrevistoReal etapas={etapasGrafico} />
          <AreaAcumulado meses={meses} presupuesto={k.presupuesto_vigente ? Number(k.presupuesto_vigente) : null} fmtMoney={(n) => fmtMoney(n)} />
        </div>
      )}
      {d.etapas.length === 0 && meses.length > 0 && (
        <div className="gr-grid" style={{ marginTop: 16 }}>
          <AreaAcumulado meses={meses} presupuesto={k.presupuesto_vigente ? Number(k.presupuesto_vigente) : null} fmtMoney={(n) => fmtMoney(n)} />
          <article className="gr-card">
            <h3>Sin etapas todavía</h3>
            <p className="gr-q">Con etapas cargadas, esta obra tiene avance derivado, desvío de plata y la explosión por etapa. <b>Cargalas con el botón Etapas</b>: nombre, peso y fechas de cada una.</p>
            <button type="button" className="av2-btn-primario" style={{ alignSelf: 'flex-start' }} onClick={() => setEditEtapas([{ id: 0, orden: 1, nombre: 'Ejecución', incidencia_pct: '100', avance_pct: d.obra.avance ?? 0, estado: 'en_curso', fecha_inicio_prevista: d.obra.fecha_inicio ?? null, fecha_fin_prevista: d.obra.fecha_fin ?? null, ejecutado: '0', n_gastos: 0, contratista: '0', materiales: '0', mano_de_obra: '0', otros: '0' }])}><Layers size={14} /> Cargar las etapas</button>
          </article>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 16, marginTop: 16 }}>
        <article className="gr-card">
          <h3>{activa ? `Los gastos de la etapa ${activa.orden}` : 'Los gastos de la obra'}</h3>
          <p className="gr-q">{gastosVisibles.length} gasto{gastosVisibles.length === 1 ? '' : 's'}. <b>Cada uno abre en Tesorería</b>, con su factura y su caja.</p>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {gastosVisibles.map((g) => (
              <div key={g.imputacion_id} style={{ display: 'grid', gridTemplateColumns: '56px 1.4fr 1.1fr 96px 22px', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--pl-border)', fontSize: 'var(--pl-fs-body-sm)', opacity: g.fecha > hoy ? 0.6 : 1 }}>
                <span style={{ color: 'var(--pl-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fechaAR(g.fecha)}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.destino?.nombre ?? <em style={{ color: 'var(--pl-text-muted)' }}>sin destino</em>}</span>
                <span style={{ color: g.etapa_id == null && d.etapas.length ? 'var(--pl-amber-700, var(--pl-amber-strong))' : 'var(--pl-text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.concepto} · {RUBRO_LABEL[g.rubro]}{g.etapa_id == null && d.etapas.length ? ' · sin etapa' : ''}{g.fecha > hoy ? ' · programado' : ''}
                </span>
                <span style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(g.monto)}</span>
                <button type="button" title="Abrir en Tesorería" onClick={() => navigate(`/gestion/tesoreria?gasto=${g.gasto_id}`)} style={{ background: 'none', border: 0, color: 'var(--pl-green)', cursor: 'pointer', padding: 0 }}><ExternalLink size={15} /></button>
              </div>
            ))}
            {gastosVisibles.length === 0 && <p className="av2-campo-nota">Todavía no hay gastos imputados acá.</p>}
          </div>
        </article>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <article className="gr-card">
            <h3>A quién se le pagó</h3>
            <p className="gr-q">{d.proveedores.length} persona{d.proveedores.length === 1 ? '' : 's'} o empresa{d.proveedores.length === 1 ? '' : 's'} cobraron por esta obra.</p>
            {d.proveedores.slice(0, 6).map((p) => fila(<>{p.persona.nombre} <span style={{ color: 'var(--pl-text-muted)' }}>· {p.persona.tipo} · {p.n_gastos}</span></>, fmtMoney(p.total)))}
          </article>
          <article className="gr-card">
            <h3>Quién estuvo</h3>
            <p className="gr-q">Órdenes de trabajo de la obra y sueldos imputados. <b>Requiere Persona</b> para que sean las mismas personas.</p>
            {fila('Órdenes de trabajo', `${d.gente.ordenes_trabajo} · ${d.gente.horas} h`)}
            {d.gente.cuadrillas.length > 0 && fila('Cuadrillas', d.gente.cuadrillas.join(', '))}
            {d.gente.personas_ot.length > 0 && fila('Personas en OT', d.gente.personas_ot.join(', '))}
            {fila('Sueldos imputados', d.gente.sueldos_personas ? `${d.gente.sueldos_personas} personas · ${fmtMoney(d.gente.sueldos_total)}` : 'ninguno')}
          </article>
        </div>
      </div>

      {editEtapas && (
        <SideModal
          mode="edit"
          width={560}
          open
          onClose={() => setEditEtapas(null)}
          header={{ title: 'Las etapas de la obra', metaTop: 'Nombre, peso en el total, fechas previstas y reales, avance', metaBottom: `Las incidencias suman ${editEtapas.reduce((a, e) => a + Number(e.incidencia_pct || 0), 0)} (tienen que sumar 100)` }}
          sections={[{ id: 'etapas', label: 'Etapas', content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {editEtapas.map((e, i) => (
                <div key={i} style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 32px', gap: 8, alignItems: 'center' }}>
                    <input value={e.nombre} placeholder={`Etapa ${i + 1}`} onChange={(ev) => setEditEtapas(editEtapas.map((x, k) => k === i ? { ...x, nombre: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
                    <input type="number" min={0} max={100} title="incidencia %" value={e.incidencia_pct} onChange={(ev) => setEditEtapas(editEtapas.map((x, k) => k === i ? { ...x, incidencia_pct: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
                    <button type="button" className="av2-btn-secundario av2-btn-icono" title="Sacar" onClick={() => setEditEtapas(editEtapas.filter((_, k) => k !== i))}>×</button>
                  </div>
                  <div className="av2-form-grid">
                    <SideModalField label="Estado"><SelectorAdaptativo label="" value={e.estado} onChange={(v) => setEditEtapas(editEtapas.map((x, k) => k === i ? { ...x, estado: v } : x))} options={ESTADOS_ETAPA} /></SideModalField>
                    <SideModalField label="Avance %"><input type="number" min={0} max={100} value={e.avance_pct} onChange={(ev) => setEditEtapas(editEtapas.map((x, k) => k === i ? { ...x, avance_pct: Number(ev.target.value) } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} /></SideModalField>
                    <SideModalField label="Inicio previsto"><input type="date" value={e.fecha_inicio_prevista ?? ''} onChange={(ev) => setEditEtapas(editEtapas.map((x, k) => k === i ? { ...x, fecha_inicio_prevista: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} /></SideModalField>
                    <SideModalField label="Fin previsto"><input type="date" value={e.fecha_fin_prevista ?? ''} onChange={(ev) => setEditEtapas(editEtapas.map((x, k) => k === i ? { ...x, fecha_fin_prevista: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} /></SideModalField>
                    <SideModalField label="Inicio real"><input type="date" value={e.fecha_inicio_real ?? ''} onChange={(ev) => setEditEtapas(editEtapas.map((x, k) => k === i ? { ...x, fecha_inicio_real: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} /></SideModalField>
                    <SideModalField label="Fin real"><input type="date" value={e.fecha_fin_real ?? ''} onChange={(ev) => setEditEtapas(editEtapas.map((x, k) => k === i ? { ...x, fecha_fin_real: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} /></SideModalField>
                    <SideModalField label="Previsto ($)" full><input type="number" min={0} value={e.monto_previsto ?? ''} onChange={(ev) => setEditEtapas(editEtapas.map((x, k) => k === i ? { ...x, monto_previsto: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} /></SideModalField>
                  </div>
                </div>
              ))}
              <button type="button" className="av2-btn-secundario" style={{ alignSelf: 'flex-start' }} onClick={() => setEditEtapas([...editEtapas, { id: -Date.now(), orden: editEtapas.length + 1, nombre: '', incidencia_pct: '0', avance_pct: 0, estado: 'pendiente', ejecutado: '0', n_gastos: 0, contratista: '0', materiales: '0', mano_de_obra: '0', otros: '0' }])}><Plus size={14} /> Agregar etapa</button>
            </div>
          ) }]}
          footer={{ primary: { label: guardando ? 'Guardando…' : 'Guardar etapas', onClick: () => { void guardarEtapas(); }, disabled: guardando }, secondary: [{ label: 'Cancelar', onClick: () => setEditEtapas(null) }] }}
        />
      )}

      {editObra && (
        <SideModal
          mode="edit"
          width={520}
          open
          onClose={() => setEditObra(false)}
          header={{ title: `Editar · ${d.obra.nombre}`, metaTop: 'Datos de la obra' }}
          sections={[{ id: 'datos', label: 'La obra', content: (
            <div className="av2-form-grid">
              <SideModalField label="Nombre" full>{inp('nombre')}</SideModalField>
              <SideModalField label="Tipo" full><SelectorAdaptativo label="" value={form.tipo} onChange={(v) => setForm({ ...form, tipo: v })} options={[{ value: 'obra', label: 'Obra (con etapas)' }, { value: 'programa', label: 'Programa (centro de costo)' }]} /></SideModalField>
              <SideModalField label="Tipo de obra">{inp('tipo_obra', { placeholder: 'Pavimento, plaza, edificio…' })}</SideModalField>
              <SideModalField label="Modalidad"><SelectorAdaptativo label="" value={form.modalidad} onChange={(v) => setForm({ ...form, modalidad: v })} options={[{ value: 'contrato', label: 'Por contrato' }, { value: 'administracion', label: 'Por administración' }]} /></SideModalField>
              <SideModalField label="Expediente">{inp('expediente')}</SideModalField>
              <SideModalField label="Financiamiento">{inp('fuente_financiamiento', { placeholder: 'municipal, provincial…' })}</SideModalField>
              <SideModalField label="Presupuesto vigente ($)">{inp('monto_contrato', { type: 'number', min: 0 })}</SideModalField>
              <SideModalField label="Plazo (días)">{inp('plazo_dias', { type: 'number', min: 0 })}</SideModalField>
              <SideModalField label="Inicio previsto">{inp('fecha_inicio', { type: 'date' })}</SideModalField>
              <SideModalField label="Fin previsto">{inp('fecha_fin', { type: 'date' })}</SideModalField>
              <SideModalField label="Inicio real">{inp('fecha_inicio_real', { type: 'date' })}</SideModalField>
              <SideModalField label="Fin real">{inp('fecha_fin_real', { type: 'date' })}</SideModalField>
              <SideModalField label="Avance manual %" help="Sólo cuenta si la obra no tiene etapas.">{inp('avance', { type: 'number', min: 0, max: 100 })}</SideModalField>
              <SideModalField label="Descripción" full><textarea className="av2-sheet-nota" rows={2} value={form.descripcion ?? ''} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></SideModalField>
            </div>
          ) }]}
          footer={{ primary: { label: guardando ? 'Guardando…' : 'Guardar', onClick: () => { void guardarObra(); }, disabled: guardando }, secondary: [{ label: 'Cancelar', onClick: () => setEditObra(false) }] }}
        />
      )}

      {/* El asistente de gastos de Tesorería, tal cual. La imputación fija a esta obra
          (paso 5 salteado) es la entrega O3 del plan; hoy se imputa en el paso 5. */}
      <CrearGastoWizard open={cargarGasto} onClose={() => setCargarGasto(false)} onSuccess={() => { setCargarGasto(false); void cargar(); }} />
    </div>
  );
}

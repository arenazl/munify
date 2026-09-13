/**
 * ObraDetalle — la SEGUNDA PANTALLA completa de una obra (nunca un modal).
 *
 * Repensada el 2026-09-13 desde el negocio: una obra son tres relojes que tienen que
 * caminar juntos (tiempo, hecho, plata), y lo que el intendente quiere saber es el
 * futuro (cuándo termina de verdad, cuánto cuesta de verdad) y qué la frena.
 *
 * Orden de lectura:
 *   1. El veredicto: la frase del backend y cinco números (hecho, tiempo, plata, termina, va a costar).
 *   2. Lo que hay que resolver, con su botón: gastos sin etapa, vencidos sin pagar, etapas vencidas o paradas.
 *   3. La línea de tiempo: el mapa del calendario, un solo nivel, tocar una etapa abre su ficha.
 *   4. Los tres relojes de la obra y la curva S (previsto, pagado, hecho, y a dónde va si sigue así).
 *   5. Etapa por etapa: la ficha (diagnóstico, relojes, rubros, gente, libro de gastos con enlace).
 *   6. A quién se le pagó y quién estuvo.
 * Los gráficos son sólo dos, y los dos tienen sentido de obra: barras contra su vara y la curva S.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, ChevronLeft, Layers, Pencil, Plus } from 'lucide-react';
import { PageHeader } from '../components/abmv2/PageHeader';
import { SemanticHero } from '../components/ui/SemanticHero';
import { SideModal, SideModalField } from '../components/abmv2/SideModal';
import { SelectorAdaptativo } from '../components/abmv2/SelectorAdaptativo';
import LineaDeTiempoObra, { type LtEtapa, type LtHito } from '../components/abmv2/LineaDeTiempoObra';
import { TresRelojes } from '../components/abmv2/TresRelojes';
import { CurvaInversion } from '../components/abmv2/CurvaInversion';
import { FichaEtapa, TablaGastosObra } from '../components/abmv2/FichaEtapa';
import { seg, type HeroKpi } from '../lib/semanticHero';
import { obrasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { fmtMoney } from '../lib/obras-helpers';
import { fechaCorta, type DetalleObra, type EtapaObra, type PendienteObra } from '../lib/obras-tipos';
import { CrearGastoWizard } from '../components/tesoreria/CrearGastoWizard';

const ESTADOS_ETAPA = [{ value: 'pendiente', label: 'Por empezar' }, { value: 'en_curso', label: 'En curso' }, { value: 'terminada', label: 'Terminada' }, { value: 'parada', label: 'Parada' }];
const etapaVacia = (orden: number, extra: Partial<EtapaObra> = {}): EtapaObra => ({
  id: -Date.now() - orden, orden, nombre: '', incidencia_pct: '0', avance_pct: 0, estado: 'pendiente', ejecutado: '0', programado: '0', n_gastos: 0,
  contratista: '0', materiales: '0', mano_de_obra: '0', otros: '0', situacion: 'por_empezar', veredicto: 'bueno', frase: '', gente: { ordenes_trabajo: 0, horas: 0, cuadrillas: [] }, ...extra,
});

export default function ObraDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [d, setD] = useState<DetalleObra | null>(null);
  const [loading, setLoading] = useState(true);
  const [etapaActiva, setEtapaActiva] = useState<number | null>(null);
  const [editEtapas, setEditEtapas] = useState<EtapaObra[] | null>(null);
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

  // Al abrir, la etapa en curso queda abierta: es la que importa hoy.
  useEffect(() => {
    if (d && etapaActiva === null) {
      const enCurso = d.etapas.find((e) => e.estado === 'en_curso' || e.estado === 'parada') ?? d.etapas.find((e) => e.estado !== 'terminada');
      if (enCurso) setEtapaActiva(enCurso.id);
    }
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  const hoy = new Date().toISOString().slice(0, 10);
  const ltEtapas: LtEtapa[] = useMemo(() => (d?.etapas ?? []).map((e) => ({
    id: e.id, orden: e.orden, nombre: e.nombre, estado: e.estado, situacion: e.situacion, veredicto: e.veredicto, avance_pct: e.avance_pct, ejecutado: Number(e.ejecutado),
    fecha_inicio_prevista: e.fecha_inicio_prevista, fecha_fin_prevista: e.fecha_fin_prevista, fecha_inicio_real: e.fecha_inicio_real, fecha_fin_real: e.fecha_fin_real,
  })), [d]);
  const hitos: LtHito[] = useMemo(() => {
    if (!d) return [];
    const h: LtHito[] = [];
    const inicio = d.obra.fecha_inicio_real || d.obra.fecha_inicio || d.curva[0]?.fecha;
    if (inicio) h.push({ fecha: inicio, label: `Inicio · ${fechaCorta(inicio)}`, tono: 'primario' });
    const finPrev = d.proyeccion.fin_previsto;
    if (finPrev) h.push({ fecha: finPrev, label: `Fin previsto · ${fechaCorta(finPrev)}`, tono: 'previsto' });
    const finProy = d.proyeccion.fin_proyectado;
    if (finProy && finProy !== finPrev) {
      const desv = d.proyeccion.desvio_dias ?? 0;
      const term = d.proyeccion.base.startsWith('terminada');
      h.push({ fecha: finProy, label: term ? `Terminó · ${fechaCorta(finProy)}` : `Si sigue así · ${fechaCorta(finProy)}`, tono: term ? 'bueno' : desv > 0 ? 'malo' : 'bueno' });
    }
    return h;
  }, [d]);
  const lineaHasta = useMemo(() => {
    if (!d) return hoy;
    const f = [d.linea_hasta, d.proyeccion.fin_proyectado, d.proyeccion.fin_previsto, hoy].filter((x): x is string => !!x);
    return f.sort()[f.length - 1];
  }, [d, hoy]);

  const gastosDe = useCallback((e: EtapaObra) => (d?.gastos ?? []).filter((g) => g.etapa_id === e.id || (g.etapa_id == null && g.etapa_propuesta_id === e.id)), [d]);
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
  const abrirGasto = (gastoId: number) => navigate(`/gestion/tesoreria?gasto=${gastoId}`);
  const irAEtapa = (etapaId: number) => {
    setEtapaActiva(etapaId);
    setTimeout(() => document.getElementById(`etapa-${etapaId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
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
  const rel = d.relojes;
  const proy = d.proyeccion;
  const terminada = proy.base.startsWith('terminada');
  const desvDias = proy.desvio_dias ?? 0;
  const desvPlata = proy.desvio_plata ? Number(proy.desvio_plata) : 0;
  const kpis: HeroKpi[] = [
    { etiqueta: 'Hecho', valor: rel?.hecho.pct != null ? `${rel.hecho.pct}%` : '—', sub: rel?.hecho.sub ?? 'sin avance cargado', veredicto: rel?.hecho.veredicto },
    { etiqueta: 'Tiempo', valor: rel?.tiempo.pct != null ? `${rel.tiempo.pct}%` : '—', sub: rel ? `${rel.tiempo.valor}${rel.tiempo.sub ? ` · ${rel.tiempo.sub}` : ''}` : '', veredicto: rel?.tiempo.veredicto },
    { etiqueta: 'Plata', valor: rel?.plata.pct != null ? `${rel.plata.pct}%` : fmtMoney(k.ejecutado), sub: rel?.plata.valor ?? '', veredicto: rel?.plata.veredicto },
    {
      etiqueta: terminada ? 'Terminó' : 'Termina',
      valor: proy.fin_proyectado ? fechaCorta(proy.fin_proyectado) : '—',
      sub: proy.fin_proyectado ? (desvDias > 0 ? `${desvDias} días tarde` : desvDias < 0 ? `${-desvDias} días antes` : proy.fin_previsto ? 'en fecha' : 'sin fin previsto') : proy.base,
      veredicto: proy.fin_proyectado ? (desvDias > 7 ? 'malo' : desvDias > 0 ? 'advertencia' : 'bueno') : undefined,
    },
    {
      etiqueta: terminada ? 'Costó' : 'Va a costar',
      valor: proy.costo_proyectado ? fmtMoney(proy.costo_proyectado) : '—',
      sub: proy.costo_proyectado ? (Math.abs(desvPlata) < 500000 ? 'lo presupuestado' : `${fmtMoney(Math.abs(desvPlata))} ${desvPlata > 0 ? 'más' : 'menos'} que el presupuesto`) : (k.presupuesto_vigente ? 'sin ritmo para proyectar' : 'sin presupuesto cargado'),
      veredicto: proy.costo_proyectado ? (desvPlata > 500000 ? 'malo' : 'bueno') : undefined,
    },
  ];
  const subtitulo = [d.obra.tipo_obra, d.obra.modalidad === 'contrato' ? 'por contrato' : d.obra.modalidad === 'administracion' ? 'por administración' : null, d.contratista?.nombre, d.obra.expediente && `exp. ${d.obra.expediente}`, d.obra.fuente_financiamiento && `financiamiento ${d.obra.fuente_financiamiento}`, d.barrio].filter(Boolean).join(' · ');

  const accionPendiente = (p: PendienteObra) => {
    switch (p.tipo) {
      case 'sin_etapa': return sinEtapa.length ? <button type="button" className="av2-btn-primario" onClick={() => { void confirmar(sinEtapa.map((g) => g.imputacion_id)); }}><Check size={14} /> Confirmar {sinEtapa.length === 1 ? 'la propuesta' : `las ${sinEtapa.length}`}</button> : null;
      case 'vencidos_sin_pagar': return <button type="button" className="av2-btn-secundario" onClick={() => navigate('/gestion/tesoreria/pagos-programados')}>Ver en Tesorería</button>;
      case 'etapa_vencida': case 'etapa_parada': return (
        <>
          {p.etapa_id != null && <button type="button" className="av2-btn-secundario" onClick={() => irAEtapa(p.etapa_id as number)}>Ver la etapa</button>}
          <button type="button" className="av2-btn-secundario" onClick={() => setEditEtapas(d.etapas.map((e) => ({ ...e })))}><Layers size={14} /> Corregir etapas</button>
        </>
      );
      case 'sin_etapas': return <button type="button" className="av2-btn-primario" onClick={() => setEditEtapas([etapaVacia(1, { nombre: 'Ejecución', incidencia_pct: '100', avance_pct: d.obra.avance ?? 0, estado: 'en_curso', fecha_inicio_prevista: d.obra.fecha_inicio ?? null, fecha_fin_prevista: d.obra.fecha_fin ?? null })])}><Layers size={14} /> Cargar las etapas</button>;
      default: return <button type="button" className="av2-btn-secundario" onClick={abrirEditObra}><Pencil size={14} /> Editar la obra</button>;
    }
  };

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

      {/* 1. El veredicto */}
      <div className="av2-hero-wrap">
        <SemanticHero etiqueta={`OBRA · ${(d.obra.estado_obra ?? d.obra.estado).replace('_', ' ').toUpperCase()}`} frases={[{ segmentos: [seg(d.frase, k.veredicto)] }]} kpis={kpis} className="av2-hero" sinAutoRotacion />
      </div>

      {/* 2. Lo que hay que resolver */}
      {d.pendientes.length > 0 && (
        <section className="pend">
          {d.pendientes.map((p, i) => (
            <div key={i} className={`pend-item pend-item--${p.veredicto}`}>
              <div className="pend-texto">
                <strong>{p.titulo}</strong>
                <span>{p.detalle}</span>
              </div>
              <div className="pend-acciones">{accionPendiente(p)}</div>
            </div>
          ))}
        </section>
      )}

      {/* 3. El mapa del calendario */}
      <section className="gr-card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>La obra en el calendario</h3>
          <span style={{ fontSize: 'var(--pl-fs-caption)', color: 'var(--pl-text-muted)' }}>Siempre entera. La línea ámbar es hoy; el rombo rojo, a dónde llega si sigue así.</span>
        </div>
        <LineaDeTiempoObra
          desde={d.linea_desde ?? hoy}
          hasta={lineaHasta}
          etapas={ltEtapas}
          hitos={hitos}
          hoy={hoy}
          etapaActivaId={etapaActiva}
          onEtapa={(eid) => { if (eid == null) setEtapaActiva(null); else irAEtapa(eid); }}
          fmtMoney={(n) => fmtMoney(n)}
        />
      </section>

      {/* 4. Los tres relojes y la curva */}
      <div className="gr-grid gr-grid--2" style={{ marginTop: 16 }}>
        <article className="gr-card">
          <h3>Los tres relojes</h3>
          <p className="gr-q">Tiempo consumido, obra hecha y plata pagada, cada uno contra su vara. <b>Tienen que caminar juntos</b>; el que se adelanta es el problema. La marca oscura en tiempo y plata es lo hecho.</p>
          {rel && <TresRelojes {...rel} tamano="grande" />}
        </article>
        <CurvaInversion puntos={d.curva} fisico={d.fisico} presupuesto={k.presupuesto_vigente ? Number(k.presupuesto_vigente) : null} proyeccion={proy} hoy={hoy} fmtMoney={fmtMoney} />
      </div>

      {/* 5. Etapa por etapa */}
      {d.etapas.length > 0 ? (
        <section style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
            <h3 className="fe-seccion">Etapa por etapa</h3>
            <span style={{ fontSize: 'var(--pl-fs-caption)', color: 'var(--pl-text-muted)' }}>Cada etapa es una obra en chico: sus tres relojes, en qué se fue la plata y su libro de gastos.</span>
          </div>
          <div className="fe-lista">
            {d.etapas.map((e) => (
              <FichaEtapa
                key={e.id}
                etapa={e}
                gastos={gastosDe(e)}
                abierta={etapaActiva === e.id}
                hoy={hoy}
                onToggle={() => setEtapaActiva(etapaActiva === e.id ? null : e.id)}
                onConfirmar={(ids, etapaId) => { void confirmar(ids, etapaId); }}
                onAbrirGasto={abrirGasto}
                fmtMoney={fmtMoney}
              />
            ))}
          </div>
        </section>
      ) : (
        <article className="gr-card" style={{ marginTop: 16 }}>
          <h3>Los gastos de la obra</h3>
          <p className="gr-q">{d.gastos.length} gasto{d.gastos.length === 1 ? '' : 's'}. Sin etapas es la película de la plata, nada más. <b>Cada renglón abre en Tesorería.</b></p>
          <TablaGastosObra gastos={d.gastos} hoy={hoy} conEtapas={false} onAbrirGasto={abrirGasto} fmtMoney={fmtMoney} />
        </article>
      )}

      {/* 6. A quién se le pagó, quién estuvo */}
      <div className="gr-grid gr-grid--2" style={{ marginTop: 16 }}>
        <article className="gr-card">
          <h3>A quién se le pagó</h3>
          <p className="gr-q">{d.proveedores.length} persona{d.proveedores.length === 1 ? '' : 's'} o empresa{d.proveedores.length === 1 ? '' : 's'} cobraron por esta obra.</p>
          {d.proveedores.slice(0, 8).map((p) => fila(<>{p.persona.nombre} <span style={{ color: 'var(--pl-text-muted)' }}>· {p.persona.tipo} · {p.n_gastos}</span></>, fmtMoney(p.total)))}
        </article>
        <article className="gr-card">
          <h3>Quién estuvo</h3>
          <p className="gr-q">Órdenes de trabajo de la obra y sueldos imputados.</p>
          {fila('Órdenes de trabajo', `${d.gente.ordenes_trabajo} · ${d.gente.horas} h`)}
          {d.gente.cuadrillas.length > 0 && fila('Cuadrillas', d.gente.cuadrillas.join(', '))}
          {d.gente.personas_ot.length > 0 && fila('Personas en OT', d.gente.personas_ot.join(', '))}
          {fila('Sueldos imputados', d.gente.sueldos_personas ? `${d.gente.sueldos_personas} personas · ${fmtMoney(d.gente.sueldos_total)}` : 'ninguno')}
        </article>
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
                    <input value={e.nombre} placeholder={`Etapa ${i + 1}`} onChange={(ev) => setEditEtapas(editEtapas.map((x, k2) => k2 === i ? { ...x, nombre: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
                    <input type="number" min={0} max={100} title="incidencia %" value={e.incidencia_pct} onChange={(ev) => setEditEtapas(editEtapas.map((x, k2) => k2 === i ? { ...x, incidencia_pct: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
                    <button type="button" className="av2-btn-secundario av2-btn-icono" title="Sacar" onClick={() => setEditEtapas(editEtapas.filter((_, k2) => k2 !== i))}>×</button>
                  </div>
                  <div className="av2-form-grid">
                    <SideModalField label="Estado"><SelectorAdaptativo label="" value={e.estado} onChange={(v) => setEditEtapas(editEtapas.map((x, k2) => k2 === i ? { ...x, estado: v } : x))} options={ESTADOS_ETAPA} /></SideModalField>
                    <SideModalField label="Avance %"><input type="number" min={0} max={100} value={e.avance_pct} onChange={(ev) => setEditEtapas(editEtapas.map((x, k2) => k2 === i ? { ...x, avance_pct: Number(ev.target.value) } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} /></SideModalField>
                    <SideModalField label="Inicio previsto"><input type="date" value={e.fecha_inicio_prevista ?? ''} onChange={(ev) => setEditEtapas(editEtapas.map((x, k2) => k2 === i ? { ...x, fecha_inicio_prevista: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} /></SideModalField>
                    <SideModalField label="Fin previsto"><input type="date" value={e.fecha_fin_prevista ?? ''} onChange={(ev) => setEditEtapas(editEtapas.map((x, k2) => k2 === i ? { ...x, fecha_fin_prevista: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} /></SideModalField>
                    <SideModalField label="Inicio real"><input type="date" value={e.fecha_inicio_real ?? ''} onChange={(ev) => setEditEtapas(editEtapas.map((x, k2) => k2 === i ? { ...x, fecha_inicio_real: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} /></SideModalField>
                    <SideModalField label="Fin real"><input type="date" value={e.fecha_fin_real ?? ''} onChange={(ev) => setEditEtapas(editEtapas.map((x, k2) => k2 === i ? { ...x, fecha_fin_real: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} /></SideModalField>
                    <SideModalField label="Previsto ($)" full><input type="number" min={0} value={e.monto_previsto ?? ''} onChange={(ev) => setEditEtapas(editEtapas.map((x, k2) => k2 === i ? { ...x, monto_previsto: ev.target.value } : x))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} /></SideModalField>
                  </div>
                </div>
              ))}
              <button type="button" className="av2-btn-secundario" style={{ alignSelf: 'flex-start' }} onClick={() => setEditEtapas([...editEtapas, etapaVacia(editEtapas.length + 1)])}><Plus size={14} /> Agregar etapa</button>
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

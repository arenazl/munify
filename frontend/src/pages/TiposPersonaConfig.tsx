/**
 * Tipos de persona — el árbol "Persona → tipo → subtipo" del municipio.
 *
 * Vive en Configuración › Personas › Tipos y reemplaza al "Tipos de empleado"
 * de Tesorería: lo que antes era un catálogo aparte es ahora un SUBTIPO de
 * `empleado` (dueño, 2026-09-13: "un nivel más"). Cada municipio agrega los
 * suyos ("bomberos voluntarios", "cooperativa") y apaga los que no usa; "otro"
 * nace apagado en los municipios nuevos.
 *
 * Piezas del kit v3: `TreeList` para el árbol y `SideModal` para alta/edición.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Power, Users } from 'lucide-react';
import { TreeList } from '../components/abmv2/TreeList';
import { SideModal, SideModalField } from '../components/abmv2/SideModal';
import type { TreeNode } from '../components/abmv2/types';
import { personasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import type { PersonaTipo } from './Personas';

type Form = { nombre: string; codigo: string; descripcion: string; cobra: boolean; activo: boolean; padre_id: number | null };

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

export default function TiposPersonaConfig() {
  const { theme } = useTheme();
  const [tipos, setTipos] = useState<PersonaTipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<PersonaTipo | null>(null);
  const [creando, setCreando] = useState<{ padre: PersonaTipo | null } | null>(null);
  const [form, setForm] = useState<Form>({ nombre: '', codigo: '', descripcion: '', cobra: true, activo: true, padre_id: null });
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await personasApi.tipos(false);
      setTipos(r.data);
    } catch {
      toast.error('No se pudo cargar el catálogo de tipos');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const abrirEdicion = (t: PersonaTipo) => {
    setForm({ nombre: t.nombre, codigo: t.codigo, descripcion: '', cobra: t.cobra, activo: t.activo, padre_id: t.padre_id ?? null });
    setEditando(t);
  };
  const abrirAlta = (padre: PersonaTipo | null) => {
    setForm({ nombre: '', codigo: '', descripcion: '', cobra: true, activo: true, padre_id: padre?.id ?? null });
    setCreando({ padre });
  };
  const cerrar = () => { setEditando(null); setCreando(null); };

  const alternar = async (t: PersonaTipo) => {
    try {
      await personasApi.editarTipo(t.id, { activo: !t.activo });
      toast.success(t.activo ? `"${t.nombre}" apagado: deja de ofrecerse en las altas` : `"${t.nombre}" encendido`);
      void cargar();
    } catch {
      toast.error('No se pudo cambiar el estado');
    }
  };

  const guardar = async () => {
    if (!form.nombre.trim()) return toast.error('El nombre es obligatorio');
    setGuardando(true);
    try {
      if (editando) {
        await personasApi.editarTipo(editando.id, { nombre: form.nombre.trim(), descripcion: form.descripcion || undefined, cobra: form.cobra, activo: form.activo });
        toast.success('Tipo guardado');
      } else {
        await personasApi.crearTipo({
          nombre: form.nombre.trim(),
          codigo: form.codigo.trim() || slug(form.nombre),
          descripcion: form.descripcion || undefined,
          cobra: form.cobra,
          activo: form.activo,
          padre_id: form.padre_id,
        });
        toast.success(form.padre_id ? 'Subtipo creado' : 'Tipo creado');
      }
      cerrar();
      void cargar();
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const nodo = (t: PersonaTipo, esSub: boolean): TreeNode => ({
    id: String(t.id),
    label: t.nombre,
    icon: Users,
    tileColor: t.activo ? undefined : 'var(--pl-text-muted)',
    sub: esSub ? `subtipo · código ${t.codigo}` : `código ${t.codigo}${t.cobra ? '' : ' · no cobra'}`,
    chip: t.activo ? undefined : { label: 'apagado', tone: 'gray' },
    amount: { value: String(t.cantidad), note: t.cantidad === 1 ? 'persona' : 'personas', muted: t.cantidad === 0 },
    actions: [
      { id: 'editar', label: 'Editar', icon: Pencil, onClick: () => abrirEdicion(t) },
      { id: 'alternar', label: t.activo ? 'Apagar' : 'Encender', icon: Power, onClick: () => { void alternar(t); }, danger: t.activo },
    ],
    children: esSub ? undefined : t.subtipos.map((s) => nodo(s, true)),
    addLabel: esSub ? undefined : `Agregar subtipo de ${t.nombre.toLowerCase()}`,
    onAdd: esSub ? undefined : () => abrirAlta(t),
  });

  const nodes = useMemo(() => tipos.map((t) => nodo(t, false)), [tipos]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = tipos.reduce((a, t) => a + t.cantidad, 0);

  const inputStyle = { backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text };
  const abierto = editando || creando;
  const titulo = editando ? `Editar ${editando.padre_id ? 'subtipo' : 'tipo'}` : creando?.padre ? `Nuevo subtipo de ${creando.padre.nombre}` : 'Nuevo tipo de persona';

  return (
    <div className="av2-page av2-page--embebida" data-module="personas-tipos">
      <p className="av2-campo-nota" style={{ margin: '4px 0 12px' }}>
        Persona → tipo → subtipo. Lo que se marca acá es lo que se ofrece al dar de alta una persona.
        Apagar un tipo no borra a nadie: sólo deja de ofrecerse.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button type="button" className="av2-btn-primario" onClick={() => abrirAlta(null)}>
          <Plus size={15} strokeWidth={2.2} /> Nuevo tipo
        </button>
      </div>
      <TreeList
        nodes={nodes}
        defaultExpandedIds={tipos.filter((t) => t.subtipos.length > 0).map((t) => String(t.id))}
        loading={loading}
        footer={`${tipos.length} tipos · ${total.toLocaleString('es-AR')} vínculos`}
        emptyMessage="Este municipio todavía no tiene tipos de persona."
      />

      {abierto && (
        <SideModal
          mode={editando ? 'edit' : 'create'}
          width={480}
          open
          onClose={cerrar}
          header={{ title: titulo, metaTop: editando ? `código ${editando.codigo}` : 'El código se arma solo a partir del nombre' }}
          sections={[{ id: 'datos', label: 'Datos', content: (
            <div className="av2-form-grid">
              <SideModalField label="Nombre" required full>
                <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Cooperativa, Bomberos voluntarios, Pasantes" className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
              </SideModalField>
              {!editando && (
                <SideModalField label="Código" help="Para el sistema. Si lo dejás vacío, sale del nombre." full>
                  <input type="text" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    placeholder={slug(form.nombre) || 'cooperativa'} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
                </SideModalField>
              )}
              <SideModalField label="Descripción" full>
                <textarea className="av2-sheet-nota" rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
              </SideModalField>
              <SideModalField label="Cobra" help="Si recibe dinero del municipio. Un intendente vecino es persona, pero no cobra.">
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--pl-fs-body-sm)' }}>
                  <input type="checkbox" checked={form.cobra} onChange={(e) => setForm({ ...form, cobra: e.target.checked })} /> Recibe pagos
                </label>
              </SideModalField>
              <SideModalField label="Estado">
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--pl-fs-body-sm)' }}>
                  <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Se ofrece en las altas
                </label>
              </SideModalField>
            </div>
          ) }]}
          footer={{
            primary: { label: guardando ? 'Guardando…' : 'Guardar', onClick: () => { void guardar(); }, disabled: guardando },
            secondary: [{ label: 'Cancelar', onClick: cerrar }],
          }}
        />
      )}
    </div>
  );
}

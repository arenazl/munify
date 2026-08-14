import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Sheet } from '../ui/Sheet';
import { IconColorPicker } from '../abmv2/IconColorPicker';
import { ICONOS_DISPONIBLES, COLORES_DISPONIBLES } from './CategoriaConfigBase';
import { dependenciasApi } from '../../lib/api';

/**
 * DependenciaSheet — la edición del ADN de una dependencia, con el kit.
 *
 * Dos capas en un solo guardar (paridad con la pantalla vieja de prod):
 *  - IDENTIDAD (catálogo global, PUT /dependencias/catalogo/{id}): nombre,
 *    descripción, icono y color — lo que se ve en toda la app.
 *  - CONTACTO LOCAL (pivot del municipio, PUT /dependencias/municipio/{id}):
 *    dirección, localidad, teléfono, email y horario de atención.
 *
 * Pendiente de la paridad completa (fase B): autocomplete Nominatim + mapa
 * clic-para-marcar, y sugerencias de estructura con IA.
 */

export interface DependenciaEditable {
  /** id de MunicipioDependencia (el pivot). */
  id: number;
  /** id del catálogo global (el que edita identidad). */
  dependencia_id: number;
  nombre: string;
  descripcion?: string | null;
  color?: string | null;
  icono?: string | null;
  tipo_jerarquico?: string;
}

interface Props {
  open: boolean;
  dependencia: DependenciaEditable | null;
  onClose: () => void;
  onGuardado: () => void;
}

export function DependenciaSheet({ open, dependencia, onClose, onGuardado }: Props) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [icono, setIcono] = useState('Landmark');
  const [color, setColor] = useState('#6366f1');
  const [direccionLocal, setDireccionLocal] = useState('');
  const [localidadLocal, setLocalidadLocal] = useState('');
  const [telefonoLocal, setTelefonoLocal] = useState('');
  const [emailLocal, setEmailLocal] = useState('');
  const [horarioLocal, setHorarioLocal] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open || !dependencia) return;
    setNombre(dependencia.nombre);
    setDescripcion(dependencia.descripcion || '');
    setIcono(dependencia.icono || (dependencia.tipo_jerarquico === 'DIRECCION' ? 'Building2' : 'Landmark'));
    setColor(dependencia.color || '#6366f1');
    // El contacto local vive en el pivot: se trae al abrir.
    dependenciasApi.getOneMunicipio(dependencia.id).then((res) => {
      const d = res.data || {};
      setDireccionLocal(d.direccion_local || '');
      setLocalidadLocal(d.localidad_local || '');
      setTelefonoLocal(d.telefono_local || '');
      setEmailLocal(d.email_local || '');
      setHorarioLocal(d.horario_atencion_local || '');
    }).catch(() => { /* sin contacto local cargado: campos vacíos */ });
  }, [open, dependencia]);

  const guardar = async () => {
    if (!dependencia || !nombre.trim()) return;
    setGuardando(true);
    try {
      await Promise.all([
        dependenciasApi.updateCatalogo(dependencia.dependencia_id, {
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          icono,
          color,
        }),
        dependenciasApi.updateMunicipio(dependencia.id, {
          direccion_local: direccionLocal.trim() || null,
          localidad_local: localidadLocal.trim() || null,
          telefono_local: telefonoLocal.trim() || null,
          email_local: emailLocal.trim() || null,
          horario_atencion_local: horarioLocal.trim() || null,
        }),
      ]);
      toast.success(`${nombre.trim()} guardada.`);
      onGuardado();
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : 'No se pudo guardar la dependencia');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={dependencia ? `Editar ${dependencia.nombre}` : ''}
      description="La identidad se ve en toda la app; el contacto es propio de este municipio."
      stickyFooter={
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-[36px] px-4"
            style={{ background: 'transparent', border: '1px solid var(--pl-border)', borderRadius: 'var(--pl-radius-md)', fontSize: '12.5px', fontWeight: 600, color: 'var(--pl-text-2)', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !nombre.trim()}
            className="h-[36px] px-4"
            style={{ background: 'var(--pl-green)', border: 'none', borderRadius: 'var(--pl-radius-md)', fontSize: '12.5px', fontWeight: 600, color: 'var(--pl-on-accent)', cursor: guardando ? 'wait' : 'pointer', opacity: guardando || !nombre.trim() ? 0.6 : 1 }}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="av2-campo-label" htmlFor="dep-nombre">Nombre</label>
          <input
            id="dep-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full h-[38px] px-3"
            style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: 'var(--pl-radius-md)', fontSize: '13px', color: 'var(--pl-text)' }}
          />
        </div>

        <div>
          <label className="av2-campo-label" htmlFor="dep-desc">Descripción</label>
          <textarea
            id="dep-desc"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            placeholder="Qué atiende esta dependencia"
            className="w-full px-3 py-2"
            style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: 'var(--pl-radius-md)', fontSize: '13px', color: 'var(--pl-text)', resize: 'vertical' }}
          />
        </div>

        <IconColorPicker
          icons={ICONOS_DISPONIBLES}
          icon={icono}
          onIconChange={setIcono}
          colors={COLORES_DISPONIBLES}
          color={color}
          onColorChange={setColor}
          preview={{ title: nombre || 'Dependencia', subtitle: 'Así se ve en toda la app' }}
        />

        <div style={{ borderTop: '1px solid var(--pl-border)', paddingTop: '14px' }}>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)', margin: '0 0 10px' }}>
            CONTACTO EN ESTE MUNICIPIO
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="av2-campo-label" htmlFor="dep-dir">Dirección</label>
              <input id="dep-dir" value={direccionLocal} onChange={(e) => setDireccionLocal(e.target.value)} placeholder="Ej: Avda. Mariscal López 1450"
                className="w-full h-[38px] px-3" style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: 'var(--pl-radius-md)', fontSize: '13px', color: 'var(--pl-text)' }} />
            </div>
            <div>
              <label className="av2-campo-label" htmlFor="dep-loc">Localidad</label>
              <input id="dep-loc" value={localidadLocal} onChange={(e) => setLocalidadLocal(e.target.value)}
                className="w-full h-[38px] px-3" style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: 'var(--pl-radius-md)', fontSize: '13px', color: 'var(--pl-text)' }} />
            </div>
            <div>
              <label className="av2-campo-label" htmlFor="dep-tel">Teléfono</label>
              <input id="dep-tel" value={telefonoLocal} onChange={(e) => setTelefonoLocal(e.target.value)}
                className="w-full h-[38px] px-3" style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: 'var(--pl-radius-md)', fontSize: '13px', color: 'var(--pl-text)' }} />
            </div>
            <div>
              <label className="av2-campo-label" htmlFor="dep-mail">Email</label>
              <input id="dep-mail" type="email" value={emailLocal} onChange={(e) => setEmailLocal(e.target.value)}
                className="w-full h-[38px] px-3" style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: 'var(--pl-radius-md)', fontSize: '13px', color: 'var(--pl-text)' }} />
            </div>
            <div>
              <label className="av2-campo-label" htmlFor="dep-hor">Horario de atención</label>
              <input id="dep-hor" value={horarioLocal} onChange={(e) => setHorarioLocal(e.target.value)} placeholder="Ej: Lunes a viernes de 7 a 13"
                className="w-full h-[38px] px-3" style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: 'var(--pl-radius-md)', fontSize: '13px', color: 'var(--pl-text)' }} />
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

export default DependenciaSheet;

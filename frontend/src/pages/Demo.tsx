import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogIn, Sparkles, ArrowRight, Trash2, Check, Search, ShieldCheck, CreditCard, MapPin } from 'lucide-react';
import { municipiosApi } from '../lib/api';
import { clearMunicipio } from '../utils/municipioStorage';
import DemoCreationProgress from '../components/DemoCreationProgress';
import PresentacionLaunchButton from '../components/PresentacionLaunchButton';
import { BrandMark } from '../brands/BrandMark';
import { BRAND } from '../brands';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { BanderaPais, type CodigoPais } from '../components/ui/BanderaPais';
import './Demo.css';

interface Municipio {
  id: number;
  nombre: string;
  codigo: string;
  color_primario?: string;
  logo_url?: string;
}

// Municipio del catálogo OFICIAL (tabla local municipios_argentina, georef).
interface MuniArg {
  id: string;
  nombre: string;
  /** Provincia (AR) o departamento (PY). Es lo que desambigua homónimos. */
  provincia: string;
  lat: number;
  lng: number;
  pais?: string;
  alias?: string[];
}

/** Países con catálogo de municipios cargado, en el orden de las banderas.
 *  Cada uno se llena por batch (`scripts/cargar_catalogo_latam.py`) al nivel
 *  donde hay intendente o alcalde, que no es el mismo en todos: comuna en
 *  Chile, departamento en Uruguay, distrito en Perú. */
const PAISES: { cod: CodigoPais; nombre: string }[] = [
  { cod: 'AR', nombre: 'Argentina' },
  { cod: 'PY', nombre: 'Paraguay' },
  { cod: 'UY', nombre: 'Uruguay' },
  { cod: 'CL', nombre: 'Chile' },
  { cod: 'PE', nombre: 'Perú' },
  { cod: 'BO', nombre: 'Bolivia' },
];

const PLACEHOLDER_CITIES = ['Pergamino', 'San Pedro', 'Salta', 'Tandil', 'Rosario', 'Bariloche'];
const MAX_NAME = 40;
const MIN_NAME = 3;
const SEARCH_THRESHOLD = 6;

export default function Demo() {
  const navigate = useNavigate();
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [creando, setCreando] = useState(false);
  const [creandoDone, setCreandoDone] = useState(false);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Municipio | null>(null);
  const [search, setSearch] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  // Autocomplete del catálogo oficial: solo se puede crear una demo con un
  // municipio REAL elegido de la lista (basta de "Pepito Pepito").
  // País del catálogo. Argentina por defecto (es el que más se usa); cambiarlo
  // limpia la selección hecha, porque un municipio pertenece a un solo país.
  const [pais, setPais] = useState<CodigoPais>('AR');
  const [sugerencias, setSugerencias] = useState<MuniArg[]>([]);
  const [muniSel, setMuniSel] = useState<MuniArg | null>(null);
  const [showSug, setShowSug] = useState(false);
  const [hlIdx, setHlIdx] = useState(0);
  const [buscando, setBuscando] = useState(false);

  // Buscar en el catálogo con debounce mientras tipea (y sin selección hecha)
  useEffect(() => {
    const q = nuevoNombre.trim();
    if (muniSel && `${muniSel.nombre}` === q) { setSugerencias([]); return; }
    if (q.length < 2) { setSugerencias([]); setShowSug(false); return; }
    setBuscando(true);
    const id = setTimeout(() => {
      municipiosApi.buscarCatalogo(q, pais)
        .then((r) => { setSugerencias(r.data || []); setShowSug(true); setHlIdx(0); })
        .catch(() => setSugerencias([]))
        .finally(() => setBuscando(false));
    }, 220);
    return () => clearTimeout(id);
  }, [nuevoNombre, muniSel, pais]);

  const elegirMuni = (m: MuniArg) => {
    setMuniSel(m);
    setNuevoNombre(m.nombre.slice(0, MAX_NAME));
    setShowSug(false);
  };

  // Resalta la parte del nombre que matchea lo tipeado
  const resaltar = (nombre: string, q: string) => {
    const i = nombre.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return <>{nombre}</>;
    return (
      <>
        {nombre.slice(0, i)}
        <span className="dm-sug-match">{nombre.slice(i, i + q.length)}</span>
        {nombre.slice(i + q.length)}
      </>
    );
  };

  useEffect(() => {
    clearMunicipio();
    const fetchMunicipios = async () => {
      try {
        const response = await municipiosApi.getPublic();
        setMunicipios(response.data);
      } catch (err) {
        console.error('Error cargando municipios:', err);
        setError('No se pudieron cargar los municipios');
      } finally {
        setLoading(false);
      }
    };
    fetchMunicipios();
  }, []);

  // Rotar placeholder cada 2.2s mientras el input esté vacío y no haya foco.
  useEffect(() => {
    if (nuevoNombre.length > 0) return;
    const id = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_CITIES.length);
    }, 2200);
    return () => clearInterval(id);
  }, [nuevoNombre]);

  const saveMunicipioToStorage = (municipio: Municipio) => {
    localStorage.setItem('municipio_id', String(municipio.id));
    localStorage.setItem('municipio_actual_id', String(municipio.id));
    localStorage.setItem('municipio_codigo', municipio.codigo);
    localStorage.setItem('municipio_nombre', municipio.nombre);
    localStorage.setItem('municipio_color', municipio.color_primario || '#0088cc');
  };

  const handleSelectMunicipio = (municipio: Municipio) => {
    saveMunicipioToStorage(municipio);
    navigate(`/demo/listo?muni=${municipio.codigo}`);
  };

  const confirmEliminar = async () => {
    if (!toDelete) return;
    const muni = toDelete;
    setEliminando(muni.codigo);
    try {
      await municipiosApi.eliminarDemo(muni.codigo);
      setMunicipios((prev) => prev.filter((m) => m.id !== muni.id));
      setToDelete(null);
    } catch (err) {
      console.error('Error eliminando demo:', err);
      setError('No se pudo eliminar la demo');
    } finally {
      setEliminando(null);
    }
  };

  const handleCrearDemo = async () => {
    const nombre = nuevoNombre.trim();
    if (nombre.length < MIN_NAME) {
      setError(`El nombre debe tener al menos ${MIN_NAME} caracteres`);
      return;
    }
    if (!muniSel || muniSel.nombre !== nombre) {
      // El copy nombra el país ELEGIDO en la botonera: el catálogo dejó de ser
      // mono-país y decir "Argentina" con la bandera de Paraguay puesta hacía
      // pensar que la búsqueda estaba rota.
      const paisNombre = PAISES.find((p) => p.cod === pais)?.nombre || pais;
      setError(`Elegí tu municipio de la lista (catálogo oficial de ${paisNombre}). Sin una ciudad del catálogo la demo queda sin barrios ni calles reales.`);
      return;
    }
    setCreando(true);
    setCreandoDone(false);
    setError('');
    try {
      // El `pais` viaja SIEMPRE: es lo que decide dónde se busca el polígono
      // oficial de la ciudad y, con él, sus barrios y calles reales. Se manda
      // el del municipio elegido (no el de la botonera) porque es el dato que
      // acompaña a lat/lng/provincia de esa misma fila del catálogo.
      const res = await municipiosApi.crearDemo(nombre, {
        lat: muniSel.lat, lng: muniSel.lng, provincia: muniSel.provincia,
        pais: muniSel.pais || pais,
      });
      const muni = res.data;
      saveMunicipioToStorage({
        id: muni.id,
        nombre: muni.nombre,
        codigo: muni.codigo,
        color_primario: '#0088cc',
      });
      setCreandoDone(true);
      await new Promise((resolve) => setTimeout(resolve, 700));
      navigate(`/demo/listo?muni=${muni.codigo}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Error creando el municipio de demo');
    } finally {
      setCreando(false);
    }
  };

  const trimmed = nuevoNombre.trim();
  // Válido = municipio REAL seleccionado del catálogo (no texto libre)
  const nameValid = trimmed.length >= MIN_NAME && trimmed.length <= MAX_NAME
    && !!muniSel && muniSel.nombre === trimmed;

  const filteredMunicipios = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return municipios;
    return municipios.filter(
      (m) => m.nombre.toLowerCase().includes(q) || m.codigo.toLowerCase().includes(q),
    );
  }, [municipios, search]);

  const showSearch = municipios.length >= SEARCH_THRESHOLD;

  return (
    <div className="dm-fondo relative overflow-hidden">
      <div className="dm-capa">
      {creando && (
        <DemoCreationProgress done={creandoDone} municipioNombre={nuevoNombre} />
      )}

      <ConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmEliminar}
        title="Eliminar demo"
        message={
          toDelete
            ? `Se borrarán todos los datos de "${toDelete.nombre}" (categorías, trámites, usuarios). Esta acción no se puede deshacer.`
            : ''
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
        loading={!!eliminando}
      />

      <header className="dm-header">
        <div className="dm-header-caja">
          <div className="dm-marca">
            <BrandMark size={32} variant="content" />
            <span className="dm-marca-nombre">{BRAND.name}</span>
          </div>
          <div className="dm-header-acciones">
            {/* El botón trae el acento del tema de la app; acá se lo pisa con el
                marino de la landing para no meter un segundo color de marca. */}
            <PresentacionLaunchButton
              label="Conocé Munify"
              style={{
                padding: '8px 15px',
                fontSize: 13,
                fontWeight: 600,
                background: 'var(--dm-accent)',
                color: 'var(--dm-on-accent)',
                boxShadow: '0 8px 20px -10px rgba(19, 40, 94, 0.55)',
              }}
            />
            <button onClick={() => navigate('/login')} className="dm-link-suave">
              <LogIn className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ya tengo cuenta</span>
              <span className="sm:hidden">Ingresar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="dm-main">
        <div className="dm-shell">
          {/* Hero partido, como el de la landing: discurso a la izquierda y el
              panel de la acción a la derecha. En mobile el orden lo invierte el
              CSS (`.dm-hero-panel { order: 1 }`) — primero el formulario. */}
          <div className="dm-hero">
            <div className="dm-hero-texto">
              <span className="dm-eyebrow">
                <span className="dm-pulso" />
                Catálogo oficial de municipios · 6 países
              </span>
              <h1 className="dm-titulo">
                Probá <em>{BRAND.name}</em> en tu municipio
              </h1>
              <p className="dm-bajada">
                Elegí tu ciudad del catálogo oficial y armamos la demo con sus calles, sus barrios y su mapa.
              </p>
              {/* Las tres garantías, ahora como las pills del hero de la landing. */}
              <div className="dm-tags">
                <span className="dm-tag dm-tag--accent"><CreditCard className="h-3.5 w-3.5" /> Sin tarjeta</span>
                <span className="dm-tag"><ShieldCheck className="h-3.5 w-3.5" /> Sin registro</span>
                <span className="dm-tag"><Sparkles className="h-3.5 w-3.5" /> Admin + vecino listos</span>
              </div>
            </div>

            <div className="dm-hero-panel">
              {/* OJO: sin overflow-hidden (recortaba el dropdown) y con z-40 para
                  que el dropdown quede SOBRE la sección de municipios de abajo */}
              <div className="dm-alta">
                {/* Barra de ventana del mockup de producto de la landing
                    (`.app-mock__bar`): dice "esto es la app", sin fingir datos. */}
                <div className="dm-alta-bar">
                  <span className="dm-alta-punto" />
                  <span className="dm-alta-punto" />
                  <span className="dm-alta-punto" />
                  <span className="dm-alta-titulo">{BRAND.name} · generador de demos</span>
                </div>
                <div className="dm-alta-cuerpo">
                <div className="dm-alta-cab">
                  <span className="dm-alta-label">Crear demo en vivo</span>
                  {/* País del catálogo. Va acá arriba y no como combo: son pocos y
                      la bandera se reconoce de un golpe. Cambiarlo limpia lo
                      tipeado, porque las sugerencias son de otro país. */}
                  <div className="dm-paises" role="group" aria-label="País del catálogo">
                    {PAISES.map((p) => {
                      const activo = pais === p.cod;
                      return (
                        <button
                          key={p.cod}
                          type="button"
                          onClick={() => {
                            if (activo) return;
                            setPais(p.cod);
                            setMuniSel(null);
                            setSugerencias([]);
                            setShowSug(false);
                          }}
                          aria-pressed={activo}
                          title={p.nombre}
                          className={`dm-pais${activo ? ' dm-pais--activo' : ''}`}
                        >
                          <BanderaPais pais={p.cod} size={13} />
                          <span className="dm-pais-cod">{p.cod}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="dm-fila">
                  <div className="dm-campo">
                    <input
                      type="text"
                      value={nuevoNombre}
                      onChange={(e) => {
                        const v = e.target.value.slice(0, MAX_NAME);
                        setNuevoNombre(v);
                        if (muniSel && muniSel.nombre !== v.trim()) setMuniSel(null);
                      }}
                      onKeyDown={(e) => {
                        if (showSug && sugerencias.length > 0) {
                          if (e.key === 'ArrowDown') { e.preventDefault(); setHlIdx((i) => (i + 1) % sugerencias.length); return; }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setHlIdx((i) => (i - 1 + sugerencias.length) % sugerencias.length); return; }
                          if (e.key === 'Enter') { e.preventDefault(); elegirMuni(sugerencias[hlIdx] || sugerencias[0]); return; }
                          if (e.key === 'Escape') { setShowSug(false); return; }
                        }
                        if (e.key === 'Enter' && !creando && nameValid) handleCrearDemo();
                      }}
                      onFocus={() => { if (sugerencias.length > 0 && !muniSel) setShowSug(true); }}
                      onBlur={() => setTimeout(() => setShowSug(false), 180)}
                      placeholder={`Ej: ${PLACEHOLDER_CITIES[placeholderIdx]}...`}
                      disabled={creando}
                      maxLength={MAX_NAME}
                      className={`dm-input${nameValid ? ' dm-input--ok' : ''}`}
                    />
                    <div className={`dm-input-marca${nameValid ? ' dm-input-marca--ok' : ''}`}>
                      {nameValid && <Check className="h-3.5 w-3.5" />}
                      <span>{nameValid && muniSel ? muniSel.provincia : `${trimmed.length}/${MAX_NAME}`}</span>
                    </div>
                    {/* Dropdown del catálogo oficial (tabla local, dataset georef).
                        Teclado: flechas navegan, Enter elige, Esc cierra. */}
                    {showSug && sugerencias.length > 0 && (
                      <div className="dm-sug">
                        <div className="dm-sug-cab">
                          <ShieldCheck className="h-3 w-3" />
                          Catálogo oficial de municipios
                          {buscando && <Loader2 className="h-3 w-3 animate-spin" style={{ marginLeft: 'auto' }} />}
                        </div>
                        {sugerencias.map((m, i) => (
                          <button
                            key={m.id}
                            onMouseDown={(e) => { e.preventDefault(); elegirMuni(m); }}
                            onMouseEnter={() => setHlIdx(i)}
                            ref={(el) => { if (i === hlIdx && el) el.scrollIntoView({ block: 'nearest' }); }}
                            className={`dm-sug-item${i === hlIdx ? ' dm-sug-item--activo' : ''}`}
                          >
                            <span className="dm-sug-pin">
                              <MapPin className="h-4 w-4" />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="dm-sug-nombre">{resaltar(m.nombre, trimmed)}</span>
                              <span className="dm-sug-prov">{m.provincia}</span>
                            </span>
                            {i === hlIdx && <ArrowRight className="h-4 w-4 shrink-0 dm-sug-flecha" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleCrearDemo}
                    disabled={creando || !nameValid}
                    className="dm-boton"
                  >
                    {creando ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Creando...
                      </>
                    ) : (
                      <>
                        Probar ahora
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </div>

                {/* La razón del autocompletado, dicha una vez y donde se decide. */}
                <p className="dm-nota">
                  <ShieldCheck className="h-4 w-4" />
                  Sólo municipios del catálogo oficial: es lo que hace que la demo salga con
                  los barrios y las calles reales de tu ciudad.
                </p>

                {/* El error vive DENTRO del panel: es donde se origina (validación
                    del alta) y donde el ojo ya está puesto. */}
                {error && (
                  <div className="dm-error">{error}</div>
                )}
                </div>
              </div>
            </div>
          </div>

          <div className="dm-listado">
            {municipios.length > 0 && (
              <div className="dm-separador"><span>o entrá a uno existente</span></div>
            )}

            {loading ? (
              <div className="dm-cargando">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
            ) : (
              <>
                {showSearch && (
                  <div className="dm-buscador-demos">
                    <Search className="h-4 w-4" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar municipio..."
                    />
                  </div>
                )}

                <div className="dm-grilla">
                  {filteredMunicipios.map((municipio) => {
                    const primaryColor = municipio.color_primario || '#0088cc';
                    const isEliminando = eliminando === municipio.codigo;
                    return (
                      <div key={municipio.id} className="dm-muni">
                        {/* La franja del color del municipio es lo ÚNICO que
                            distingue una tarjeta de otra, y es informacion: su
                            identidad. Antes habia ademas una inicial serif de 8rem
                            de marca de agua, que a esta escala competia con el
                            nombre real y no decia nada que el nombre no dijera. */}
                        <span className="dm-muni-franja" style={{ background: primaryColor }} />

                        <button
                          onClick={() => handleSelectMunicipio(municipio)}
                          disabled={isEliminando}
                          className="dm-muni-btn"
                        >
                          <h3 className="dm-muni-nombre">{municipio.nombre}</h3>
                          <p className="dm-muni-codigo">{municipio.codigo}</p>
                          <span className="dm-muni-entrar" style={{ color: primaryColor }}>
                            Entrar
                            <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setToDelete(municipio);
                          }}
                          disabled={isEliminando}
                          // SIEMPRE visible (antes solo en hover: inaccesible en mobile).
                          // Las demos se administran desde esta UI pública a propósito.
                          className="dm-muni-borrar"
                          title={`Eliminar demo ${municipio.nombre}`}
                          aria-label={`Eliminar demo ${municipio.nombre}`}
                        >
                          {isEliminando ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {showSearch && filteredMunicipios.length === 0 && (
                  <p className="dm-vacio">No hay municipios que coincidan con "{search}"</p>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="dm-pie">
        <p>
          {BRAND.name} - Conectando al gobierno con las necesidades del vecino
        </p>
      </footer>
      </div>
    </div>
  );
}

/**
 * Utilidad de persistencia para datos del municipio
 * Usa IndexedDB como almacenamiento principal (mejor persistencia en iOS)
 * con fallback a localStorage
 */

const DB_NAME = 'municipio_db';
const DB_VERSION = 1;
const STORE_NAME = 'municipio_data';

interface MunicipioData {
  id: string;
  codigo: string;
  nombre: string;
  color: string;
  logo_url?: string;
}

let db: IDBDatabase | null = null;

// Inicializar IndexedDB
function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.warn('IndexedDB no disponible, usando localStorage');
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

// Guardar en IndexedDB
async function saveToIndexedDB(data: MunicipioData): Promise<void> {
  try {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ key: 'municipio', ...data });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Fallback silencioso a localStorage
  }
}

// Leer de IndexedDB
async function loadFromIndexedDB(): Promise<MunicipioData | null> {
  try {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get('municipio');

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          const { key, ...data } = result;
          resolve(data as MunicipioData);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

// Limpiar IndexedDB
async function clearIndexedDB(): Promise<void> {
  try {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete('municipio');

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Ignorar errores
  }
}

// === API PÚBLICA ===

/**
 * Guardar datos del municipio (IndexedDB + localStorage)
 */
export async function saveMunicipio(data: MunicipioData): Promise<void> {
  // Guardar en localStorage (sincrónico, backup)
  localStorage.setItem('municipio_id', data.id);
  localStorage.setItem('municipio_codigo', data.codigo);
  localStorage.setItem('municipio_nombre', data.nombre);
  localStorage.setItem('municipio_color', data.color);
  if (data.logo_url) {
    localStorage.setItem('municipio_logo_url', data.logo_url);
  } else {
    localStorage.removeItem('municipio_logo_url');
  }

  // Guardar en IndexedDB (asíncrono, persistente)
  await saveToIndexedDB(data);
}

/**
 * Cargar datos del municipio (intenta IndexedDB primero, luego localStorage)
 */
export async function loadMunicipio(): Promise<MunicipioData | null> {
  // Intentar IndexedDB primero
  const idbData = await loadFromIndexedDB();
  if (idbData && idbData.codigo) {
    // Sincronizar con localStorage por si acaso
    localStorage.setItem('municipio_id', idbData.id);
    localStorage.setItem('municipio_codigo', idbData.codigo);
    localStorage.setItem('municipio_nombre', idbData.nombre);
    localStorage.setItem('municipio_color', idbData.color);
    if (idbData.logo_url) {
      localStorage.setItem('municipio_logo_url', idbData.logo_url);
    }
    return idbData;
  }

  // Fallback a localStorage
  const codigo = localStorage.getItem('municipio_codigo');
  if (!codigo) return null;

  const localData: MunicipioData = {
    id: localStorage.getItem('municipio_id') || '',
    codigo,
    nombre: localStorage.getItem('municipio_nombre') || '',
    color: localStorage.getItem('municipio_color') || '#3b82f6',
    logo_url: localStorage.getItem('municipio_logo_url') || undefined,
  };

  // Sincronizar a IndexedDB
  await saveToIndexedDB(localData);

  return localData;
}

/**
 * Cargar datos del municipio de forma sincrónica (solo localStorage)
 * Útil para renderizado inicial
 */
export function loadMunicipioSync(): MunicipioData | null {
  const codigo = localStorage.getItem('municipio_codigo');
  if (!codigo) return null;

  return {
    id: localStorage.getItem('municipio_id') || '',
    codigo,
    nombre: localStorage.getItem('municipio_nombre') || '',
    color: localStorage.getItem('municipio_color') || '#3b82f6',
    logo_url: localStorage.getItem('municipio_logo_url') || undefined,
  };
}

/**
 * Limpiar datos del municipio
 */
export async function clearMunicipio(): Promise<void> {
  localStorage.removeItem('municipio_id');
  localStorage.removeItem('municipio_codigo');
  localStorage.removeItem('municipio_nombre');
  localStorage.removeItem('municipio_color');
  localStorage.removeItem('municipio_logo_url');
  await clearIndexedDB();
}

/**
 * Verificar si hay municipio guardado
 */
export function hasMunicipio(): boolean {
  return !!localStorage.getItem('municipio_codigo');
}

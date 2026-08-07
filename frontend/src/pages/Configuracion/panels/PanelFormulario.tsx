import React, { useState, useEffect } from 'react';

export interface PanelFormularioProps {
  nombreMunicipio?: string;
  nombrePublico?: string;
  ruc?: string;
  departamento?: string;
  telefono?: string;
  email?: string;
  saving?: boolean;
  onSave?: (data: {
    nombreMunicipio: string;
    nombrePublico: string;
    ruc: string;
    departamento: string;
    telefono: string;
    email: string;
  }) => void;
  onDiscard?: () => void;
}

export default function PanelFormulario({
  nombreMunicipio: initNombreMuni = 'Municipalidad de Asunción',
  nombrePublico: initNombrePublico = 'Paraguay Limpio',
  ruc: initRuc = '80016909-1',
  departamento: initDept = 'Central',
  telefono: initTel = '+595 21 664 100',
  email: initEmail = 'reclamos@asuncion.gov.py',
  saving = false,
  onSave,
  onDiscard,
}: PanelFormularioProps) {
  const [nombreMuni, setNombreMuni] = useState(initNombreMuni);
  const [nombrePublico, setNombrePublico] = useState(initNombrePublico);
  const [ruc, setRuc] = useState(initRuc);
  const [dept, setDept] = useState(initDept);
  const [tel, setTel] = useState(initTel);
  const [email, setEmail] = useState(initEmail);

  useEffect(() => {
    setNombreMuni(initNombreMuni);
    setNombrePublico(initNombrePublico);
    setRuc(initRuc);
    setDept(initDept);
    setTel(initTel);
    setEmail(initEmail);
  }, [initNombreMuni, initNombrePublico, initRuc, initDept, initTel, initEmail]);

  const handleDiscard = () => {
    setNombreMuni(initNombreMuni);
    setNombrePublico(initNombrePublico);
    setRuc(initRuc);
    setDept(initDept);
    setTel(initTel);
    setEmail(initEmail);
    if (onDiscard) onDiscard();
  };

  const handleSave = () => {
    if (onSave) {
      onSave({
        nombreMunicipio: nombreMuni,
        nombrePublico,
        ruc,
        departamento: dept,
        telefono: tel,
        email,
      });
    }
  };

  return (
    <div className="entrar-panel" style={{ marginTop: '16px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '12px' }}>
      <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
        <span style={{ gridColumn: '1 / -1', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>
          IDENTIDAD
        </span>
        <label style={{ display: 'block', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--pl-text-2)', marginBottom: '6px' }}>Nombre del municipio</span>
          <input
            type="text"
            value={nombreMuni}
            onChange={(e) => setNombreMuni(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', height: '38px', padding: '0 12px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border-strong)', borderRadius: '10px', fontSize: '13px', color: 'var(--pl-text)', outline: 'none' }}
          />
        </label>
        <label style={{ display: 'block', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--pl-text-2)', marginBottom: '6px' }}>Nombre público en la app del vecino</span>
          <input
            type="text"
            value={nombrePublico}
            onChange={(e) => setNombrePublico(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', height: '38px', padding: '0 12px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border-strong)', borderRadius: '10px', fontSize: '13px', color: 'var(--pl-text)', outline: 'none' }}
          />
        </label>
        <label style={{ display: 'block', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--pl-text-2)', marginBottom: '6px' }}>RUC / CUIT</span>
          <input
            type="text"
            value={ruc}
            onChange={(e) => setRuc(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', height: '38px', padding: '0 12px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border-strong)', borderRadius: '10px', fontSize: '13px', color: 'var(--pl-text)', fontFeatureSettings: "'tnum'", outline: 'none' }}
          />
        </label>
        <label style={{ display: 'block', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--pl-text-2)', marginBottom: '6px' }}>Departamento</span>
          <input
            type="text"
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', height: '38px', padding: '0 12px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border-strong)', borderRadius: '10px', fontSize: '13px', color: 'var(--pl-text)', outline: 'none' }}
          />
        </label>

        <span style={{ gridColumn: '1 / -1', height: '1px', background: 'var(--pl-border)', margin: '4px 0' }}></span>
        
        <span style={{ gridColumn: '1 / -1', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>
          CONTACTO QUE VE EL VECINO
        </span>
        <label style={{ display: 'block', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--pl-text-2)', marginBottom: '6px' }}>Teléfono de la mesa de entrada</span>
          <input
            type="text"
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', height: '38px', padding: '0 12px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border-strong)', borderRadius: '10px', fontSize: '13px', color: 'var(--pl-text)', fontFeatureSettings: "'tnum'", outline: 'none' }}
          />
        </label>
        <label style={{ display: 'block', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--pl-text-2)', marginBottom: '6px' }}>Correo de contacto</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', height: '38px', padding: '0 12px', background: 'color-mix(in srgb, var(--pl-amber-strong) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--pl-amber-strong) 24%, transparent)', borderRadius: '10px', fontSize: '13px', color: 'var(--pl-text)', outline: 'none' }}
          />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: 'var(--pl-amber-strong)', marginTop: '6px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 12px' }}>
              <path d="M12 8v5M12 17h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            Los avisos al vecino salen desde esta casilla oficial
          </span>
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', background: 'var(--pl-surface-2)', borderTop: '1px solid var(--pl-border)', borderRadius: '0 0 12px 12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11.5px', color: 'var(--pl-text-faint)' }}>Guardado directo en la base del municipio</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button 
            type="button"
            onClick={handleDiscard}
            style={{ display: 'inline-flex', alignItems: 'center', height: '34px', padding: '0 14px', border: '1px solid var(--pl-border)', borderRadius: '10px', fontSize: '12.5px', fontWeight: 600, color: 'var(--pl-text-2)', background: 'transparent', cursor: 'pointer' }}
          >
            Descartar
          </button>
          <button 
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{ display: 'inline-flex', alignItems: 'center', height: '34px', padding: '0 15px', borderRadius: '10px', background: 'var(--pl-green)', fontSize: '12.5px', fontWeight: 600, color: 'var(--pl-surface)', border: 'none', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </span>
      </div>
    </div>
  );
}

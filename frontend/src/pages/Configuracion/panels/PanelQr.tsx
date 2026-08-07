import React from 'react';

export default function PanelQr() {
  return (
    <div className="entrar-panel" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: '12px', marginTop: '16px', alignItems: 'start' }}>
      <div style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '12px', padding: '18px 20px' }}>
        <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>QUÉ IMPRIME EL CARTEL</span>
        <p style={{ margin: '10px 0 0', fontSize: '13.5px', lineHeight: 1.55, color: 'var(--pl-text-2)', textWrap: 'pretty', maxWidth: '64ch' }}>
          El vecino escanea y entra directo a cargar un reclamo con la ubicación del cartel ya puesta. Sirve para plazas, paradas y edificios municipales.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
          <label style={{ display: 'block', maxWidth: '420px' }}>
            <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--pl-text-2)', marginBottom: '6px' }}>Texto del cartel</span>
            <span style={{ display: 'flex', alignItems: 'center', height: '38px', padding: '0 12px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border-strong)', borderRadius: '10px' }}>
              <span style={{ fontSize: '13px', color: 'var(--pl-text)' }}>¿Ves algo roto? Avisanos acá</span>
            </span>
          </label>
          <label style={{ display: 'block', maxWidth: '420px' }}>
            <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--pl-text-2)', marginBottom: '6px' }}>Punto de interés asociado</span>
            <span style={{ display: 'flex', alignItems: 'center', height: '38px', padding: '0 12px', background: 'var(--pl-surface)', border: '1px solid var(--pl-border-strong)', borderRadius: '10px' }}>
              <span style={{ fontSize: '13px', color: 'var(--pl-text)' }}>Plaza Uruguaya</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--pl-text-muted)" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: 'auto', flex: '0 0 14px' }}>
                <path d="m7 9 5 5 5-5" />
              </svg>
            </span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '18px', flexWrap: 'wrap' }}>
          <span 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '36px', padding: '0 15px', borderRadius: '11px', background: 'var(--pl-green)', fontSize: '13px', fontWeight: 600, color: 'var(--pl-surface)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-green-600)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--pl-green)'; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" />
            </svg>
            Descargar para imprimir
          </span>
          <span 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '36px', padding: '0 15px', border: '1px solid var(--pl-border)', borderRadius: '11px', background: 'var(--pl-surface)', fontSize: '13px', fontWeight: 600, color: 'var(--pl-text-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pl-surface-2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--pl-surface)'; }}
          >
            Generar de nuevo
          </span>
        </div>
      </div>
      <div style={{ background: 'var(--pl-surface)', border: '1px solid var(--pl-border)', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <span style={{ alignSelf: 'flex-start', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>VISTA PREVIA</span>
        <span style={{ width: '168px', height: '168px', borderRadius: '12px', overflow: 'hidden', background: 'var(--pl-surface-3)', display: 'grid', placeItems: 'center' }}>
          <span style={{ fontSize: '10px', color: 'var(--pl-text-faint)' }}>QR</span>
        </span>
        <span style={{ fontSize: '11.5px', color: 'var(--pl-text-faint)', textAlign: 'center', lineHeight: 1.45 }}>Generado el 28 de julio · 14 carteles activos</span>
      </div>
    </div>
  );
}

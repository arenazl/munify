import React from 'react';

export default function PanelQr() {
  return (
    <div className="entrar-panel" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: '12px', marginTop: '16px', alignItems: 'start' }}>
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.07)', borderRadius: '12px', padding: '18px 20px' }}>
        <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0' }}>QUÉ IMPRIME EL CARTEL</span>
        <p style={{ margin: '10px 0 0', fontSize: '13.5px', lineHeight: 1.55, color: '#3D4945', textWrap: 'pretty', maxWidth: '64ch' }}>
          El vecino escanea y entra directo a cargar un reclamo con la ubicación del cartel ya puesta. Sirve para plazas, paradas y edificios municipales.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
          <label style={{ display: 'block', maxWidth: '420px' }}>
            <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#3D4945', marginBottom: '6px' }}>Texto del cartel</span>
            <span style={{ display: 'flex', alignItems: 'center', height: '38px', padding: '0 12px', background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.14)', borderRadius: '10px' }}>
              <span style={{ fontSize: '13px', color: '#0D1412' }}>¿Ves algo roto? Avisanos acá</span>
            </span>
          </label>
          <label style={{ display: 'block', maxWidth: '420px' }}>
            <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#3D4945', marginBottom: '6px' }}>Punto de interés asociado</span>
            <span style={{ display: 'flex', alignItems: 'center', height: '38px', padding: '0 12px', background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.14)', borderRadius: '10px' }}>
              <span style={{ fontSize: '13px', color: '#0D1412' }}>Plaza Uruguaya</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7A8783" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: 'auto', flex: '0 0 14px' }}>
                <path d="m7 9 5 5 5-5" />
              </svg>
            </span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '18px', flexWrap: 'wrap' }}>
          <span 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '36px', padding: '0 15px', borderRadius: '11px', background: '#00B37E', fontSize: '13px', fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', whiteSpace: 'nowrap' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#008F63'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#00B37E'; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" />
            </svg>
            Descargar para imprimir
          </span>
          <span 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '36px', padding: '0 15px', border: '1px solid rgba(13,20,18,0.12)', borderRadius: '11px', background: '#FFFFFF', fontSize: '13px', fontWeight: 600, color: '#3D4945', cursor: 'pointer', whiteSpace: 'nowrap' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F4F7F6'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}
          >
            Generar de nuevo
          </span>
        </div>
      </div>
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(13,20,18,0.07)', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <span style={{ alignSelf: 'flex-start', fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: '#98A3A0' }}>VISTA PREVIA</span>
        <span style={{ width: '168px', height: '168px', borderRadius: '12px', overflow: 'hidden', background: '#F3F7F5', display: 'grid', placeItems: 'center' }}>
          <span style={{ fontSize: '10px', color: '#98A3A0' }}>QR</span>
        </span>
        <span style={{ fontSize: '11.5px', color: '#98A3A0', textAlign: 'center', lineHeight: 1.45 }}>Generado el 28 de julio · 14 carteles activos</span>
      </div>
    </div>
  );
}

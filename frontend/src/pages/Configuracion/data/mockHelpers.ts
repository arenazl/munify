import React from 'react';

export function patchMockData(mockData: any) {
  mockData.cel = function(texto: string, opts: any = {}) {
    if (opts.chip) {
      return { esChip: true, texto, chipBg: opts.chip[0], chipCol: opts.chip[1], align: opts.align || 'left' };
    }
    return {
      texto, 
      esTexto: true,
      esChip: false,
      hayPunto: !!opts.punto,
      punto: opts.punto,
      fuente: opts.sora ? 'Sora, sans-serif' : 'Inter, sans-serif',
      tam: opts.tam || '13px',
      peso: opts.peso || 400,
      color: opts.color || '#0D1412',
      haySub: !!opts.sub,
      sub: opts.sub,
      subCol: opts.subFuerte ? '#C93A3E' : '#98A3A0',
      align: opts.align || 'left',
      just: opts.align === 'right' ? 'flex-end' : 'flex-start'
    };
  };

  mockData.miles = function(n: number | string) {
    if (!n) return '0';
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  mockData.guaranies = function(n: number) {
    if (n === 0) return 'Gratis';
    return '$ ' + this.miles(n);
  };

  mockData.prerequisitos = function() {
    return {};
  };

  mockData.dependencias = function() {
    return {
      'Secretaría de Servicios Públicos': { label: 'Secretaría de Servicios Públicos', color: '#00794F' },
      'Secretaría de Obras Públicas': { label: 'Secretaría de Obras Públicas', color: '#B4560F' },
      'Tránsito': { label: 'Dirección de Tránsito', color: '#C93A3E' },
      'Dirección de Zoonosis': { label: 'Zoonosis', color: '#6D3FD4' },
      'Secretaría de Seguridad': { label: 'Secretaría de Seguridad', color: '#1D6FD1' },
    };
  };

  mockData.reparto = function() {
    return {};
  };

  mockData.catalogoReclamos = function() {
    return this.datos()['cat-reclamo'].filas;
  };

  mockData.datosDe = function(id: string) {
    const saved = this.state.hijo;
    this.state.hijo = id;
    const d = this.datos();
    this.state.hijo = saved;
    return d;
  };

  mockData.descripcion = function(id: string) {
    return "";
  };

  // Polyfill React element creation if it returns it in veredicto
  mockData.setState = function(updater: any) {
    if (typeof updater === 'function') {
      this.state = Object.assign({}, this.state, updater(this.state));
    } else {
      this.state = Object.assign({}, this.state, updater);
    }
  };
}

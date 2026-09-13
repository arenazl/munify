/** Formato de plata para Obras: millones con una decimal, o pesos enteros. */
export const fmtMoney = (v: string | number | null | undefined): string => {
  const n = Number(v ?? 0);
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace('.', ',')} M`;
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
};

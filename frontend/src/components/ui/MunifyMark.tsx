// Logo oficial de Munify (mark real, paths del brand).
// Fuente única: usarlo SIEMPRE que haya que mostrar la marca — nunca un
// ícono genérico de lucide. `mono` fuerza monocromo (ej. sobre foto);
// sin `mono` renderiza blanco + azure oficial (#4070C0).
export function MunifyMark({ size = 40, mono }: { size?: number; mono?: string }) {
  const white = mono || '#FFFFFF';
  const azure = mono || '#4070C0';
  return (
    <svg width={size} height={size * (1426 / 1271.65)} viewBox="0 0 1271.65 1426" style={{ display: 'block', overflow: 'visible' }}>
      <polygon fill={white} points="1271.65 371.24 1271.65 1069.5 635.82 1426 0 1069.5 0 356.5 635.82 0 1128.59 276.29 1000.48 381.26 636.9 177.4 160.18 444.69 160.18 979.27 636.9 1246.56 1113.62 979.27 1113.62 544.87 1271.65 371.24" />
      <polygon fill={azure} points="1446.79 79.97 1225.77 330.78 1113.62 458.05 644.86 989.99 448.06 781.76 448.06 568.98 637.63 759.38 1052.94 410.67 1179.19 304.66 1446.79 79.97" />
      <polygon fill={white} points="404.64 517.83 404.64 1037.89 253.8 953.49 253.8 500.38 332.09 454.86 404.64 517.83" />
      <polygon fill={white} points="1020.14 650.78 1020.14 954.08 867.22 1039.31 868.09 818.95 1020.14 650.78" />
    </svg>
  );
}

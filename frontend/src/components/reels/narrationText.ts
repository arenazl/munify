// Texto de narración por reel, segmentado en frases. El tuneo en vivo arma el
// audio con estas frases + la pausa elegida entre cada una (servicio TTS).
// Sanitizado para TTS: Munify→Munifai, números clave deletreados.
export const NARRATION: Record<string, string[]> = {
  tour: [
    '¿Tu municipio todavía maneja todo en papel y planillas?',
    'Con Munifai ves toda tu gestión en vivo, en una sola pantalla.',
    'El vecino reclama desde el celular, y vos lo resolvés.',
    'Mirás en el mapa dónde se concentran los problemas.',
    'Trámites online, con identidad validada.',
    'Y la plata del municipio, por fin ordenada.',
    'Munifai. Tu municipio, al día.',
  ],
  vecino: [
    '¿Un bache, una luz quemada, basura sin recoger?',
    'Sacás la foto desde el celular, en treinta segundos.',
    'La inteligencia artificial lo clasifica y lo manda al área correcta.',
    'Y lo seguís paso a paso, como un envío.',
    'Encima, sumás puntos por mejorar tu barrio.',
    'Munifai. Tu ciudad te escucha.',
  ],
  intendente: [
    '¿Cómo viene tu gestión? En números, no en sensaciones.',
    'Mil doscientos ochenta y cuatro reclamos gestionados este año. Sin un papel.',
    'Todo en una sola pantalla, que se actualiza sola.',
    'Ochenta y siete por ciento resueltos, en tres días promedio.',
    'Y mandás las cuadrillas donde más se necesitan.',
    'Munifai. Goberná con datos.',
  ],
  tesoreria: [
    '¿La plata del municipio todavía vive en planillas de Excel?',
    'Cargás cada pago, autorizado y trazado.',
    'Ves el saldo de cada caja al instante.',
    'Importás el extracto y el banco se cuadra solo.',
    'Y liquidás sueldos sin dolores de cabeza.',
    'Munifai. Adiós, Excel.',
  ],
  ia: [
    '¿Y si tu municipio atendiera las veinticuatro horas?',
    'Por WhatsApp, por donde tus vecinos ya escriben.',
    'La inteligencia artificial crea el reclamo y lo deriva al área correcta.',
    'Da turnos e inicia trámites, sola.',
    'Cero esperas en la fila. El municipio nunca cierra.',
    'Munifai. Atención sin esperas.',
  ],
};

// URL del microservicio TTS reusable (Cloud Run, proyecto munify-api).
export const TTS_SERVICE_URL = 'https://tts-service-1060106389361.southamerica-east1.run.app';

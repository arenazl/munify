// Narradores de ElevenLabs para los reels (voces en español, agrupadas por
// región). Las inglesas/portuguesas se omiten: narran mal en español.
// Narración por reel en /public/reels-audio/narration/<reel>/<slug>.mp3
// (generada offline con la key — la key NUNCA vive en el front).
export type Region = 'ar' | 'lat';
export interface Narrator {
  slug: string;
  name: string;
  region: Region;
  desc: string;
  voiceId: string;
}

export const REGION_LABEL: Record<Region, string> = {
  ar: 'Argentina (rioplatense)',
  lat: 'Latinoamérica (neutro)',
};

export const NARRATORS: Narrator[] = [
  // --- Argentina (rioplatense) ---
  { slug: 'lucia', name: 'Lucía', region: 'ar', desc: 'Cálida y expresiva. Ideal para publicidad.', voiceId: 'yA5jrK1S9cpCAojBYyMu' },
  { slug: 'tomas', name: 'Tomás', region: 'ar', desc: 'Joven y seguro — la mejor del Río de la Plata.', voiceId: 'QK4xDwo9ESPHA4JNUpX3' },
  { slug: 'maxi', name: 'Maxi', region: 'ar', desc: 'Adulto, ideal narración/publicidad/podcast.', voiceId: 'rooCDyI2p1wGjgC5O5lH' },
  { slug: 'paola', name: 'Paola', region: 'ar', desc: 'Rioplatense profesional, neutral y clara.', voiceId: 'PoLFkTquRWtbexdwW3Xa' },
  { slug: 'martin', name: 'Martín', region: 'ar', desc: 'Joven y profesional. Ventas y atención.', voiceId: '9FG0AH71kXEuvM9IJg7u' },
  { slug: 'melanie', name: 'Melanie', region: 'ar', desc: 'Cálida, clara y profesional.', voiceId: 'bN1bDXgDIGX5lw0rtY2B' },
  { slug: 'mariana', name: 'Mariana', region: 'ar', desc: 'Profunda, íntima y asertiva.', voiceId: '9rvdnhrYoXoUt4igKpBw' },
  { slug: 'cocinera', name: 'Cocinera', region: 'ar', desc: 'Joven y cercana, tono redes sociales.', voiceId: '93IsRN8Mhs3FMPjO05OH' },
  // --- Latinoamérica (neutro) ---
  { slug: 'sandra', name: 'Sandra', region: 'lat', desc: 'Dinámica y enérgica, tono marketing.', voiceId: 'rEVYTKPqwSMhytFPayIb' },
  { slug: 'luis', name: 'Luis Casiano', region: 'lat', desc: 'Narrador neutral latinoamericano.', voiceId: 'ziigB5Dny14v5lDIHo0x' },
  { slug: 'mauricio', name: 'Mauricio', region: 'lat', desc: 'Conversacional, calmo y neutral.', voiceId: '94zOad0g7T7K4oa7zhDq' },
  { slug: 'karolina', name: 'Karolina', region: 'lat', desc: 'Cálida, profunda y resonante.', voiceId: 'Wuv1s5YTNCjL9mFJTqo4' },
  { slug: 'amelia', name: 'Amelia', region: 'lat', desc: 'Joven y neutral, ideal para narraciones.', voiceId: 'uDhfdG2VwEjWZ4JYzggn' },
  { slug: 'douglas', name: 'Douglas', region: 'lat', desc: 'Joven, enérgico y profesional.', voiceId: 'Hpwh61tU4uwqF8q5Ln4s' },
  { slug: 'elder', name: 'Elder', region: 'lat', desc: 'Mayor, firme y profundo, con autoridad.', voiceId: 'gSYqSbtMajxq5LUT0bNl' },
  { slug: 'daniela', name: 'Daniela Valentina', region: 'lat', desc: 'Joven y vibrante, muy enérgica.', voiceId: 'fqf2iY1NwgXWQDrrPZjv' },
  { slug: 'caty', name: 'Caty', region: 'lat', desc: 'Profesional y didáctica, calmada.', voiceId: 'BKwzeEHPemNEGIPoJEI8' },
  { slug: 'lizy', name: 'Lizy', region: 'lat', desc: 'Cálida y apasionada, storytelling.', voiceId: 'g10k86KeEUyBqW9lcKYg' },
];

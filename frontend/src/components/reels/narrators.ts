// Narradores de ElevenLabs curados para los reels (voces en español:
// argentinas rioplatenses + latinas neutras). El sample de cada uno está en
// /public/reels-audio/narrators/<slug>.mp3 (generado offline con la key —
// la key NUNCA vive en el front). voiceId queda para generar la locución final.
export interface Narrator {
  slug: string;
  name: string;
  accent: 'Argentina' | 'Latino';
  desc: string;
  voiceId: string;
}

export const NARRATORS: Narrator[] = [
  { slug: 'lucia', name: 'Lucía', accent: 'Argentina', desc: 'Cálida y expresiva, ritmo rioplatense. Ideal para publicidad.', voiceId: 'yA5jrK1S9cpCAojBYyMu' },
  { slug: 'tomas', name: 'Tomás', accent: 'Argentina', desc: 'Joven y seguro — la mejor voz del Río de la Plata.', voiceId: 'QK4xDwo9ESPHA4JNUpX3' },
  { slug: 'maxi', name: 'Maxi', accent: 'Argentina', desc: 'Adulto, ideal para narración, publicidad y podcasts.', voiceId: 'rooCDyI2p1wGjgC5O5lH' },
  { slug: 'paola', name: 'Paola', accent: 'Argentina', desc: 'Rioplatense profesional, neutral y clara.', voiceId: 'PoLFkTquRWtbexdwW3Xa' },
  { slug: 'martin', name: 'Martín', accent: 'Argentina', desc: 'Joven y profesional (Córdoba). Ventas y atención.', voiceId: '9FG0AH71kXEuvM9IJg7u' },
  { slug: 'melanie', name: 'Melanie', accent: 'Argentina', desc: 'Cálida, clara y profesional.', voiceId: 'bN1bDXgDIGX5lw0rtY2B' },
  { slug: 'mariana', name: 'Mariana', accent: 'Argentina', desc: 'Profunda, íntima y asertiva.', voiceId: '9rvdnhrYoXoUt4igKpBw' },
  { slug: 'sandra', name: 'Sandra', accent: 'Latino', desc: 'Dinámica y enérgica, tono marketing.', voiceId: 'rEVYTKPqwSMhytFPayIb' },
  { slug: 'luis', name: 'Luis Casiano', accent: 'Latino', desc: 'Narrador neutral latinoamericano.', voiceId: 'ziigB5Dny14v5lDIHo0x' },
  { slug: 'mauricio', name: 'Mauricio', accent: 'Latino', desc: 'Conversacional, calmo y neutral.', voiceId: '94zOad0g7T7K4oa7zhDq' },
  { slug: 'karolina', name: 'Karolina', accent: 'Latino', desc: 'Cálida, profunda y resonante.', voiceId: 'Wuv1s5YTNCjL9mFJTqo4' },
  { slug: 'amelia', name: 'Amelia', accent: 'Latino', desc: 'Joven y neutral, ideal para narraciones.', voiceId: 'uDhfdG2VwEjWZ4JYzggn' },
  { slug: 'douglas', name: 'Douglas', accent: 'Latino', desc: 'Joven, enérgico y profesional.', voiceId: 'Hpwh61tU4uwqF8q5Ln4s' },
  { slug: 'elder', name: 'Elder', accent: 'Latino', desc: 'Mayor, firme y profundo, con autoridad.', voiceId: 'gSYqSbtMajxq5LUT0bNl' },
];

import { Smartphone, MessageCircle, Building2, Globe, type LucideIcon } from 'lucide-react';
import type { CanalIngreso } from '../../types';

// Single Source of Truth del canal de ingreso (omnicanalidad).
// Si mañana se agrega un canal (email, redes), se toca SOLO este archivo.

export const canalLabels: Record<CanalIngreso, string> = {
  app: 'App',
  ventanilla_asistida: 'Ventanilla',
  whatsapp: 'WhatsApp',
  web_publica: 'Web',
};

export const canalIcons: Record<CanalIngreso, LucideIcon> = {
  app: Smartphone,
  ventanilla_asistida: Building2,
  whatsapp: MessageCircle,
  web_publica: Globe,
};

// Colores semánticos fijos del canal (verde WhatsApp es marca, no theme)
export const canalColors: Record<CanalIngreso, string> = {
  app: '#3b82f6',
  ventanilla_asistida: '#8b5cf6',
  whatsapp: '#22c55e',
  web_publica: '#06b6d4',
};

export const canalLabel = (canal?: string | null): string | null =>
  canal ? canalLabels[canal as CanalIngreso] ?? canal : null;

export const canalIcon = (canal?: string | null): LucideIcon | null =>
  canal ? canalIcons[canal as CanalIngreso] ?? null : null;

export const canalColor = (canal?: string | null): string =>
  (canal && canalColors[canal as CanalIngreso]) || '#6b7280';

export const CANAL_OPTIONS: { value: CanalIngreso; label: string }[] = (
  Object.keys(canalLabels) as CanalIngreso[]
).map((c) => ({ value: c, label: canalLabels[c] }));

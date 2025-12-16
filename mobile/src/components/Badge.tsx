import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { borderRadius, spacing } from '../theme';
import { EstadoReclamo, estadoColors, estadoLabels } from '../types';

interface BadgeProps {
  estado: EstadoReclamo;
  size?: 'small' | 'medium';
}

export function EstadoBadge({ estado, size = 'medium' }: BadgeProps) {
  const { theme } = useTheme();
  const color = estadoColors[estado];
  const label = estadoLabels[estado];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: `${color}20`,
          paddingVertical: size === 'small' ? 2 : 4,
          paddingHorizontal: size === 'small' ? 8 : 12,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text
        style={[
          styles.text,
          {
            color: color,
            fontSize: size === 'small' ? 11 : 13,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

interface PrioridadBadgeProps {
  prioridad: number;
}

export function PrioridadBadge({ prioridad }: PrioridadBadgeProps) {
  const { theme } = useTheme();

  const getColor = () => {
    if (prioridad >= 4) return theme.error;
    if (prioridad >= 3) return theme.warning;
    return theme.info;
  };

  const getLabel = () => {
    if (prioridad >= 4) return 'Alta';
    if (prioridad >= 3) return 'Media';
    return 'Baja';
  };

  const color = getColor();

  return (
    <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
      <Text style={[styles.text, { color }]}>{getLabel()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.full,
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontWeight: '600',
  },
});

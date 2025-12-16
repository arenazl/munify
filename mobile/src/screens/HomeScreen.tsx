import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { EstadoBadge } from '../components/Badge';
import { spacing, borderRadius } from '../theme';
import { RootStackParamList } from '../navigation';
import { dashboardApi, reclamosApi } from '../services/api';
import { Reclamo, estadoColors } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<NavigationProp>();

  const [stats, setStats] = useState<any>(null);
  const [recientes, setRecientes] = useState<Reclamo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [statsData, reclamosData] = await Promise.all([
        dashboardApi.getMisStats(),
        reclamosApi.getMisReclamos(),
      ]);
      setStats(statsData);
      setRecientes(reclamosData.slice(0, 3));
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 19) return 'Buenas tardes';
    return 'Buenas noches';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>
              {getGreeting()}
            </Text>
            <Text style={[styles.name, { color: theme.text }]}>
              {user?.nombre} {user?.apellido}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.notificationBtn, { backgroundColor: theme.card }]}
          >
            <Ionicons name="notifications-outline" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>

        {/* Quick Action */}
        <Card
          variant="elevated"
          style={[styles.quickAction, { backgroundColor: theme.primary }]}
          onPress={() => navigation.navigate('NuevoReclamo')}
        >
          <View style={styles.quickActionContent}>
            <View style={styles.quickActionIcon}>
              <Ionicons name="add-circle" size={48} color="#fff" />
            </View>
            <View style={styles.quickActionText}>
              <Text style={styles.quickActionTitle}>Nuevo Reclamo</Text>
              <Text style={styles.quickActionSubtitle}>
                Reportá un problema en tu barrio
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#fff" />
          </View>
        </Card>

        {/* Stats */}
        {stats && (
          <View style={styles.statsContainer}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Tus Estadísticas
            </Text>
            <View style={styles.statsGrid}>
              <Card style={styles.statCard}>
                <View
                  style={[styles.statIcon, { backgroundColor: `${theme.info}20` }]}
                >
                  <Ionicons name="document-text" size={24} color={theme.info} />
                </View>
                <Text style={[styles.statValue, { color: theme.text }]}>
                  {stats.total || 0}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                  Total
                </Text>
              </Card>

              <Card style={styles.statCard}>
                <View
                  style={[styles.statIcon, { backgroundColor: `${theme.warning}20` }]}
                >
                  <Ionicons name="time" size={24} color={theme.warning} />
                </View>
                <Text style={[styles.statValue, { color: theme.text }]}>
                  {stats.en_proceso || 0}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                  En Proceso
                </Text>
              </Card>

              <Card style={styles.statCard}>
                <View
                  style={[styles.statIcon, { backgroundColor: `${theme.success}20` }]}
                >
                  <Ionicons name="checkmark-circle" size={24} color={theme.success} />
                </View>
                <Text style={[styles.statValue, { color: theme.text }]}>
                  {stats.resueltos || 0}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                  Resueltos
                </Text>
              </Card>
            </View>
          </View>
        )}

        {/* Reclamos Recientes */}
        <View style={styles.recentContainer}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Reclamos Recientes
            </Text>
            <TouchableOpacity>
              <Text style={[styles.seeAll, { color: theme.primary }]}>Ver todos</Text>
            </TouchableOpacity>
          </View>

          {recientes.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons
                name="document-text-outline"
                size={48}
                color={theme.textSecondary}
              />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No tenés reclamos todavía
              </Text>
              <Button
                title="Crear tu primer reclamo"
                onPress={() => navigation.navigate('NuevoReclamo')}
                variant="outline"
                size="small"
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : (
            recientes.map((reclamo) => (
              <Card
                key={reclamo.id}
                style={styles.reclamoCard}
                onPress={() => navigation.navigate('ReclamoDetalle', { id: reclamo.id })}
              >
                <View style={styles.reclamoHeader}>
                  <View
                    style={[
                      styles.categoriaIcon,
                      { backgroundColor: `${reclamo.categoria.color || theme.primary}20` },
                    ]}
                  >
                    <Ionicons
                      name={(reclamo.categoria.icono as any) || 'help-circle'}
                      size={20}
                      color={reclamo.categoria.color || theme.primary}
                    />
                  </View>
                  <View style={styles.reclamoInfo}>
                    <Text
                      style={[styles.reclamoTitulo, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {reclamo.titulo}
                    </Text>
                    <Text
                      style={[styles.reclamoDireccion, { color: theme.textSecondary }]}
                      numberOfLines={1}
                    >
                      {reclamo.direccion}
                    </Text>
                  </View>
                  <EstadoBadge estado={reclamo.estado} size="small" />
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={() => navigation.navigate('NuevoReclamo')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  greeting: {
    fontSize: 14,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAction: {
    marginBottom: spacing.lg,
  },
  quickActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickActionIcon: {
    marginRight: spacing.md,
  },
  quickActionText: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  quickActionSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  statsContainer: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
  },
  recentContainer: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCard: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: 16,
    marginTop: spacing.md,
  },
  reclamoCard: {
    marginBottom: spacing.sm,
  },
  reclamoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoriaIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  reclamoInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  reclamoTitulo: {
    fontSize: 15,
    fontWeight: '600',
  },
  reclamoDireccion: {
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});

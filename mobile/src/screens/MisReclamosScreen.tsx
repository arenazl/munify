import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';
import { Card } from '../components/Card';
import { EstadoBadge, PrioridadBadge } from '../components/Badge';
import { spacing, borderRadius } from '../theme';
import { RootStackParamList } from '../navigation';
import { reclamosApi } from '../services/api';
import { Reclamo, EstadoReclamo } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const FILTROS: { label: string; value: EstadoReclamo | 'todos' }[] = [
  { label: 'Todos', value: 'todos' },
  { label: 'Nuevos', value: 'nuevo' },
  { label: 'En Proceso', value: 'en_proceso' },
  { label: 'Resueltos', value: 'resuelto' },
];

export default function MisReclamosScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [filteredReclamos, setFilteredReclamos] = useState<Reclamo[]>([]);
  const [filtro, setFiltro] = useState<EstadoReclamo | 'todos'>('todos');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadReclamos = useCallback(async () => {
    try {
      const data = await reclamosApi.getMisReclamos();
      setReclamos(data);
    } catch (error) {
      console.error('Error loading reclamos:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReclamos();
  }, [loadReclamos]);

  useEffect(() => {
    if (filtro === 'todos') {
      setFilteredReclamos(reclamos);
    } else {
      setFilteredReclamos(reclamos.filter((r) => r.estado === filtro));
    }
  }, [reclamos, filtro]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReclamos();
    setRefreshing(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderItem = ({ item }: { item: Reclamo }) => (
    <Card
      style={styles.reclamoCard}
      onPress={() => navigation.navigate('ReclamoDetalle', { id: item.id })}
    >
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.categoriaIcon,
            { backgroundColor: `${item.categoria.color || theme.primary}20` },
          ]}
        >
          <Ionicons
            name={(item.categoria.icono as any) || 'help-circle'}
            size={24}
            color={item.categoria.color || theme.primary}
          />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
            {item.titulo}
          </Text>
          <Text style={[styles.cardCategoria, { color: theme.textSecondary }]}>
            {item.categoria.nombre}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Ionicons name="location-outline" size={16} color={theme.textSecondary} />
          <Text
            style={[styles.cardText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {item.direccion}
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>
            {formatDate(item.created_at)}
          </Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <EstadoBadge estado={item.estado} />
        <PrioridadBadge prioridad={item.prioridad} />
      </View>
    </Card>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons
        name="document-text-outline"
        size={64}
        color={theme.textSecondary}
      />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        Sin reclamos
      </Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        {filtro === 'todos'
          ? 'No tenés reclamos registrados'
          : `No tenés reclamos ${filtro === 'nuevo' ? 'nuevos' : filtro === 'en_proceso' ? 'en proceso' : 'resueltos'}`}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Mis Reclamos</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={() => navigation.navigate('NuevoReclamo')}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filtros */}
      <View style={styles.filtrosContainer}>
        <FlatList
          horizontal
          data={FILTROS}
          keyExtractor={(item) => item.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtrosList}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setFiltro(item.value)}
              style={[
                styles.filtroChip,
                {
                  backgroundColor:
                    filtro === item.value ? theme.primary : theme.card,
                  borderColor: filtro === item.value ? theme.primary : theme.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filtroText,
                  {
                    color: filtro === item.value ? '#fff' : theme.text,
                  },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Lista */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredReclamos}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={renderEmpty}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtrosContainer: {
    marginBottom: spacing.md,
  },
  filtrosList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  filtroChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  filtroText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reclamoCard: {
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  categoriaIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  cardCategoria: {
    fontSize: 14,
  },
  cardBody: {
    marginBottom: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  cardText: {
    fontSize: 14,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: 16,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});

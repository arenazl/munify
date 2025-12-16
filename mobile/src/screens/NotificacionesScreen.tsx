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
import { spacing, borderRadius } from '../theme';
import { RootStackParamList } from '../navigation';
import { notificacionesApi } from '../services/api';
import { Notificacion } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function NotificacionesScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadNotificaciones = useCallback(async () => {
    try {
      const data = await notificacionesApi.getAll();
      setNotificaciones(data);
    } catch (error) {
      console.error('Error loading notificaciones:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotificaciones();
  }, [loadNotificaciones]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotificaciones();
    setRefreshing(false);
  };

  const handlePress = async (notif: Notificacion) => {
    if (!notif.leida) {
      await notificacionesApi.marcarLeida(notif.id);
      setNotificaciones((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, leida: true } : n))
      );
    }

    if (notif.reclamo_id) {
      navigation.navigate('ReclamoDetalle', { id: notif.reclamo_id });
    }
  };

  const handleMarcarTodas = async () => {
    await notificacionesApi.marcarTodasLeidas();
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'Hace un momento';
    if (hours < 24) return `Hace ${hours}h`;
    if (days < 7) return `Hace ${days}d`;
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  };

  const getIconName = (tipo: string): keyof typeof Ionicons.glyphMap => {
    switch (tipo) {
      case 'nuevo_reclamo':
        return 'add-circle';
      case 'estado_actualizado':
        return 'refresh-circle';
      case 'asignado':
        return 'person-add';
      case 'resuelto':
        return 'checkmark-circle';
      case 'comentario':
        return 'chatbubble';
      default:
        return 'notifications';
    }
  };

  const getIconColor = (tipo: string) => {
    switch (tipo) {
      case 'nuevo_reclamo':
        return theme.info;
      case 'estado_actualizado':
        return theme.warning;
      case 'asignado':
        return theme.primary;
      case 'resuelto':
        return theme.success;
      case 'comentario':
        return theme.textSecondary;
      default:
        return theme.primary;
    }
  };

  const renderItem = ({ item }: { item: Notificacion }) => (
    <TouchableOpacity
      onPress={() => handlePress(item)}
      activeOpacity={0.7}
    >
      <Card
        style={[
          styles.notifCard,
          !item.leida && { borderLeftWidth: 3, borderLeftColor: theme.primary },
        ]}
      >
        <View style={styles.notifContent}>
          <View
            style={[
              styles.notifIcon,
              { backgroundColor: `${getIconColor(item.tipo)}20` },
            ]}
          >
            <Ionicons
              name={getIconName(item.tipo)}
              size={24}
              color={getIconColor(item.tipo)}
            />
          </View>

          <View style={styles.notifText}>
            <Text
              style={[
                styles.notifTitulo,
                { color: theme.text, fontWeight: item.leida ? '400' : '600' },
              ]}
            >
              {item.titulo}
            </Text>
            <Text
              style={[styles.notifMensaje, { color: theme.textSecondary }]}
              numberOfLines={2}
            >
              {item.mensaje}
            </Text>
            <Text style={[styles.notifFecha, { color: theme.textSecondary }]}>
              {formatDate(item.created_at)}
            </Text>
          </View>

          {!item.leida && (
            <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
          )}
        </View>
      </Card>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons
        name="notifications-off-outline"
        size={64}
        color={theme.textSecondary}
      />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        Sin notificaciones
      </Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Cuando haya novedades sobre tus reclamos, aparecerán acá
      </Text>
    </View>
  );

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Notificaciones</Text>
        {noLeidas > 0 && (
          <TouchableOpacity onPress={handleMarcarTodas}>
            <Text style={[styles.marcarTodas, { color: theme.primary }]}>
              Marcar todas
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Badge de no leídas */}
      {noLeidas > 0 && (
        <View style={[styles.badgeContainer, { backgroundColor: `${theme.primary}15` }]}>
          <Ionicons name="mail-unread" size={18} color={theme.primary} />
          <Text style={[styles.badgeText, { color: theme.primary }]}>
            {noLeidas} sin leer
          </Text>
        </View>
      )}

      {/* Lista */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={notificaciones}
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
  marcarTodas: {
    fontSize: 14,
    fontWeight: '600',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  badgeText: {
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
  notifCard: {
    marginBottom: spacing.sm,
  },
  notifContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  notifIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  notifText: {
    flex: 1,
  },
  notifTitulo: {
    fontSize: 15,
    marginBottom: 2,
  },
  notifMensaje: {
    fontSize: 14,
    lineHeight: 20,
  },
  notifFecha: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: spacing.sm,
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
    paddingHorizontal: spacing.xl,
  },
});

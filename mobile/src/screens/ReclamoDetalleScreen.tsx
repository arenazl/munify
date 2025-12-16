import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';
import { Card } from '../components/Card';
import { EstadoBadge, PrioridadBadge } from '../components/Badge';
import { spacing, borderRadius } from '../theme';
import { RootStackParamList } from '../navigation';
import { reclamosApi } from '../services/api';
import { Reclamo, HistorialReclamo } from '../types';

type RouteProps = RouteProp<RootStackParamList, 'ReclamoDetalle'>;

export default function ReclamoDetalleScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const { id } = route.params;

  const [reclamo, setReclamo] = useState<Reclamo | null>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [reclamoData, historialData] = await Promise.all([
        reclamosApi.getOne(id),
        reclamosApi.getHistorial(id),
      ]);
      setReclamo(reclamoData);
      setHistorial(historialData);
    } catch (error) {
      console.error('Error loading reclamo:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openMaps = () => {
    if (reclamo?.latitud && reclamo?.longitud) {
      const url = `https://maps.google.com/?q=${reclamo.latitud},${reclamo.longitud}`;
      Linking.openURL(url);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!reclamo) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color={theme.error} />
          <Text style={[styles.errorText, { color: theme.text }]}>
            Reclamo no encontrado
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backButton, { backgroundColor: theme.card }]}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Reclamo #{reclamo.id}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Estado y Prioridad */}
        <View style={styles.badgeRow}>
          <EstadoBadge estado={reclamo.estado} />
          <PrioridadBadge prioridad={reclamo.prioridad} />
        </View>

        {/* Título y Categoría */}
        <Card style={styles.mainCard}>
          <View style={styles.categoriaRow}>
            <View
              style={[
                styles.categoriaIcon,
                { backgroundColor: `${reclamo.categoria.color || theme.primary}20` },
              ]}
            >
              <Ionicons
                name={(reclamo.categoria.icono as any) || 'help-circle'}
                size={24}
                color={reclamo.categoria.color || theme.primary}
              />
            </View>
            <Text style={[styles.categoriaNombre, { color: theme.textSecondary }]}>
              {reclamo.categoria.nombre}
            </Text>
          </View>

          <Text style={[styles.titulo, { color: theme.text }]}>{reclamo.titulo}</Text>

          <Text style={[styles.descripcion, { color: theme.textSecondary }]}>
            {reclamo.descripcion}
          </Text>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          {/* Ubicación */}
          <TouchableOpacity style={styles.ubicacionRow} onPress={openMaps}>
            <Ionicons name="location" size={20} color={theme.primary} />
            <View style={styles.ubicacionText}>
              <Text style={[styles.direccion, { color: theme.text }]}>
                {reclamo.direccion}
              </Text>
              {reclamo.zona && (
                <Text style={[styles.zona, { color: theme.textSecondary }]}>
                  {reclamo.zona.nombre}
                </Text>
              )}
            </View>
            <Ionicons name="open-outline" size={20} color={theme.textSecondary} />
          </TouchableOpacity>

          {/* Fecha */}
          <View style={styles.fechaRow}>
            <Ionicons name="calendar" size={20} color={theme.textSecondary} />
            <Text style={[styles.fecha, { color: theme.textSecondary }]}>
              Creado el {formatDate(reclamo.created_at)}
            </Text>
          </View>
        </Card>

        {/* Empleado Asignado */}
        {reclamo.empleado_asignado && (
          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Asignado a
            </Text>
            <View style={styles.empleadoRow}>
              <View
                style={[styles.empleadoAvatar, { backgroundColor: theme.primary }]}
              >
                <Text style={styles.empleadoInitial}>
                  {reclamo.empleado_asignado.nombre.charAt(0)}
                </Text>
              </View>
              <View>
                <Text style={[styles.empleadoNombre, { color: theme.text }]}>
                  {reclamo.empleado_asignado.nombre}{' '}
                  {reclamo.empleado_asignado.apellido}
                </Text>
                {reclamo.empleado_asignado.especialidad && (
                  <Text
                    style={[styles.empleadoEspecialidad, { color: theme.textSecondary }]}
                  >
                    {reclamo.empleado_asignado.especialidad}
                  </Text>
                )}
              </View>
            </View>
          </Card>
        )}

        {/* Resolución */}
        {reclamo.resolucion && (
          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Resolución
            </Text>
            <Text style={[styles.resolucion, { color: theme.textSecondary }]}>
              {reclamo.resolucion}
            </Text>
            {reclamo.fecha_resolucion && (
              <Text style={[styles.fechaResolucion, { color: theme.textSecondary }]}>
                Resuelto el {formatDate(reclamo.fecha_resolucion)}
              </Text>
            )}
          </Card>
        )}

        {/* Fotos */}
        {reclamo.documentos && reclamo.documentos.length > 0 && (
          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Fotos adjuntas
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {reclamo.documentos.map((doc) => (
                <Image
                  key={doc.id}
                  source={{ uri: doc.url }}
                  style={styles.foto}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          </Card>
        )}

        {/* Historial */}
        {historial.length > 0 && (
          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Historial
            </Text>
            {historial.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.historialItem,
                  index < historial.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.historialDot,
                    { backgroundColor: theme.primary },
                  ]}
                />
                <View style={styles.historialContent}>
                  <Text style={[styles.historialAccion, { color: theme.text }]}>
                    {item.accion}
                  </Text>
                  {item.comentario && (
                    <Text
                      style={[styles.historialComentario, { color: theme.textSecondary }]}
                    >
                      {item.comentario}
                    </Text>
                  )}
                  <Text
                    style={[styles.historialFecha, { color: theme.textSecondary }]}
                  >
                    {formatDate(item.created_at)} por {item.usuario.nombre}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    padding: spacing.lg,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  mainCard: {
    marginBottom: spacing.md,
  },
  categoriaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  categoriaIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  categoriaNombre: {
    fontSize: 14,
    fontWeight: '500',
  },
  titulo: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  descripcion: {
    fontSize: 15,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
  },
  ubicacionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  ubicacionText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  direccion: {
    fontSize: 15,
    fontWeight: '500',
  },
  zona: {
    fontSize: 13,
  },
  fechaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fecha: {
    fontSize: 14,
    marginLeft: spacing.sm,
  },
  sectionCard: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  empleadoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  empleadoAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  empleadoInitial: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  empleadoNombre: {
    fontSize: 16,
    fontWeight: '500',
  },
  empleadoEspecialidad: {
    fontSize: 14,
  },
  resolucion: {
    fontSize: 15,
    lineHeight: 22,
  },
  fechaResolucion: {
    fontSize: 13,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  foto: {
    width: 150,
    height: 150,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
  },
  historialItem: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
  },
  historialDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    marginRight: spacing.md,
  },
  historialContent: {
    flex: 1,
  },
  historialAccion: {
    fontSize: 15,
    fontWeight: '500',
  },
  historialComentario: {
    fontSize: 14,
    marginTop: 2,
  },
  historialFecha: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
});

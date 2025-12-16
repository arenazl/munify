import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { spacing, borderRadius } from '../theme';
import { categoriasApi, zonasApi, reclamosApi, clasificacionApi } from '../services/api';
import { Categoria, Zona } from '../types';

interface FormData {
  titulo: string;
  descripcion: string;
  categoria_id: number | null;
  direccion: string;
  latitud: number | null;
  longitud: number | null;
  zona_id: number | null;
  referencia: string;
}

const STEPS = ['Categoría', 'Ubicación', 'Detalles', 'Confirmar'];

export default function NuevoReclamoScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Data
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [images, setImages] = useState<string[]>([]);

  // Form
  const [formData, setFormData] = useState<FormData>({
    titulo: '',
    descripcion: '',
    categoria_id: null,
    direccion: '',
    latitud: null,
    longitud: null,
    zona_id: null,
    referencia: '',
  });

  // Location
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    loadData();
    requestPermissions();
  }, []);

  const loadData = async () => {
    try {
      const [cats, zns] = await Promise.all([
        categoriasApi.getAll(user?.municipio_id),
        zonasApi.getAll(user?.municipio_id),
      ]);
      setCategorias(cats);
      setZonas(zns);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const requestPermissions = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
        setFormData((prev) => ({
          ...prev,
          latitud: loc.coords.latitude,
          longitud: loc.coords.longitude,
        }));
      }
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const pickImage = async () => {
    if (images.length >= 5) {
      Alert.alert('Límite alcanzado', 'Podés agregar máximo 5 fotos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 5 - images.length,
    });

    if (!result.canceled) {
      setImages([...images, ...result.assets.map((a) => a.uri)]);
    }
  };

  const takePhoto = async () => {
    if (images.length >= 5) {
      Alert.alert('Límite alcanzado', 'Podés agregar máximo 5 fotos');
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso necesario', 'Necesitamos acceso a la cámara');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled) {
      setImages([...images, result.assets[0].uri]);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleMapPress = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setFormData((prev) => ({
      ...prev,
      latitud: latitude,
      longitud: longitude,
    }));
  };

  const analyzeDescription = async () => {
    if (!formData.descripcion || formData.descripcion.length < 10) return;

    setLoading(true);
    try {
      const result = await clasificacionApi.clasificar(
        formData.descripcion,
        user?.municipio_id || 1
      );

      if (result.sugerencias && result.sugerencias.length > 0) {
        const suggested = result.sugerencias[0];
        Alert.alert(
          'Sugerencia de IA',
          `Basado en tu descripción, te sugiero la categoría: ${suggested.categoria.nombre} (${suggested.confianza}% de confianza)`,
          [
            { text: 'Ignorar', style: 'cancel' },
            {
              text: 'Aplicar',
              onPress: () =>
                setFormData((prev) => ({
                  ...prev,
                  categoria_id: suggested.categoria.id,
                })),
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error analyzing:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.titulo || !formData.descripcion || !formData.categoria_id || !formData.direccion) {
      Alert.alert('Error', 'Por favor completá todos los campos obligatorios');
      return;
    }

    setSubmitting(true);
    try {
      const reclamo = await reclamosApi.create({
        titulo: formData.titulo,
        descripcion: formData.descripcion,
        categoria_id: formData.categoria_id,
        direccion: formData.direccion,
        latitud: formData.latitud || undefined,
        longitud: formData.longitud || undefined,
        zona_id: formData.zona_id || undefined,
        referencia: formData.referencia || undefined,
      });

      // Upload images
      for (const uri of images) {
        await reclamosApi.uploadImage(reclamo.id, uri, 'creacion');
      }

      Alert.alert('¡Éxito!', 'Tu reclamo fue creado correctamente', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.response?.data?.detail || 'No se pudo crear el reclamo'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 0:
        return !!formData.categoria_id;
      case 1:
        return !!formData.direccion;
      case 2:
        return !!formData.titulo && !!formData.descripcion;
      case 3:
        return true;
      default:
        return false;
    }
  };

  const selectedCategoria = categorias.find((c) => c.id === formData.categoria_id);

  // Step renderers
  const renderCategoriaStep = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>
        ¿Qué tipo de problema querés reportar?
      </Text>

      <View style={styles.categoriasGrid}>
        {categorias.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            onPress={() =>
              setFormData((prev) => ({ ...prev, categoria_id: cat.id }))
            }
            style={[
              styles.categoriaCard,
              {
                backgroundColor:
                  formData.categoria_id === cat.id
                    ? `${cat.color || theme.primary}20`
                    : theme.card,
                borderColor:
                  formData.categoria_id === cat.id
                    ? cat.color || theme.primary
                    : theme.border,
              },
            ]}
          >
            <View
              style={[
                styles.categoriaIcon,
                { backgroundColor: `${cat.color || theme.primary}30` },
              ]}
            >
              <Ionicons
                name={(cat.icono as any) || 'help-circle'}
                size={28}
                color={cat.color || theme.primary}
              />
            </View>
            <Text
              style={[styles.categoriaNombre, { color: theme.text }]}
              numberOfLines={2}
            >
              {cat.nombre}
            </Text>
            {formData.categoria_id === cat.id && (
              <View
                style={[styles.checkmark, { backgroundColor: cat.color || theme.primary }]}
              >
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderUbicacionStep = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>
        ¿Dónde está el problema?
      </Text>

      <Input
        label="Dirección"
        placeholder="Ej: Av. San Martín 1234"
        value={formData.direccion}
        onChangeText={(text) =>
          setFormData((prev) => ({ ...prev, direccion: text }))
        }
        icon="location-outline"
      />

      {/* Mapa */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: location?.coords.latitude || -34.6037,
            longitude: location?.coords.longitude || -58.3816,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          onPress={handleMapPress}
        >
          {formData.latitud && formData.longitud && (
            <Marker
              coordinate={{
                latitude: formData.latitud,
                longitude: formData.longitud,
              }}
            />
          )}
        </MapView>

        <TouchableOpacity
          style={[styles.myLocationBtn, { backgroundColor: theme.card }]}
          onPress={async () => {
            const loc = await Location.getCurrentPositionAsync({});
            setFormData((prev) => ({
              ...prev,
              latitud: loc.coords.latitude,
              longitud: loc.coords.longitude,
            }));
            mapRef.current?.animateToRegion({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            });
          }}
        >
          <Ionicons name="locate" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Zona selector */}
      <View style={styles.zonaContainer}>
        <Text style={[styles.label, { color: theme.text }]}>
          Zona/Barrio (opcional)
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {zonas.map((zona) => (
            <TouchableOpacity
              key={zona.id}
              onPress={() =>
                setFormData((prev) => ({
                  ...prev,
                  zona_id: prev.zona_id === zona.id ? null : zona.id,
                }))
              }
              style={[
                styles.zonaChip,
                {
                  backgroundColor:
                    formData.zona_id === zona.id ? theme.primary : theme.card,
                  borderColor:
                    formData.zona_id === zona.id ? theme.primary : theme.border,
                },
              ]}
            >
              <Text
                style={{
                  color: formData.zona_id === zona.id ? '#fff' : theme.text,
                  fontWeight: '500',
                }}
              >
                {zona.nombre}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  const renderDetallesStep = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>
        Contanos más sobre el problema
      </Text>

      <Input
        label="Título del reclamo"
        placeholder="Ej: Bache peligroso en la calle"
        value={formData.titulo}
        onChangeText={(text) =>
          setFormData((prev) => ({ ...prev, titulo: text }))
        }
        icon="document-text-outline"
      />

      <Input
        label="Descripción detallada"
        placeholder="Describí el problema con el mayor detalle posible..."
        value={formData.descripcion}
        onChangeText={(text) =>
          setFormData((prev) => ({ ...prev, descripcion: text }))
        }
        multiline
        numberOfLines={4}
        style={{ height: 100, textAlignVertical: 'top' }}
        onBlur={analyzeDescription}
      />

      <Input
        label="Referencia adicional (opcional)"
        placeholder="Ej: Frente a la escuela, entre calles X e Y..."
        value={formData.referencia}
        onChangeText={(text) =>
          setFormData((prev) => ({ ...prev, referencia: text }))
        }
        icon="information-circle-outline"
      />

      {/* Fotos */}
      <View style={styles.fotosSection}>
        <Text style={[styles.label, { color: theme.text }]}>
          Fotos (opcional, máx. 5)
        </Text>
        <View style={styles.fotosGrid}>
          {images.map((uri, index) => (
            <View key={index} style={styles.fotoContainer}>
              <Image source={{ uri }} style={styles.foto} />
              <TouchableOpacity
                onPress={() => removeImage(index)}
                style={[styles.removeFoto, { backgroundColor: theme.error }]}
              >
                <Ionicons name="close" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}

          {images.length < 5 && (
            <>
              <TouchableOpacity
                onPress={takePhoto}
                style={[styles.addFotoBtn, { borderColor: theme.border }]}
              >
                <Ionicons name="camera" size={28} color={theme.primary} />
                <Text style={[styles.addFotoText, { color: theme.textSecondary }]}>
                  Cámara
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={pickImage}
                style={[styles.addFotoBtn, { borderColor: theme.border }]}
              >
                <Ionicons name="images" size={28} color={theme.primary} />
                <Text style={[styles.addFotoText, { color: theme.textSecondary }]}>
                  Galería
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );

  const renderConfirmarStep = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>
        Revisá tu reclamo
      </Text>

      <Card style={styles.resumenCard}>
        {/* Categoría */}
        <View style={styles.resumenRow}>
          <View
            style={[
              styles.resumenIcon,
              { backgroundColor: `${selectedCategoria?.color || theme.primary}20` },
            ]}
          >
            <Ionicons
              name={(selectedCategoria?.icono as any) || 'help-circle'}
              size={24}
              color={selectedCategoria?.color || theme.primary}
            />
          </View>
          <View style={styles.resumenInfo}>
            <Text style={[styles.resumenLabel, { color: theme.textSecondary }]}>
              Categoría
            </Text>
            <Text style={[styles.resumenValue, { color: theme.text }]}>
              {selectedCategoria?.nombre}
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Título y Descripción */}
        <View style={styles.resumenSection}>
          <Text style={[styles.resumenLabel, { color: theme.textSecondary }]}>
            Título
          </Text>
          <Text style={[styles.resumenValue, { color: theme.text }]}>
            {formData.titulo}
          </Text>
        </View>

        <View style={styles.resumenSection}>
          <Text style={[styles.resumenLabel, { color: theme.textSecondary }]}>
            Descripción
          </Text>
          <Text style={[styles.resumenValue, { color: theme.text }]}>
            {formData.descripcion}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Ubicación */}
        <View style={styles.resumenRow}>
          <Ionicons name="location" size={24} color={theme.primary} />
          <View style={styles.resumenInfo}>
            <Text style={[styles.resumenLabel, { color: theme.textSecondary }]}>
              Ubicación
            </Text>
            <Text style={[styles.resumenValue, { color: theme.text }]}>
              {formData.direccion}
            </Text>
          </View>
        </View>

        {/* Fotos */}
        {images.length > 0 && (
          <>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={styles.resumenSection}>
              <Text style={[styles.resumenLabel, { color: theme.textSecondary }]}>
                {images.length} foto{images.length > 1 ? 's' : ''} adjunta{images.length > 1 ? 's' : ''}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {images.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={styles.resumenFoto} />
                ))}
              </ScrollView>
            </View>
          </>
        )}
      </Card>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backButton, { backgroundColor: theme.card }]}
        >
          <Ionicons name="close" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Nuevo Reclamo
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress */}
      <View style={styles.progressContainer}>
        {STEPS.map((s, i) => (
          <View key={i} style={styles.progressItem}>
            <View
              style={[
                styles.progressDot,
                {
                  backgroundColor: i <= step ? theme.primary : theme.border,
                },
              ]}
            >
              {i < step && <Ionicons name="checkmark" size={14} color="#fff" />}
              {i === step && (
                <Text style={styles.progressNumber}>{i + 1}</Text>
              )}
            </View>
            <Text
              style={[
                styles.progressLabel,
                {
                  color: i <= step ? theme.text : theme.textSecondary,
                  fontWeight: i === step ? '600' : '400',
                },
              ]}
            >
              {s}
            </Text>
            {i < STEPS.length - 1 && (
              <View
                style={[
                  styles.progressLine,
                  { backgroundColor: i < step ? theme.primary : theme.border },
                ]}
              />
            )}
          </View>
        ))}
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {step === 0 && renderCategoriaStep()}
          {step === 1 && renderUbicacionStep()}
          {step === 2 && renderDetallesStep()}
          {step === 3 && renderConfirmarStep()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        {step > 0 && (
          <Button
            title="Anterior"
            onPress={() => setStep(step - 1)}
            variant="outline"
            icon={<Ionicons name="chevron-back" size={20} color={theme.primary} />}
          />
        )}
        <View style={{ flex: 1 }} />
        {step < STEPS.length - 1 ? (
          <Button
            title="Siguiente"
            onPress={() => setStep(step + 1)}
            disabled={!canProceed()}
            icon={
              <Ionicons
                name="chevron-forward"
                size={20}
                color={canProceed() ? '#fff' : theme.textSecondary}
              />
            }
          />
        ) : (
          <Button
            title="Enviar Reclamo"
            onPress={handleSubmit}
            loading={submitting}
            icon={<Ionicons name="send" size={20} color="#fff" />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressNumber: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  progressLabel: {
    fontSize: 12,
    marginLeft: spacing.xs,
  },
  progressLine: {
    width: 30,
    height: 2,
    marginHorizontal: spacing.xs,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.lg,
  },
  categoriasGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  categoriaCard: {
    width: '47%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    alignItems: 'center',
    position: 'relative',
  },
  categoriaIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  categoriaNombre: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  checkmark: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapContainer: {
    height: 200,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  myLocationBtn: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  zonaContainer: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  zonaChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  fotosSection: {
    marginTop: spacing.md,
  },
  fotosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fotoContainer: {
    position: 'relative',
  },
  foto: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.md,
  },
  removeFoto: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFotoBtn: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFotoText: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  resumenCard: {
    marginBottom: spacing.md,
  },
  resumenRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resumenIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  resumenInfo: {
    flex: 1,
  },
  resumenLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  resumenValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  resumenSection: {
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
  },
  resumenFoto: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
});

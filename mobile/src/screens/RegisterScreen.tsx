import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { spacing, borderRadius } from '../theme';
import { AuthStackParamList } from '../navigation';
import { municipiosApi } from '../services/api';
import { Municipio } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

export default function RegisterScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { register } = useAuth();

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [municipioId, setMunicipioId] = useState<number | undefined>();
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadMunicipios();
  }, []);

  const loadMunicipios = async () => {
    try {
      const data = await municipiosApi.getAll();
      setMunicipios(data);
      if (data.length === 1) {
        setMunicipioId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading municipios:', error);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!nombre.trim()) newErrors.nombre = 'El nombre es requerido';
    if (!apellido.trim()) newErrors.apellido = 'El apellido es requerido';

    if (!email.trim()) {
      newErrors.email = 'El email es requerido';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Ingresa un email válido';
    }

    if (!password) {
      newErrors.password = 'La contraseña es requerida';
    } else if (password.length < 6) {
      newErrors.password = 'Mínimo 6 caracteres';
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden';
    }

    if (!municipioId) {
      newErrors.municipio = 'Seleccioná un municipio';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      await register({
        nombre,
        apellido,
        email,
        password,
        telefono: telefono || undefined,
        municipio_id: municipioId,
      });
    } catch (error: any) {
      const message =
        error.response?.data?.detail || 'Error al registrarse. Intentá de nuevo.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.backButton, { backgroundColor: theme.backgroundSecondary }]}
            >
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.text }]}>Crear Cuenta</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Registrate para reportar problemas en tu barrio
            </Text>
          </View>

          {/* Form */}
          <View style={[styles.form, { backgroundColor: theme.card }]}>
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Input
                  label="Nombre"
                  placeholder="Juan"
                  value={nombre}
                  onChangeText={setNombre}
                  autoCapitalize="words"
                  icon="person-outline"
                  error={errors.nombre}
                />
              </View>
              <View style={styles.halfInput}>
                <Input
                  label="Apellido"
                  placeholder="Pérez"
                  value={apellido}
                  onChangeText={setApellido}
                  autoCapitalize="words"
                  icon="person-outline"
                  error={errors.apellido}
                />
              </View>
            </View>

            <Input
              label="Email"
              placeholder="tu@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              icon="mail-outline"
              error={errors.email}
            />

            <Input
              label="Teléfono (opcional)"
              placeholder="+54 9 11 1234-5678"
              value={telefono}
              onChangeText={setTelefono}
              keyboardType="phone-pad"
              icon="call-outline"
            />

            {/* Selector de Municipio */}
            <View style={styles.pickerContainer}>
              <Text style={[styles.label, { color: theme.text }]}>Municipio</Text>
              <View
                style={[
                  styles.pickerWrapper,
                  {
                    backgroundColor: theme.backgroundSecondary,
                    borderColor: errors.municipio ? theme.error : theme.border,
                  },
                ]}
              >
                <Ionicons
                  name="location-outline"
                  size={20}
                  color={theme.textSecondary}
                  style={styles.pickerIcon}
                />
                <Picker
                  selectedValue={municipioId}
                  onValueChange={(value) => setMunicipioId(value)}
                  style={[styles.picker, { color: theme.text }]}
                  dropdownIconColor={theme.textSecondary}
                >
                  <Picker.Item label="Seleccionar municipio..." value={undefined} />
                  {municipios.map((m) => (
                    <Picker.Item key={m.id} label={m.nombre} value={m.id} />
                  ))}
                </Picker>
              </View>
              {errors.municipio && (
                <Text style={[styles.error, { color: theme.error }]}>
                  {errors.municipio}
                </Text>
              )}
            </View>

            <Input
              label="Contraseña"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              icon="lock-closed-outline"
              error={errors.password}
            />

            <Input
              label="Confirmar contraseña"
              placeholder="Repetí la contraseña"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              icon="lock-closed-outline"
              error={errors.confirmPassword}
            />

            <Button
              title="Crear Cuenta"
              onPress={handleRegister}
              loading={loading}
              fullWidth
              size="large"
              style={{ marginTop: spacing.md }}
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: theme.textSecondary }]}>
              ¿Ya tenés cuenta?
            </Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={[styles.link, { color: theme.primary }]}>
                Iniciá sesión
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 16,
  },
  form: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfInput: {
    flex: 1,
  },
  pickerContainer: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  pickerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    paddingLeft: spacing.md,
  },
  pickerIcon: {
    marginRight: spacing.sm,
  },
  picker: {
    flex: 1,
    height: 50,
  },
  error: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  footerText: {
    fontSize: 14,
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
  },
});

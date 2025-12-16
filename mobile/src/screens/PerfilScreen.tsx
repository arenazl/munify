import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { spacing, borderRadius } from '../theme';

export default function PerfilScreen() {
  const { theme, themeMode, setThemeMode, isDark } = useTheme();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro que querés cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: logout },
      ]
    );
  };

  const MenuItem = ({
    icon,
    label,
    value,
    onPress,
    showArrow = true,
    rightComponent,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string;
    onPress?: () => void;
    showArrow?: boolean;
    rightComponent?: React.ReactNode;
  }) => (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.menuIcon, { backgroundColor: `${theme.primary}15` }]}>
        <Ionicons name={icon} size={20} color={theme.primary} />
      </View>
      <View style={styles.menuContent}>
        <Text style={[styles.menuLabel, { color: theme.text }]}>{label}</Text>
        {value && (
          <Text style={[styles.menuValue, { color: theme.textSecondary }]}>
            {value}
          </Text>
        )}
      </View>
      {rightComponent || (showArrow && onPress && (
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
      ))}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Mi Perfil</Text>
        </View>

        {/* User Info */}
        <Card style={styles.userCard}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>
                {user?.nombre.charAt(0)}
                {user?.apellido.charAt(0)}
              </Text>
            </View>
          </View>
          <Text style={[styles.userName, { color: theme.text }]}>
            {user?.nombre} {user?.apellido}
          </Text>
          <Text style={[styles.userEmail, { color: theme.textSecondary }]}>
            {user?.email}
          </Text>
          <View style={[styles.rolBadge, { backgroundColor: `${theme.primary}20` }]}>
            <Text style={[styles.rolText, { color: theme.primary }]}>
              {user?.rol === 'vecino' ? 'Vecino' : user?.rol}
            </Text>
          </View>
        </Card>

        {/* Información Personal */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          INFORMACIÓN PERSONAL
        </Text>
        <Card style={styles.sectionCard}>
          <MenuItem
            icon="person-outline"
            label="Nombre completo"
            value={`${user?.nombre} ${user?.apellido}`}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="mail-outline"
            label="Email"
            value={user?.email}
          />
          {user?.telefono && (
            <>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <MenuItem
                icon="call-outline"
                label="Teléfono"
                value={user?.telefono}
              />
            </>
          )}
          {user?.direccion && (
            <>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <MenuItem
                icon="location-outline"
                label="Dirección"
                value={user?.direccion}
              />
            </>
          )}
        </Card>

        {/* Preferencias */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          PREFERENCIAS
        </Text>
        <Card style={styles.sectionCard}>
          <MenuItem
            icon="moon-outline"
            label="Modo oscuro"
            showArrow={false}
            rightComponent={
              <Switch
                value={isDark}
                onValueChange={(value) => setThemeMode(value ? 'dark' : 'light')}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#fff"
              />
            }
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="notifications-outline"
            label="Notificaciones"
            onPress={() => {}}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="language-outline"
            label="Idioma"
            value="Español"
            onPress={() => {}}
          />
        </Card>

        {/* Soporte */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          SOPORTE
        </Text>
        <Card style={styles.sectionCard}>
          <MenuItem
            icon="help-circle-outline"
            label="Ayuda y FAQ"
            onPress={() => {}}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="document-text-outline"
            label="Términos y condiciones"
            onPress={() => {}}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="shield-checkmark-outline"
            label="Política de privacidad"
            onPress={() => {}}
          />
        </Card>

        {/* Logout */}
        <Button
          title="Cerrar Sesión"
          onPress={handleLogout}
          variant="outline"
          fullWidth
          icon={<Ionicons name="log-out-outline" size={20} color={theme.error} />}
          style={{ marginTop: spacing.lg, borderColor: theme.error }}
          textStyle={{ color: theme.error }}
        />

        {/* Version */}
        <Text style={[styles.version, { color: theme.textSecondary }]}>
          Versión 1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  userCard: {
    alignItems: 'center',
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  avatarContainer: {
    marginBottom: spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  userName: {
    fontSize: 22,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 15,
    marginTop: spacing.xs,
  },
  rolBadge: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  rolText: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionCard: {
    marginBottom: spacing.lg,
    padding: 0,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  menuValue: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 60,
  },
  version: {
    textAlign: 'center',
    fontSize: 13,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
});

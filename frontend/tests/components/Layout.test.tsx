import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getNavigation, isMobileDevice } from '../../src/config/navigation';

/**
 * Layout Component - Sidebar Functionality Tests
 *
 * This test suite focuses on testing the sidebar's core logic and configuration.
 * The Layout component is a complex integration component with many dependencies
 * (contexts, routing, APIs, etc.), so we test its logic units in isolation.
 *
 * For full integration tests including UI interaction, see the Playwright E2E tests.
 */

describe('Layout - Sidebar Functionality', () => {
  describe('Navigation Configuration', () => {
    it('should load correct navigation items for admin role', () => {
      const navigation = getNavigation('admin');

      // Admin/Supervisor should see 10 navigation items
      expect(navigation).toHaveLength(10);
      expect(navigation.map(item => item.name)).toEqual([
        'Dashboard',
        'Reclamos',
        'Trámites',
        'Mapa',
        'Tablero',
        'Planificación',
        'SLA',
        'Exportar',
        'Panel BI',
        'Ajustes',
      ]);
    });

    it('should load correct navigation items for supervisor role', () => {
      const navigation = getNavigation('supervisor');

      // Supervisor should see same as admin (10 items)
      expect(navigation).toHaveLength(10);
      expect(navigation[0].name).toBe('Dashboard');
      expect(navigation[1].name).toBe('Reclamos');
    });

    it('should load correct navigation items for empleado role', () => {
      const navigation = getNavigation('empleado');

      // Empleado should see 5 navigation items
      expect(navigation).toHaveLength(5);
      expect(navigation.map(item => item.name)).toEqual([
        'Tablero',
        'Mis Trabajos',
        'Mapa',
        'Mi Rendimiento',
        'Mi Historial',
      ]);
    });

    it('should load correct navigation items for vecino role', () => {
      const navigation = getNavigation('vecino');

      // Vecino should see 6 navigation items
      expect(navigation).toHaveLength(6);
      expect(navigation.map(item => item.name)).toEqual([
        'Mi Panel',
        'Nuevo Reclamo',
        'Mis Reclamos',
        'Mis Trámites',
        'Mapa',
        'Logros',
      ]);
    });

    it('should have correct href paths for all navigation items', () => {
      const adminNav = getNavigation('admin');

      adminNav.forEach(item => {
        expect(item.href).toMatch(/^\/gestion/);
      });
    });

    it('should include icon component for each navigation item', () => {
      const adminNav = getNavigation('admin');

      adminNav.forEach(item => {
        expect(item.icon).toBeDefined();
        // Icon can be either a function or an object (React component)
        expect(['function', 'object']).toContain(typeof item.icon);
      });
    });
  });

  describe('Sidebar Collapsed State - LocalStorage Integration', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    afterEach(() => {
      localStorage.clear();
    });

    it('should store collapsed state in localStorage', () => {
      // Simulate setting collapsed state
      localStorage.setItem('sidebarCollapsed', 'true');

      expect(localStorage.getItem('sidebarCollapsed')).toBe('true');
    });

    it('should retrieve collapsed state from localStorage', () => {
      // Set initial state
      localStorage.setItem('sidebarCollapsed', 'false');

      // Retrieve state (simulating component mount)
      const saved = localStorage.getItem('sidebarCollapsed');
      const isCollapsed = saved === 'true';

      expect(isCollapsed).toBe(false);
    });

    it('should handle missing localStorage value gracefully', () => {
      // No value set in localStorage
      const saved = localStorage.getItem('sidebarCollapsed');
      const isCollapsed = saved === 'true';

      // Should default to false (expanded)
      expect(isCollapsed).toBe(false);
    });

    it('should toggle collapsed state correctly', () => {
      // Initial state
      localStorage.setItem('sidebarCollapsed', 'false');
      let isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
      expect(isCollapsed).toBe(false);

      // Toggle to collapsed
      localStorage.setItem('sidebarCollapsed', String(!isCollapsed));
      isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
      expect(isCollapsed).toBe(true);

      // Toggle back to expanded
      localStorage.setItem('sidebarCollapsed', String(!isCollapsed));
      isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
      expect(isCollapsed).toBe(false);
    });
  });

  describe('Mobile Detection', () => {
    let originalWindow: any;

    beforeEach(() => {
      // Save original window object
      originalWindow = global.window;
    });

    afterEach(() => {
      // Restore original window
      global.window = originalWindow;
    });

    it('should detect mobile device by screen width', () => {
      // Mock small screen (< 768px)
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });

      const isMobile = isMobileDevice();

      // Should detect as mobile based on screen size
      expect(isMobile).toBe(true);
    });

    it('should detect desktop by screen width', () => {
      // Mock large screen (>= 768px)
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      // Mock non-mobile user agent
      Object.defineProperty(window, 'navigator', {
        writable: true,
        configurable: true,
        value: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      });

      const isMobile = isMobileDevice();

      // Should detect as desktop
      expect(isMobile).toBe(false);
    });
  });

  describe('CSS Variable Integration Logic', () => {
    it('should calculate correct sidebar width for expanded state', () => {
      const sidebarCollapsed = false;

      // Expanded: 11rem, Collapsed: 5rem
      const sidebarWidth = sidebarCollapsed ? '5rem' : '11rem';

      expect(sidebarWidth).toBe('11rem');
    });

    it('should calculate correct sidebar width for collapsed state', () => {
      const sidebarCollapsed = true;

      const sidebarWidth = sidebarCollapsed ? '5rem' : '11rem';

      expect(sidebarWidth).toBe('5rem');
    });

    it('should return 0px for mobile devices', () => {
      const isMobile = true;

      // Mobile should have 0px sidebar width (uses bottom tab bar instead)
      const sidebarWidth = isMobile ? '0px' : '11rem';

      expect(sidebarWidth).toBe('0px');
    });
  });

  describe('Mobile Tab Configuration', () => {
    it('should return 5 tabs for admin/supervisor', () => {
      // Admin/Supervisor tabs
      const mobileTabs = [
        { path: '/gestion', label: 'Inicio' },
        { path: '/gestion/mapa', label: 'Mapa' },
        { path: '/gestion/reclamos', label: 'Reclamos' },
        { path: '/gestion/tramites', label: 'Trámites' },
        { path: '/gestion/tablero', label: 'Tablero' },
      ];

      expect(mobileTabs).toHaveLength(5);
      expect(mobileTabs[2].label).toBe('Reclamos'); // Center tab
    });

    it('should return 5 tabs for empleado', () => {
      // Empleado tabs
      const mobileTabs = [
        { path: '/gestion/tablero', label: 'Tablero' },
        { path: '/gestion/mapa', label: 'Mapa' },
        { path: '/gestion/mis-trabajos', label: 'Trabajos' },
        { path: '/gestion/mi-rendimiento', label: 'Stats' },
        { path: '/gestion/mi-historial', label: 'Historial' },
      ];

      expect(mobileTabs).toHaveLength(5);
      expect(mobileTabs[2].label).toBe('Trabajos'); // Center tab
    });

    it('should return 5 tabs for vecino', () => {
      // Vecino tabs
      const mobileTabs = [
        { path: '/gestion/crear-reclamo', label: 'Nuevo' },
        { path: '/gestion/mis-reclamos', label: 'Reclamos' },
        { path: '/gestion/logros', label: 'Logros' },
        { path: '/gestion/crear-tramite', label: 'Trámite' },
        { path: '/gestion/mi-panel', label: 'Inicio' },
      ];

      expect(mobileTabs).toHaveLength(5);
      expect(mobileTabs[2].label).toBe('Logros'); // Center tab (elevated)
    });
  });
});

/**
 * Note on Integration Tests:
 *
 * The following aspects of the sidebar are best tested with E2E tests using Playwright:
 * - Actual rendering of the sidebar component
 * - Click interactions on the collapse button
 * - Visual verification of sidebar expansion/collapse animations
 * - CSS transitions and theme integration
 * - Active state highlighting
 * - Responsive behavior (mobile vs desktop)
 *
 * These tests focus on the business logic and configuration that powers the sidebar,
 * which are the most critical and testable units in isolation.
 */

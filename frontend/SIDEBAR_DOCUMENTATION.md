# Sidebar Documentation

## Overview

This document describes the existing sidebar architecture in the Munify municipal management system. The sidebar serves as the primary navigation component for authenticated users and adapts based on user roles and device types.

---

## Architecture

### Location
The sidebar is implemented in `frontend/src/components/Layout.tsx` (lines 217-355).

### Component Structure
```
Layout.tsx
├── Top Bar (header - fixed)
├── Sidebar (navigation - fixed left)
│   ├── Navigation Links
│   ├── Collapse/Expand Button (desktop only)
│   └── Close Button (mobile only)
├── Main Content Area
└── Bottom Tab Bar (mobile only)
```

### State Management
The sidebar uses React's `useState` hook to manage its state:

```typescript
// Sidebar visibility (mobile overlay)
const [sidebarOpen, setSidebarOpen] = useState(false);

// Sidebar collapsed state (desktop)
const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
  const saved = localStorage.getItem('sidebarCollapsed');
  return saved === 'true';
});
```

**Persistence:** The collapsed state is persisted to `localStorage` under the key `sidebarCollapsed` and restored on component mount.

---

## Role-Based Access Control

### Navigation Configuration
Navigation items are defined in `frontend/src/config/navigation.ts` using the `getNavigation(userRole)` function.

### User Roles
The system supports three main user types:

#### 1. **Admin/Supervisor** (`admin`, `supervisor`)
- Dashboard (metrics overview)
- Reclamos (all complaints)
- Trámites (procedures)
- Mapa (map view)
- Tablero (Kanban board)
- Planificación (weekly calendar)
- SLA (service level management)
- Exportar (CSV export)
- Panel BI (AI analytics)
- Ajustes (system settings)

#### 2. **Empleado** (Employee)
- Tablero (work board)
- Mis Trabajos (assigned tasks)
- Mapa (map view)
- Mi Rendimiento (performance stats)
- Mi Historial (work history)

#### 3. **Vecino** (Resident)
- Mi Panel (personal dashboard)
- Nuevo Reclamo (create complaint)
- Mis Reclamos (my complaints)
- Mis Trámites (my procedures)
- Mapa (map view)
- Logros (achievements)

### Navigation Item Structure
```typescript
{
  name: string;          // Display name
  href: string;          // Route path
  icon: LucideIcon;      // Icon component
  show: boolean;         // Visibility (role-based)
  description: string;   // Tooltip/description
}
```

The `getNavigation()` function filters items based on the `show` property, which is calculated using role checks.

---

## Mobile vs Desktop Behavior

### Responsive Breakpoint
The system uses **1024px** (Tailwind's `lg` breakpoint) to differentiate between mobile and desktop.

### Mobile Behavior (`< 1024px`)
- **Sidebar:** Hidden by default, slides in from left when hamburger menu is clicked
- **Backdrop:** Semi-transparent dark overlay appears behind sidebar
- **Width:** Fixed at `12.5rem` (200px)
- **State:** Always expanded (not collapsible)
- **Close:** User clicks backdrop or close button
- **Alternative Navigation:** Bottom tab bar provides quick access to 5 main sections

#### Mobile Tab Bar
Located at the bottom of the screen, shows 5 key navigation items based on role:
- **Admin/Supervisor:** Inicio, Mapa, Reclamos (elevated), Trámites, Tablero
- **Empleado:** Tablero, Mapa, Trabajos (elevated), Stats, Historial
- **Vecino:** Nuevo, Reclamos, Logros (elevated), Trámite, Inicio

### Desktop Behavior (`≥ 1024px`)
- **Sidebar:** Always visible, positioned on the left
- **Width:** `11rem` (176px) when expanded, `5rem` (80px) when collapsed
- **Collapsible:** User can toggle between expanded and collapsed states
- **Toggle Button:** Located at the bottom of the sidebar
- **State Persistence:** Collapsed state saved to localStorage
- **Content Shift:** Main content area adjusts its padding-left to accommodate sidebar width

### Device Detection
The `isMobileDevice()` function in `navigation.ts` detects mobile devices using:
1. User agent string matching
2. Screen width detection (`< 768px`)

---

## CSS Variables

### `--sidebar-width` Variable
Defined in Layout.tsx (lines 965-973), this CSS custom property allows other components to react to sidebar size changes.

```css
:root {
  --sidebar-width: 0px;
}

@media (min-width: 1024px) {
  :root {
    --sidebar-width: ${sidebarWidth}; /* Dynamic JS value */
  }
}
```

### Dynamic Width Calculation
```typescript
const sidebarWidth = isMobile
  ? '12.5rem'                    // Mobile: 200px
  : (sidebarCollapsed
      ? '5rem'                   // Desktop collapsed: 80px
      : '11rem');                // Desktop expanded: 176px
```

### Usage in Other Components
Components can reference this variable to adjust their layout:

```css
.main-content-area {
  padding-left: 0;
  transition: padding-left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (min-width: 1024px) {
  .main-content-area {
    padding-left: var(--sidebar-width);
  }
}
```

---

## Theme Integration and Customization

### Theme Context
The sidebar uses the `useTheme()` hook from `ThemeContext` to access theme variables:

```typescript
const {
  theme,
  sidebarBgImage,
  sidebarBgOpacity,
  // ... other theme properties
} = useTheme();
```

### Customizable Properties

#### 1. **Colors**
- `theme.sidebar` - Sidebar background color (with ~90% opacity)
- `theme.sidebarText` - Primary text color
- `theme.sidebarTextSecondary` - Secondary text color (inactive items)
- `theme.primary` - Active item background & accent color
- `theme.border` - Divider lines

#### 2. **Background Images**
The sidebar supports background images with adjustable opacity:

```tsx
{sidebarBgImage && (
  <>
    <div
      className="absolute inset-0 bg-cover bg-center"
      style={{
        backgroundImage: `url(${sidebarBgImage})`,
        opacity: sidebarBgOpacity,
      }}
    />
    <div
      className="absolute inset-0"
      style={{ background: theme.sidebar }}
    />
  </>
)}
```

**Configuration:**
- `sidebarBgImage`: URL of the background image
- `sidebarBgOpacity`: Opacity value (0-1)
- Overlay applied for text legibility

#### 3. **Animations**
The sidebar uses smooth transitions with cubic-bezier easing:

```css
transition:
  width 0.4s cubic-bezier(0.4, 0, 0.2, 1),
  transform 0.3s ease-out,
  background-color 0.3s ease
```

**Animation Behaviors:**
- Width change: 0.4s smooth easing
- Mobile slide-in: 0.3s ease-out
- Background color: 0.3s ease
- Text opacity: 0.3s when collapsing

#### 4. **Navigation Item States**

**Active State:**
```typescript
style={{
  backgroundColor: isActive ? theme.primary : 'transparent',
  color: isActive ? '#ffffff' : theme.sidebarTextSecondary,
}}
```

**Hover State:**
```typescript
onMouseEnter={(e) => {
  if (!isActive) {
    e.currentTarget.style.backgroundColor = `${theme.primary}20`;
    e.currentTarget.style.color = theme.sidebarText;
  }
}}
```

**Visual Indicators:**
- Active items: Colored background, white text, animated indicator bar
- Hover: Translucent background, brighter text
- Collapsed: Centered icons only, tooltips on hover

---

## Sidebar Position and Layout

### Fixed Positioning
```css
position: fixed;
left: 0;
bottom: 0;
top: 64px;  /* Below the header */
z-index: 30;
```

### Content Area Adjustment
The main content area uses responsive padding to avoid overlap:

```css
.main-content-area {
  padding-top: 64px;     /* Header height */
  padding-left: 0;        /* Mobile default */
}

@media (min-width: 1024px) {
  .main-content-area {
    padding-left: ${sidebarWidth};  /* Desktop adjustment */
  }
}
```

---

## Accessibility Features

### Keyboard Navigation
- Navigation items are standard `<Link>` components supporting keyboard navigation
- Focus states are visually indicated

### Screen Reader Support
- Icon-only (collapsed) state includes `title` attribute for tooltips
- Semantic HTML with `<nav>` element
- Button elements for toggle actions

### Touch Optimization
- Active state scales: `active:scale-[0.98]`
- Touch-friendly tap targets
- Backdrop dismiss on mobile

---

## Integration with Other Components

### Header (Top Bar)
- Fixed at the top with z-index 40 (above sidebar)
- Contains hamburger menu to toggle mobile sidebar
- Height: 64px (4rem)

### Main Content
- Wraps all page content
- Automatically adjusts padding based on sidebar width
- Uses PageTransition component for smooth page changes

### Bottom Tab Bar (Mobile)
- Fixed at the bottom with z-index 50
- Safe area inset support for notched devices
- Contains 5 role-specific navigation items
- Middle item is elevated and highlighted

---

## Performance Considerations

### State Persistence
- localStorage read occurs once on component mount
- localStorage write on every collapse toggle (debounced by React)

### Rendering Optimization
- Navigation items filtered once per render
- Conditional rendering based on device type
- CSS transitions handled by GPU

### Backdrop
- Rendered conditionally only when sidebar is open (mobile)
- onClick handler closes sidebar efficiently

---

## Future Enhancement Opportunities

Based on the current architecture, potential enhancements could include:

1. **Nested Navigation:** Support for sub-menus or grouped items
2. **Search:** Quick navigation search within sidebar
3. **Recent Items:** Track and display recently accessed pages
4. **Drag to Resize:** Allow users to manually adjust sidebar width
5. **Keyboard Shortcuts:** Hotkeys to toggle sidebar or navigate items
6. **Pin/Unpin Items:** User-customizable favorites
7. **Multi-level Hierarchy:** Support for categories and subcategories

---

## Code References

### Key Files
- `frontend/src/components/Layout.tsx` - Main sidebar implementation
- `frontend/src/config/navigation.ts` - Navigation configuration
- `frontend/src/contexts/ThemeContext.tsx` - Theme management
- `frontend/src/contexts/AuthContext.tsx` - User role management

### Key Functions
- `getNavigation(userRole)` - Returns filtered navigation items
- `isMobileDevice()` - Detects mobile devices
- `getDefaultRoute(role)` - Returns default route for user role

### Key State Variables
- `sidebarOpen` - Mobile sidebar visibility
- `sidebarCollapsed` - Desktop collapsed state
- `sidebarWidth` - Dynamic width calculation
- `--sidebar-width` - CSS custom property

---

## Summary

The Munify sidebar is a fully responsive, role-aware navigation component that adapts to different screen sizes and user types. It features:

- ✅ **Role-based filtering** of navigation items
- ✅ **Responsive design** with mobile and desktop behaviors
- ✅ **Persistent state** saved to localStorage
- ✅ **Theme integration** with customizable colors and backgrounds
- ✅ **Smooth animations** and transitions
- ✅ **CSS variable support** for layout coordination
- ✅ **Accessibility features** including keyboard navigation
- ✅ **Mobile-optimized** with bottom tab bar alternative

This architecture provides a solid foundation for navigation while maintaining flexibility for future enhancements and customizations.

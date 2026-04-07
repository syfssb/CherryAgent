/**
 * Auth components barrel export file.
 * Import all auth-related components from a single location.
 *
 * @example
 * import { LoginModal, UserMenu, AuthGuard } from "@/ui/components/auth"
 */

// LoginModal
export { LoginModal } from './LoginModal';
export type { LoginModalProps } from './LoginModal';

// UserMenu
export { UserMenu } from './UserMenu';
export type { UserMenuProps } from './UserMenu';

// AuthGuard
export {
  AuthGuard,
  withAuthGuard,
  AuthOnly,
  GuestOnly,
} from './AuthGuard';
export type { AuthGuardProps } from './AuthGuard';

// AppInitializer
export { AppInitializer, withAppInitializer } from './AppInitializer';
export type { AppInitializerProps } from './AppInitializer';

// ProtectedRoute
export { ProtectedRoute, withProtectedRoute } from './ProtectedRoute';
export type { ProtectedRouteProps } from './ProtectedRoute';

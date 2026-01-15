import { User, AuthCredentials, AuthResponse, SessionData, UserPermissions } from '../types/auth.types';
import { API_CONFIG } from '../config/api.config';

const SESSION_KEY = 'remoti_session';
const TOKEN_KEY = 'remoti_token';

class AuthService {
  private currentSession: SessionData | null = null;

  async login(credentials: AuthCredentials): Promise<AuthResponse> {
    try {
      const response = await fetch(API_CONFIG.ENDPOINTS.AUTH_LOGIN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();
      
      if (data.success && data.user && data.token) {
        this.setSession({
          user: data.user,
          token: data.token,
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
        });
      }

      return data;
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: 'Failed to connect to authentication server',
      };
    }
  }

  async validateToken(token: string): Promise<AuthResponse> {
    try {
      const response = await fetch(API_CONFIG.ENDPOINTS.AUTH_VALIDATE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      return await response.json();
    } catch (error) {
      console.error('Token validation error:', error);
      return { success: false };
    }
  }

  logout(): void {
    this.currentSession = null;
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  setSession(session: SessionData): void {
    this.currentSession = session;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    sessionStorage.setItem(TOKEN_KEY, session.token);
  }

  getSession(): SessionData | null {
    if (this.currentSession) {
      if (new Date() < this.currentSession.expiresAt) {
        return this.currentSession;
      }
      this.logout();
      return null;
    }

    const storedSession = sessionStorage.getItem(SESSION_KEY);
    if (storedSession) {
      try {
        const session: SessionData = JSON.parse(storedSession);
        session.expiresAt = new Date(session.expiresAt);
        
        if (new Date() < session.expiresAt) {
          this.currentSession = session;
          return session;
        }
      } catch (error) {
        console.error('Invalid session data:', error);
      }
    }

    this.logout();
    return null;
  }

  getCurrentUser(): User | null {
    const session = this.getSession();
    return session?.user || null;
  }

  getToken(): string | null {
    const session = this.getSession();
    return session?.token || null;
  }

  isAuthenticated(): boolean {
    return this.getSession() !== null;
  }

  hasPermission(permission: keyof UserPermissions): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;
    return user.permissions[permission] === true;
  }

  canAccessHangar(hangar: string): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;
    
    if (user.permissions.canAccessAllHangars) {
      return true;
    }
    
    return user.permissions.allowedHangars?.includes(hangar) || false;
  }

  canPerformInspection(inspectionType: string): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;
    
    if (!user.permissions.canPerformInspections) {
      return false;
    }
    
    if (!user.permissions.inspectionTypes || user.permissions.inspectionTypes.length === 0) {
      return true; // Can perform all inspection types
    }
    
    return user.permissions.inspectionTypes.includes(inspectionType);
  }

  getDefaultPermissions(userType: 'everdrone' | 'remote'): UserPermissions {
    if (userType === 'everdrone') {
      return {
        canCaptureImages: true,
        canBrowseSessions: true,
        canDeleteSessions: true,
        canExportData: true,
        canAccessAllHangars: true,
        canPerformInspections: true,
      };
    } else {
      return {
        canCaptureImages: false,
        canBrowseSessions: true,
        canDeleteSessions: false,
        canExportData: true,
        canAccessAllHangars: false,
        allowedHangars: [],
        canPerformInspections: true,
        inspectionTypes: ['remote-ti-inspection', 'initial-remote-ti-inspection', 'full-remote-ti-inspection'],
      };
    }
  }
}

export default new AuthService();
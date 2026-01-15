export interface User {
  id: string;
  username: string;
  email?: string;
  type: 'admin' | 'everdrone' | 'service_partner';
  permissions: UserPermissions;
  createdAt: Date;
  lastLogin?: Date;
}

export interface UserPermissions {
  canCaptureImages: boolean;
  canBrowseSessions: boolean;
  canDeleteSessions: boolean;
  canExportData: boolean;
  canAccessAllHangars: boolean;
  allowedHangars?: string[];
  canPerformInspections: boolean;
  inspectionTypes?: string[];
}

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

export interface SessionData {
  user: User;
  token: string;
  expiresAt: Date;
}
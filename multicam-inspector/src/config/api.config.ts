// API Configuration
// Centralized configuration for all API endpoints

const API_HOST = process.env.REACT_APP_API_HOST || 'http://localhost:5001';
export const API_BASE_URL = API_HOST;

export const API_CONFIG = {
  BASE_URL: API_HOST,
  ENDPOINTS: {
    // Authentication endpoints
    AUTH_LOGIN: `${API_HOST}/api/auth/login`,
    AUTH_VALIDATE: `${API_HOST}/api/auth/validate`,
    AUTH_CHANGE_PASSWORD: `${API_HOST}/api/auth/change-password`,
    
    // Inspection endpoints
    INSPECTION_TYPES: `${API_HOST}/api/inspection-types`,
    INSPECTION_DATA: (type: string) => `${API_HOST}/api/inspection-data/${type}`,
    CREATE_SESSION: `${API_HOST}/api/create-inspection-session`,
    UPDATE_PROGRESS: `${API_HOST}/api/inspection/update-progress`,
    
    // Folder endpoints
    FOLDERS: `${API_HOST}/api/folders`,
    
    // Task endpoints
    TASK_STATUS: (sessionFolder: string, taskId: string) => 
      `${API_HOST}/api/inspection/${sessionFolder}/task/${taskId}/status`,
    SESSION_DATA: (sessionPath: string) => 
      `${API_HOST}/api/inspection/${sessionPath}/data`,
    
    // Alarm session endpoints
    ALARM_SESSION: (hangarId: string) => `${API_HOST}/api/alarm-session/${hangarId}`,
    UPDATE_ONSITE_PROGRESS: (hangarId: string) => 
      `${API_HOST}/api/alarm-session/${hangarId}/update-onsite-progress`,
    COMPLETE_ONSITE_TI: (hangarId: string) => 
      `${API_HOST}/api/alarm-session/${hangarId}/complete-onsite-ti`,
    GENERATE_FULL_RTI: (hangarId: string) => 
      `${API_HOST}/api/alarm-session/${hangarId}/generate-full-rti`,
    GENERATE_ONSITE_TI: (hangarId: string) => 
      `${API_HOST}/api/alarm-session/${hangarId}/generate-onsite-ti`,
    CLEAR_AREA: (hangarId: string) => 
      `${API_HOST}/api/alarm-session/${hangarId}/clear-area`,
    ROUTE_DECISION: (hangarId: string) => 
      `${API_HOST}/api/alarm-session/${hangarId}/route-decision`,
    
    // Other endpoints
    TRIGGER_ALARM: `${API_HOST}/api/trigger-alarm`,
    CAPTURE_FRAME: `${API_HOST}/api/capture-frame`,
    SAVE_IMAGES: `${API_HOST}/api/save-captured-images`,
    UPDATE_RTI_PROGRESS: `${API_HOST}/api/update-rti-progress`,
    COMPLETE_RTI: `${API_HOST}/api/complete-rti-inspection`,
    BACKEND_CHECK: `${API_HOST}/api/health`,
  }
};

// Helper function for fetch with default options
export const apiFetch = async (url: string, options?: RequestInit) => {
  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  };
  
  return fetch(url, defaultOptions);
};
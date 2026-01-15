/**
 * Client-side configuration utility
 * Provides access to API endpoints and configuration from config.js
 */

// Since config.js is a Node.js module, we need to access it via environment variables
// or through a build-time process. For now, we'll use environment variables.

const API_HOST = process.env.REACT_APP_API_HOST || 'http://localhost:5001';

export const config = {
  api: {
    host: API_HOST,
    timeout: 30000,
    endpoints: {
      // Base endpoints
      health: `${API_HOST}/api/health`,
      
      // Inspection endpoints
      inspectionTypes: `${API_HOST}/api/inspection-types`,
      inspectionData: (type: string) => `${API_HOST}/api/inspection-data/${type}`,
      createSession: `${API_HOST}/api/create-inspection-session`,
      updateProgress: `${API_HOST}/api/inspection/update-progress`,
      
      // Folder endpoints
      folders: `${API_HOST}/api/folders`,
      
      // Task endpoints
      taskStatus: (sessionFolder: string, taskId: string) => 
        `${API_HOST}/api/inspection/${sessionFolder}/task/${taskId}/status`,
      sessionData: (sessionPath: string) => 
        `${API_HOST}/api/inspection/${sessionPath}/data`,
      
      // Alarm session endpoints
      alarmSession: (hangarId: string) => `${API_HOST}/api/alarm-session/${hangarId}`,
      updateOnsiteProgress: (hangarId: string) => 
        `${API_HOST}/api/alarm-session/${hangarId}/update-onsite-progress`,
      completeOnsiteTI: (hangarId: string) => 
        `${API_HOST}/api/alarm-session/${hangarId}/complete-onsite-ti`,
      generateFullRTI: (hangarId: string) => 
        `${API_HOST}/api/alarm-session/${hangarId}/generate-full-rti`,
      generateOnsiteTI: (hangarId: string) => 
        `${API_HOST}/api/alarm-session/${hangarId}/generate-onsite-ti`,
      clearArea: (hangarId: string) => 
        `${API_HOST}/api/alarm-session/${hangarId}/clear-area`,
      routeDecision: (hangarId: string) => 
        `${API_HOST}/api/alarm-session/${hangarId}/route-decision`,
      
      // Other endpoints
      triggerAlarm: `${API_HOST}/api/trigger-alarm`,
      captureFrame: `${API_HOST}/api/capture-frame`,
      saveImages: `${API_HOST}/api/save-captured-images`,
      updateRTIProgress: `${API_HOST}/api/update-rti-progress`,
      completeRTI: `${API_HOST}/api/complete-rti-inspection`
    }
  }
};

// Helper function for making API calls with consistent error handling
export const apiFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.api.timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      }
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
};
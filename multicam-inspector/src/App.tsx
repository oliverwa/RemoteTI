import React, { useState, useEffect } from 'react';
import MultiCamInspector from './components/MultiCamInspector';
import OnsiteChecklistInspector from './components/OnsiteChecklistInspector';
import LoginPage from './components/LoginPage';
import UnifiedInspectionScreen from './components/UnifiedInspectionScreen';
import HangarDashboard from './components/HangarDashboard';
import BackendConnectionCheck from './components/BackendConnectionCheck';
import InspectionSummaryModal from './components/modals/InspectionSummaryModal';
import { ThemeProvider } from './contexts/ThemeContext';
import authService from './services/authService';
import { API_CONFIG } from './config/api.config';
import './App.css';

interface InspectionConfig {
  inspectionType: string;
  hangar: string;
  drone: string;
  action?: 'capture' | 'load' | 'browse' | 'load-session';
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>('');
  const [userType, setUserType] = useState<'admin' | 'everdrone' | 'service_partner'>('everdrone');
  const [inspectionConfig, setInspectionConfig] = useState<InspectionConfig | null>(null);
  const [showDashboard, setShowDashboard] = useState(true);
  const [startedFromDashboard, setStartedFromDashboard] = useState(false);
  const [summaryModalSession, setSummaryModalSession] = useState<{ hangarId: string; sessionPath: string } | null>(null);
  
  // Check URL parameters on mount
  useEffect(() => {
    const checkAndLoadSession = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const action = urlParams.get('action');
      const hangar = urlParams.get('hangar');
      const session = urlParams.get('session');
      const type = urlParams.get('type');
      const returnToDashboard = urlParams.get('returnToDashboard');
      const returnUserType = urlParams.get('userType') as 'admin' | 'everdrone' | 'service_partner' | null;
      
      if (returnToDashboard === 'true') {
        // Auto-login when returning from inspection completion
        setIsAuthenticated(true);
        // Try to get username from auth service, fallback to generic name
        const user = authService.getCurrentUser();
        setCurrentUser(user?.username || (returnUserType === 'service_partner' ? 'Service Partner User' : 'Inspector'));
        setUserType(returnUserType || 'everdrone');
        setShowDashboard(true);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (action === 'load-session' && hangar && session && type) {
        // Auto-login for direct session links
        const sessionUserType = urlParams.get('userType') as 'admin' | 'everdrone' | 'service_partner' | null;
        setIsAuthenticated(true);
        // Try to get username from auth service, fallback to generic name
        const user = authService.getCurrentUser();
        setCurrentUser(user?.username || (sessionUserType === 'service_partner' ? 'Service Partner User' : 'Inspector'));
        setUserType(sessionUserType || 'everdrone');
        setShowDashboard(true); // Show dashboard first so modal can appear
        setStartedFromDashboard(true);
        
        // Check if inspection is completed
        try {
          const sessionPath = `${hangar}/${session}`;
          console.log('[App] Checking completion status for session:', sessionPath);
          const response = await fetch(`${API_CONFIG.BASE_URL}/api/inspection/${sessionPath}/data`);
          
          if (response.ok) {
            const data = await response.json();
            console.log('[App] Inspection data loaded:', {
              completionStatus: data.completionStatus,
              tasksCount: data.tasks?.length,
              allTasksComplete: data.tasks?.every((t: any) => t.status === 'pass' || t.status === 'fail' || t.status === 'na')
            });
            
            // Check if inspection is completed
            if (data.completionStatus?.status === 'completed' ||
                (data.tasks && data.tasks.every((t: any) => t.status === 'pass' || t.status === 'fail' || t.status === 'na'))) {
              // Show summary modal for completed inspections
              console.log('[App] Inspection is completed, showing summary modal');
              setSummaryModalSession({ hangarId: hangar, sessionPath });
              // IMPORTANT: Don't open the inspection UI - just show the modal
              // Dashboard is already set to show (line 58)
            } else {
              // If not completed, open the inspection UI
              console.log('[App] Inspection not completed, opening edit UI');
              setShowDashboard(false);
              const sessionData = `${hangar}|${session}`;
              setInspectionConfig({
                inspectionType: type,
                hangar: sessionData,
                drone: 'session',
                action: 'load-session'
              });
            }
          } else {
            console.log('[App] Failed to fetch inspection data, opening edit UI as fallback');
            // If error checking, open the inspection UI as fallback
            setShowDashboard(false);
            const sessionData = `${hangar}|${session}`;
            setInspectionConfig({
              inspectionType: type,
              hangar: sessionData,
              drone: 'session',
              action: 'load-session'
            });
          }
        } catch (error) {
          console.error('[App] Error checking inspection status:', error);
          // If error, open the inspection UI as fallback
          setShowDashboard(false);
          const sessionData = `${hangar}|${session}`;
          setInspectionConfig({
            inspectionType: type,
            hangar: sessionData,
            drone: 'session',
            action: 'load-session'
          });
        }
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };
    
    checkAndLoadSession();
  }, []);

  const handleLogin = (username: string, type: 'admin' | 'everdrone' | 'service_partner') => {
    setCurrentUser(username);
    setUserType(type);
    setIsAuthenticated(true);
    setShowDashboard(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser('');
    setInspectionConfig(null);
    setShowDashboard(true);
  };

  const handleStartInspection = async (action: 'capture' | 'load' | 'browse' | 'load-session', inspectionType: string, hangar: string, drone: string) => {
    // For load-session action, check if the inspection is completed first
    if (action === 'load-session') {
      // Extract hangarId and session from the format "hangarId|sessionName"
      const [hangarId, sessionName] = hangar.split('|');
      
      if (hangarId && sessionName) {
        try {
          const sessionPath = `${hangarId}/${sessionName}`;
          console.log('[App] Checking completion status for session (from browse):', sessionPath);
          const response = await fetch(`${API_CONFIG.BASE_URL}/api/inspection/${sessionPath}/data`);
          
          if (response.ok) {
            const data = await response.json();
            console.log('[App] Inspection data loaded (from browse):', {
              completionStatus: data.completionStatus,
              tasksCount: data.tasks?.length,
              allTasksComplete: data.tasks?.every((t: any) => t.status === 'pass' || t.status === 'fail' || t.status === 'na')
            });
            
            // Check if inspection is completed
            if (data.completionStatus?.status === 'completed' ||
                (data.tasks && data.tasks.every((t: any) => t.status === 'pass' || t.status === 'fail' || t.status === 'na'))) {
              // Show summary modal for completed inspections
              console.log('[App] Inspection is completed, showing summary modal (from browse)');
              setSummaryModalSession({ hangarId, sessionPath });
              setShowDashboard(true);
              setStartedFromDashboard(true);
              return; // Don't open the inspection UI
            }
          }
        } catch (error) {
          console.error('[App] Error checking inspection status (from browse):', error);
        }
      }
      
      // If not completed or error, proceed with opening the inspection UI
      setStartedFromDashboard(true);
    }
    
    // Pass the action type along with the config so MultiCamInspector knows what to do
    setInspectionConfig({ 
      inspectionType, 
      hangar, 
      drone,
      action 
    });
  };

  const handleBackToSelection = () => {
    setInspectionConfig(null);
    setShowDashboard(false);
  };

  const handleProceedToManualInspection = () => {
    setShowDashboard(false);
  };

  const handleBackToDashboard = () => {
    setShowDashboard(true);
    setInspectionConfig(null);
    setStartedFromDashboard(false);
  };

  const handleOpenInspection = async (hangar: string, session: string, type: string) => {
    // First check if the inspection is completed
    try {
      const sessionPath = `${hangar}/${session}`;
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/inspection/${sessionPath}/data`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Check if inspection is completed
        if (data.completionStatus?.status === 'completed' ||
            (data.tasks && data.tasks.every((t: any) => t.status === 'pass' || t.status === 'fail' || t.status === 'na'))) {
          // Show summary modal for completed inspections
          setSummaryModalSession({ hangarId: hangar, sessionPath });
          return;
        }
      }
    } catch (error) {
      console.error('Error checking inspection status:', error);
    }
    
    // If not completed or error checking, open the inspection UI as normal
    // Extract drone from session name (e.g., "initial_remote_marvin_260115_173150" -> "marvin")
    let drone = 'Unknown';
    const sessionParts = session.split('_');
    
    // Skip type prefixes to find drone name
    for (let i = 0; i < sessionParts.length; i++) {
      const part = sessionParts[i].toLowerCase();
      if (!['initial', 'remote', 'full', 'basic', 'service', 'partner', 'onsite', 'ti'].includes(part) && 
          !/^\d+$/.test(part)) {
        drone = sessionParts[i];
        break;
      }
    }
    
    setInspectionConfig({
      inspectionType: type,
      hangar: `${hangar}|${session}`,  // Pass as "hangarId|sessionName" for load-session
      drone,
      action: 'load-session' as const
    });
    setShowDashboard(false);
    setStartedFromDashboard(true);
    
    // Also set URL params for the inspector to find the session
    const searchParams = new URLSearchParams();
    searchParams.set('hangar', hangar);
    searchParams.set('session', session);
    searchParams.set('type', type);
    searchParams.set('action', 'load-session');
    window.history.replaceState({}, '', `?${searchParams.toString()}`);
  };

  return (
    <ThemeProvider>
      <BackendConnectionCheck>
        <div className="App">
        {!isAuthenticated ? (
          <LoginPage onLogin={handleLogin} />
        ) : showDashboard ? (
          <HangarDashboard
            currentUser={currentUser}
            userType={userType}
            onProceedToInspection={handleProceedToManualInspection}
            onOpenInspection={handleOpenInspection}
            onLogout={handleLogout}
          />
        ) : !inspectionConfig ? (
          <>
            {/* Back to Dashboard button */}
            <button
              onClick={handleBackToDashboard}
              className="fixed top-4 left-4 z-50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
              title="Back to dashboard"
            >
              ← Dashboard
            </button>
            <UnifiedInspectionScreen 
              currentUser={currentUser}
              onStartInspection={handleStartInspection}
              onLogout={handleLogout}
            />
          </>
        ) : (
        <div>
          {/* Minimal back button in bottom-left corner */}
          <button
            onClick={startedFromDashboard ? handleBackToDashboard : handleBackToSelection}
            className="fixed bottom-4 left-4 z-50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
            title={startedFromDashboard ? "Back to dashboard" : "Back to selection"}
          >
            ← Back
          </button>
          {(inspectionConfig.inspectionType === 'remote-ti-inspection' || 
            inspectionConfig.inspectionType === 'initial-remote-ti-inspection' ||
            inspectionConfig.inspectionType === 'full-remote-ti-inspection') ? (
            <MultiCamInspector 
              selectedInspection={inspectionConfig.inspectionType}
              selectedHangar={inspectionConfig.hangar}
              selectedDrone={inspectionConfig.drone}
              action={inspectionConfig.action}
              userType={userType}
              currentUser={currentUser}
            />
          ) : (
            <OnsiteChecklistInspector
              selectedInspection={inspectionConfig.inspectionType}
              selectedHangar={inspectionConfig.hangar}
              selectedDrone={inspectionConfig.drone}
              currentUser={currentUser}
              action={inspectionConfig.action}
              userType={userType}
            />
          )}
        </div>
      )}
        </div>
        
        {/* Inspection Summary Modal */}
        {summaryModalSession && (
          <InspectionSummaryModal
            isOpen={true}
            onClose={() => setSummaryModalSession(null)}
            sessionPath={summaryModalSession.sessionPath}
            hangarId={summaryModalSession.hangarId}
            showImages={true}
          />
        )}
      </BackendConnectionCheck>
    </ThemeProvider>
  );
}

export default App;

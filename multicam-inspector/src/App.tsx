import React, { useState, useEffect } from 'react';
import MultiCamInspector from './components/MultiCamInspector';
import OnsiteChecklistInspector from './components/OnsiteChecklistInspector';
import LoginPage from './components/LoginPage';
import UnifiedInspectionScreen from './components/UnifiedInspectionScreen';
import HangarDashboard from './components/HangarDashboard';
import BackendConnectionCheck from './components/BackendConnectionCheck';
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
  const [inspectionConfig, setInspectionConfig] = useState<InspectionConfig | null>(null);
  const [showDashboard, setShowDashboard] = useState(true);
  
  // Check URL parameters on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const hangar = urlParams.get('hangar');
    const session = urlParams.get('session');
    const type = urlParams.get('type');
    
    if (action === 'load-session' && hangar && session && type) {
      // Auto-login for direct session links
      setIsAuthenticated(true);
      setCurrentUser('Inspector');
      setShowDashboard(false);
      
      // Set up the inspection config to load the session
      const sessionData = `${hangar}|${session}`;
      setInspectionConfig({
        inspectionType: type,
        hangar: sessionData,
        drone: 'session',
        action: 'load-session'
      });
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleLogin = (username: string) => {
    setCurrentUser(username);
    setIsAuthenticated(true);
    setShowDashboard(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser('');
    setInspectionConfig(null);
    setShowDashboard(true);
  };

  const handleStartInspection = (action: 'capture' | 'load' | 'browse' | 'load-session', inspectionType: string, hangar: string, drone: string) => {
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
  };

  return (
    <BackendConnectionCheck>
      <div className="App">
        {!isAuthenticated ? (
          <LoginPage onLogin={handleLogin} />
        ) : showDashboard ? (
          <HangarDashboard
            currentUser={currentUser}
            onProceedToInspection={handleProceedToManualInspection}
            onLogout={handleLogout}
          />
        ) : !inspectionConfig ? (
          <>
            {/* Back to Dashboard button */}
            <button
              onClick={handleBackToDashboard}
              className="fixed top-4 left-4 z-50 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm border border-gray-200 text-sm text-gray-600 hover:text-blue-600 hover:bg-gray-50 transition-all"
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
            onClick={handleBackToSelection}
            className="fixed bottom-4 left-4 z-50 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-sm border border-gray-200 text-sm text-gray-600 hover:text-blue-600 hover:bg-gray-50 transition-all"
            title="Back to selection"
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
            />
          ) : (
            <OnsiteChecklistInspector
              selectedInspection={inspectionConfig.inspectionType}
              selectedHangar={inspectionConfig.hangar}
              selectedDrone={inspectionConfig.drone}
              currentUser={currentUser}
              action={inspectionConfig.action}
            />
          )}
        </div>
      )}
      </div>
    </BackendConnectionCheck>
  );
}

export default App;

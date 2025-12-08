import React, { useState } from 'react';
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
          {inspectionConfig.inspectionType === 'remote-ti-inspection' ? (
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

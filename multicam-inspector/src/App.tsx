import React, { useState } from 'react';
import MultiCamInspector from './components/MultiCamInspector';
import LoginPage from './components/LoginPage';
import UnifiedInspectionScreen from './components/UnifiedInspectionScreen';
import './App.css';

interface InspectionConfig {
  inspectionType: string;
  hangar: string;
  drone: string;
  action?: 'capture' | 'load' | 'browse';
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>('');
  const [inspectionConfig, setInspectionConfig] = useState<InspectionConfig | null>(null);

  const handleLogin = (username: string) => {
    setCurrentUser(username);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser('');
    setInspectionConfig(null);
  };

  const handleStartInspection = (action: 'capture' | 'load' | 'browse', inspectionType: string, hangar: string, drone: string) => {
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
  };

  return (
    <div className="App">
      {!isAuthenticated ? (
        <LoginPage onLogin={handleLogin} />
      ) : !inspectionConfig ? (
        <UnifiedInspectionScreen 
          currentUser={currentUser}
          onStartInspection={handleStartInspection}
          onLogout={handleLogout}
        />
      ) : (
        <div>
          {/* Minimal user indicator in bottom-left corner with back button */}
          <div className="fixed bottom-4 left-4 z-50 flex items-center space-x-2 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200">
            <button
              onClick={handleBackToSelection}
              className="text-xs text-gray-500 hover:text-blue-600 transition-colors"
              title="Back to selection"
            >
              ← Back
            </button>
            <span className="text-gray-600 text-xs px-2 border-l border-gray-300">
              {currentUser} | {inspectionConfig.hangar}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-red-600 transition-colors"
              title="Logout"
            >
              ×
            </button>
          </div>
          <MultiCamInspector 
            selectedInspection={inspectionConfig.inspectionType}
            selectedHangar={inspectionConfig.hangar}
            selectedDrone={inspectionConfig.drone}
          />
        </div>
      )}
    </div>
  );
}

export default App;

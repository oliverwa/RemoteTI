import React, { useState } from 'react';
import MultiCamInspector from './components/MultiCamInspector';
import LoginPage from './components/LoginPage';
import InspectionSelectionScreen from './components/InspectionSelectionScreen';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>('');
  const [selectedInspection, setSelectedInspection] = useState<string | null>(null);

  const handleLogin = (username: string) => {
    setCurrentUser(username);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser('');
    setSelectedInspection(null);
  };

  const handleSelectInspection = (inspectionType: string) => {
    setSelectedInspection(inspectionType);
  };

  const handleBackToSelection = () => {
    setSelectedInspection(null);
  };

  return (
    <div className="App">
      {!isAuthenticated ? (
        <LoginPage onLogin={handleLogin} />
      ) : !selectedInspection ? (
        <InspectionSelectionScreen 
          currentUser={currentUser}
          onSelectInspection={handleSelectInspection}
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
              {currentUser}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-red-600 transition-colors"
              title="Logout"
            >
              ×
            </button>
          </div>
          <MultiCamInspector selectedInspection={selectedInspection} />
        </div>
      )}
    </div>
  );
}

export default App;

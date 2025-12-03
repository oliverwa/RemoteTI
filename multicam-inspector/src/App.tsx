import React, { useState } from 'react';
import MultiCamInspector from './components/MultiCamInspector';
import LoginPage from './components/LoginPage';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>('');

  const handleLogin = (username: string) => {
    setCurrentUser(username);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser('');
  };

  return (
    <div className="App">
      {!isAuthenticated ? (
        <LoginPage onLogin={handleLogin} />
      ) : (
        <div>
          {/* Minimal user indicator in bottom-left corner */}
          <div className="fixed bottom-4 left-4 z-50 flex items-center space-x-2 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200">
            <span className="text-gray-600 text-xs">
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
          <MultiCamInspector />
        </div>
      )}
    </div>
  );
}

export default App;

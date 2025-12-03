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
          {/* Add a simple header with user info and logout */}
          <div className="fixed top-4 right-4 z-50 flex items-center space-x-3 bg-gray-800 px-4 py-2 rounded-lg">
            <span className="text-gray-400 text-sm">
              {currentUser}
            </span>
            <button
              onClick={handleLogout}
              className="px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
            >
              Logout
            </button>
          </div>
          <MultiCamInspector />
        </div>
      )}
    </div>
  );
}

export default App;

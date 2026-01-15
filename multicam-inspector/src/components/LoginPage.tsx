import React, { useState, useEffect } from 'react';
import backgroundImage from '../background.jpg';
import authService from '../services/authService';
import { API_CONFIG } from '../config/api.config';

interface LoginPageProps {
  onLogin: (username: string, userType: 'admin' | 'everdrone' | 'service_partner') => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  // Check if backend is available
  useEffect(() => {
    checkBackendConnection();
  }, []);

  const checkBackendConnection = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/health`);
      setDemoMode(!response.ok);
    } catch {
      setDemoMode(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Demo mode - no authentication
    if (demoMode) {
      const userType = username.toLowerCase().includes('remote') || username.toLowerCase().includes('service') 
        ? 'service_partner' 
        : username.toLowerCase().includes('admin') 
          ? 'admin' 
          : 'everdrone';
      const user = username || (userType === 'admin' ? 'Administrator' : userType === 'everdrone' ? 'Operator' : 'Service Partner');
      onLogin(user, userType);
      return;
    }

    // Real authentication
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await authService.login({ username, password });
      
      if (response.success && response.user) {
        onLogin(response.user.username, response.user.type);
      } else {
        setError(response.message || 'Login failed');
      }
    } catch (err) {
      setError('Unable to connect to server. Running in demo mode.');
      setDemoMode(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative">
      {/* Background image with opacity */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.3
        }}
      />
      {/* Content */}
      <div className="bg-white/95 backdrop-blur-sm p-8 rounded-lg shadow-xl w-96 relative z-10">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Everdrone Inspection
          </h1>
          <p className="text-gray-500 text-sm">
            Technical Inspection System
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>
          
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Demo notice */}
        {demoMode && (
          <div className="text-center mt-6">
            <p className="text-gray-400 text-xs">
              Demo mode - no credentials required
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Username with 'remote' = Remote user, otherwise Everdrone user
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
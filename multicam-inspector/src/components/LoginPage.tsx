import React, { useState } from 'react';
import backgroundImage from '../background.jpg';

interface LoginPageProps {
  onLogin: (username: string, userType: 'everdrone' | 'remote') => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState<'everdrone' | 'remote'>('everdrone');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = username || (userType === 'everdrone' ? 'Operator' : 'Remote User');
    onLogin(user, userType);
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

          {/* User Type Selection */}
          <div className="space-y-2">
            <label className="text-sm text-gray-600 font-medium">User Type</label>
            <div className="flex gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="userType"
                  value="everdrone"
                  checked={userType === 'everdrone'}
                  onChange={(e) => setUserType(e.target.value as 'everdrone' | 'remote')}
                  className="mr-2 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Everdrone User</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="userType"
                  value="remote"
                  checked={userType === 'remote'}
                  onChange={(e) => setUserType(e.target.value as 'everdrone' | 'remote')}
                  className="mr-2 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Remote User</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Sign In
          </button>
        </form>

        {/* Demo notice */}
        <p className="text-center text-gray-400 text-xs mt-6">
          Demo mode - no credentials required
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
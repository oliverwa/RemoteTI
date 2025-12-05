import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from 'lucide-react';

interface BackendConnectionCheckProps {
  children: React.ReactNode;
}

const BackendConnectionCheck: React.FC<BackendConnectionCheckProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const checkBackendConnection = async () => {
    setIsChecking(true);
    
    try {
      // Always use Pi backend when available, fallback to localhost for development
      const apiUrl = 'http://172.20.1.93:3001/api/health';
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(apiUrl, {
        signal: controller.signal,
        method: 'GET'
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        setIsConnected(true);
        setRetryCount(0);
      } else {
        setIsConnected(false);
      }
    } catch (error) {
      console.error('Backend connection check failed:', error);
      setIsConnected(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkBackendConnection();
    
    // Set up periodic health checks every 30 seconds
    const interval = setInterval(() => {
      checkBackendConnection();
    }, 30000);
    
    // Also check on window focus
    const handleFocus = () => {
      checkBackendConnection();
    };
    
    window.addEventListener('focus', handleFocus);
    
    // Check on network status change
    const handleOnline = () => {
      console.log('Network connected, checking backend...');
      setTimeout(() => checkBackendConnection(), 1000);
    };
    
    const handleOffline = () => {
      console.log('Network disconnected');
      setIsConnected(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    checkBackendConnection();
  };

  // Render children with appropriate status indicator
  return (
    <>
      {children}
      
      {/* Initial loading overlay - only shows during first check */}
      {isChecking && isConnected === null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <Wifi className="w-6 h-6 text-blue-600 animate-pulse" />
              <div>
                <p className="font-semibold text-gray-900">Connecting to Backend</p>
                <p className="text-sm text-gray-600">Checking connection...</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warning banner when disconnected */}
      {!isConnected && isConnected !== null && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-500 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <WifiOff className="w-5 h-5" />
                <div>
                  <p className="font-medium">Backend Connection Lost</p>
                  <p className="text-xs opacity-90">
                    Some features may not work. Check network connection to 172.20.1.93:3001
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRetry}
                  disabled={isChecking}
                  className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors flex items-center gap-1"
                >
                  {isChecking ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3" />
                      Retry
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Small connection status indicator when connected - moved up to avoid overlap */}
      {isConnected && (
        <div className="fixed bottom-16 right-4 z-40">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-sm border border-gray-200">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-gray-600">Backend Connected</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BackendConnectionCheck;
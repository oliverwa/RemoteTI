import React, { useState } from 'react';
import { X, Settings, MapPin, Plane, Users, FileText, BookOpen } from 'lucide-react';
import UserManagement from './UserManagement';
import HangarsManagement from './admin/HangarsManagement';
import DronesManagement from './admin/DronesManagement';
import InspectionManagement from './admin/InspectionManagement';
import TaskLibraryManager from './admin/TaskLibraryManager';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}


const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'hangars' | 'drones' | 'users' | 'inspections' | 'task-library'>('users');


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="p-6 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Settings className="w-6 h-6" />
              <h2 className="text-2xl font-bold">Admin Panel</h2>
              <span className="text-blue-200 text-sm">System Management</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Tabs */}
          <div className="px-6 pb-0">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('users')}
                className={`flex items-center gap-2 px-4 py-3 rounded-t-lg font-medium transition-colors ${
                  activeTab === 'users'
                    ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300'
                    : 'text-blue-200 hover:text-white hover:bg-white/10 dark:hover:bg-gray-700/20'
                }`}
              >
                <Users className="w-4 h-4" />
                Users
              </button>
              <button
                onClick={() => setActiveTab('hangars')}
                className={`flex items-center gap-2 px-4 py-3 rounded-t-lg font-medium transition-colors ${
                  activeTab === 'hangars'
                    ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300'
                    : 'text-blue-200 hover:text-white hover:bg-white/10 dark:hover:bg-gray-700/20'
                }`}
              >
                <MapPin className="w-4 h-4" />
                Hangars
              </button>
              <button
                onClick={() => setActiveTab('drones')}
                className={`flex items-center gap-2 px-4 py-3 rounded-t-lg font-medium transition-colors ${
                  activeTab === 'drones'
                    ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300'
                    : 'text-blue-200 hover:text-white hover:bg-white/10 dark:hover:bg-gray-700/20'
                }`}
              >
                <Plane className="w-4 h-4" />
                Drones
              </button>
              <button
                onClick={() => setActiveTab('task-library')}
                className={`flex items-center gap-2 px-4 py-3 rounded-t-lg font-medium transition-colors ${
                  activeTab === 'task-library'
                    ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300'
                    : 'text-blue-200 hover:text-white hover:bg-white/10 dark:hover:bg-gray-700/20'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                Task Library
              </button>
              <button
                onClick={() => setActiveTab('inspections')}
                className={`flex items-center gap-2 px-4 py-3 rounded-t-lg font-medium transition-colors ${
                  activeTab === 'inspections'
                    ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300'
                    : 'text-blue-200 hover:text-white hover:bg-white/10 dark:hover:bg-gray-700/20'
                }`}
              >
                <FileText className="w-4 h-4" />
                Inspections
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* User Management Tab */}
          {activeTab === 'users' && (
            <UserManagement />
          )}

          {/* Hangars Management Tab */}
          {activeTab === 'hangars' && (
            <HangarsManagement />
          )}

          {/* Drones Management Tab */}
          {activeTab === 'drones' && (
            <DronesManagement />
          )}

          {/* Task Library Tab */}
          {activeTab === 'task-library' && (
            <TaskLibraryManager />
          )}

          {/* Inspections Management Tab */}
          {activeTab === 'inspections' && (
            <InspectionManagement />
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
import React, { useState, useEffect } from 'react';
import { X, Settings, Plane, ChevronDown, Edit2, Check, Power, MapPin, Wrench, HardHat, Clock } from 'lucide-react';
import { HANGARS, DRONE_OPTIONS } from '../constants';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HangarData {
  id: string;
  label: string;
  assignedDrone: string;
  operational: boolean;
  status: 'operational' | 'maintenance' | 'construction';
  lastOnsiteTI?: string | null;
  lastExtendedTI?: string | null;
  lastService?: string | null;
}

interface DroneData {
  id: string;
  label: string;
  currentHangar?: string;
  status: 'available' | 'assigned' | 'maintenance';
}

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const [hangars, setHangars] = useState<HangarData[]>([]);
  const [drones, setDrones] = useState<DroneData[]>([]);
  const [editingHangar, setEditingHangar] = useState<string | null>(null);
  const [editingHangarName, setEditingHangarName] = useState<string>('');
  const [maintenanceHistory, setMaintenanceHistory] = useState<any>({});

  // Initialize data from constants
  useEffect(() => {
    // Fetch maintenance history
    fetchMaintenanceHistory();
    
    // Load hangars from constants
    const hangarData: HangarData[] = HANGARS.map(h => ({
      id: h.id,
      label: h.label,
      assignedDrone: h.assignedDrone || '',
      operational: h.operational !== false,
      status: (h.operational === false ? 'construction' : 'operational') as 'operational' | 'maintenance' | 'construction'
    }));
    setHangars(hangarData);

    // Load drones and determine their current assignments
    const droneData: DroneData[] = DRONE_OPTIONS.map(d => {
      const assignedHangar = HANGARS.find(h => h.assignedDrone === d.id);
      return {
        id: d.id,
        label: d.label,
        currentHangar: assignedHangar?.id,
        status: (assignedHangar ? 'assigned' : 'available') as 'available' | 'assigned' | 'maintenance'
      };
    });
    setDrones(droneData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDroneAssignment = (hangarId: string, droneId: string) => {
    // Update drones state
    setDrones(prev => prev.map(d => {
      if (d.id === droneId) {
        return { ...d, currentHangar: droneId === '' ? undefined : hangarId, status: droneId === '' ? 'available' : 'assigned' };
      }
      // If this drone was previously in the target hangar, make it available
      if (d.currentHangar === hangarId && d.id !== droneId) {
        return { ...d, currentHangar: undefined, status: 'available' };
      }
      return d;
    }));

    // Update hangars state
    setHangars(prev => prev.map(h => {
      // Clear any hangar that had this drone
      if (h.assignedDrone === droneId && h.id !== hangarId) {
        return { ...h, assignedDrone: '' };
      }
      // Assign drone to the target hangar
      if (h.id === hangarId) {
        return { ...h, assignedDrone: droneId };
      }
      return h;
    }));
  };

  const cycleHangarStatus = (hangarId: string) => {
    setHangars(prev => {
      const updated = prev.map(h => {
        if (h.id === hangarId) {
          let newStatus: 'operational' | 'maintenance' | 'construction';
          const currentStatus = h.status || 'operational';
          console.log('Current status:', currentStatus);
          
          switch (currentStatus) {
            case 'operational':
              newStatus = 'maintenance';
              break;
            case 'maintenance':
              newStatus = 'construction';
              break;
            case 'construction':
              newStatus = 'operational';
              break;
            default:
              // Fallback for any undefined status
              newStatus = 'maintenance';
              break;
          }
          console.log('New status:', newStatus);
          return { ...h, status: newStatus, operational: newStatus === 'operational' };
        }
        return h;
      });
      return updated;
    });
  };

  const handleEditHangarName = (hangarId: string) => {
    const hangar = hangars.find(h => h.id === hangarId);
    if (hangar) {
      setEditingHangar(hangarId);
      setEditingHangarName(hangar.label);
    }
  };

  const saveHangarName = () => {
    if (!editingHangar || !editingHangarName.trim()) return;

    setHangars(prev => prev.map(h => {
      if (h.id === editingHangar) {
        return { ...h, label: editingHangarName.trim() };
      }
      return h;
    }));

    setEditingHangar(null);
    setEditingHangarName('');
  };

  const getAvailableDronesForHangar = (hangarId: string) => {
    const currentDrone = hangars.find(h => h.id === hangarId)?.assignedDrone;
    return drones.filter(d => d.status === 'available' || d.id === currentDrone);
  };

  const fetchMaintenanceHistory = async () => {
    try {
      const response = await fetch('http://172.20.1.93:3001/api/maintenance-history');
      if (response.ok) {
        const data = await response.json();
        setMaintenanceHistory(data);
        
        // Update hangar data with maintenance history for assigned drones
        setHangars(prev => prev.map(h => ({
          ...h,
          lastOnsiteTI: (h.assignedDrone && data[h.assignedDrone]) ? data[h.assignedDrone].lastOnsiteTI : null,
          lastExtendedTI: (h.assignedDrone && data[h.assignedDrone]) ? data[h.assignedDrone].lastExtendedTI : null,
          lastService: (h.assignedDrone && data[h.assignedDrone]) ? data[h.assignedDrone].lastService : null
        })));
      }
    } catch (error) {
      console.error('Failed to fetch maintenance history:', error);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 30) {
      return `${diffDays} days ago`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months > 1 ? 's' : ''} ago`;
    } else {
      const years = Math.floor(diffDays / 365);
      return `${years} year${years > 1 ? 's' : ''} ago`;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6" />
            <h2 className="text-2xl font-bold">Admin Panel</h2>
            <span className="text-blue-200 text-sm">Hangar & Drone Management</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-88px)]">
          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600 font-medium">Operational</p>
                  <p className="text-2xl font-bold text-green-700">{hangars.filter(h => h.status === 'operational').length}</p>
                </div>
                <Power className="w-8 h-8 text-green-500" />
              </div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-600 font-medium">Maintenance</p>
                  <p className="text-2xl font-bold text-yellow-700">{hangars.filter(h => h.status === 'maintenance').length}</p>
                </div>
                <Wrench className="w-8 h-8 text-yellow-500" />
              </div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-600 font-medium">Construction</p>
                  <p className="text-2xl font-bold text-orange-700">{hangars.filter(h => h.status === 'construction').length}</p>
                </div>
                <HardHat className="w-8 h-8 text-orange-500" />
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">Active Drones</p>
                  <p className="text-2xl font-bold text-blue-700">{drones.filter(d => d.status === 'assigned').length}/{drones.length}</p>
                </div>
                <Plane className="w-8 h-8 text-blue-500" />
              </div>
            </div>
          </div>

          {/* Hangars Grid */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-800">Hangar Locations</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {hangars.map(hangar => {
                const availableDrones = getAvailableDronesForHangar(hangar.id);
                return (
                  <div
                    key={hangar.id}
                    className={`border-2 rounded-xl p-5 transition-all ${
                      hangar.status === 'operational' 
                        ? 'border-green-300 bg-gradient-to-br from-green-50 to-green-100/50'
                        : hangar.status === 'maintenance'
                        ? 'border-yellow-300 bg-gradient-to-br from-yellow-50 to-yellow-100/50'
                        : 'border-orange-300 bg-gradient-to-br from-orange-50 to-orange-100/50'
                    }`}
                  >
                    {/* Hangar Header */}
                    <div className="mb-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          {editingHangar === hangar.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingHangarName}
                                onChange={(e) => setEditingHangarName(e.target.value)}
                                className="px-2 py-1 border rounded text-sm flex-1"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && saveHangarName()}
                              />
                              <button
                                onClick={saveHangarName}
                                className="p-1 hover:bg-green-100 rounded text-green-600"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingHangar(null);
                                  setEditingHangarName('');
                                }}
                                className="p-1 hover:bg-red-100 rounded text-red-600"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-gray-900 text-lg">{hangar.label}</h4>
                              <button
                                onClick={() => handleEditHangarName(hangar.id)}
                                className="p-1 hover:bg-gray-200 rounded opacity-0 hover:opacity-100 transition-opacity"
                              >
                                <Edit2 className="w-3 h-3 text-gray-500" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">{hangar.id}</p>
                    </div>

                    {/* Drone Assignment Dropdown */}
                    <div className="mb-4">
                      <label className="text-xs text-gray-600 font-medium mb-1 block">Assigned Drone</label>
                      <div className="relative">
                        <select
                          value={hangar.assignedDrone}
                          onChange={(e) => handleDroneAssignment(hangar.id, e.target.value)}
                          className={`w-full px-3 py-2 pr-8 border rounded-lg appearance-none cursor-pointer transition-all ${
                            hangar.assignedDrone 
                              ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium' 
                              : 'bg-white border-gray-300 text-gray-500'
                          } hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        >
                          <option value="">No drone assigned</option>
                          {availableDrones.map(drone => (
                            <option key={drone.id} value={drone.id}>
                              {drone.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                      {hangar.assignedDrone && (
                        <div className="flex items-center gap-1 mt-2">
                          <Plane className="w-3 h-3 text-blue-500" />
                          <span className="text-xs text-blue-600">Drone ready for operations</span>
                        </div>
                      )}
                    </div>

                    {/* Status Toggle */}
                    <button
                      onClick={() => cycleHangarStatus(hangar.id)}
                      className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        hangar.status === 'operational'
                          ? 'bg-green-500 text-white hover:bg-green-600'
                          : hangar.status === 'maintenance'
                          ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                          : 'bg-orange-500 text-white hover:bg-orange-600'
                      }`}
                    >
                      {hangar.status === 'operational' ? (
                        <>
                          <Power className="w-4 h-4" />
                          Operational
                        </>
                      ) : hangar.status === 'maintenance' ? (
                        <>
                          <Wrench className="w-4 h-4" />
                          Maintenance
                        </>
                      ) : (
                        <>
                          <HardHat className="w-4 h-4" />
                          Construction
                        </>
                      )}
                    </button>
                    
                    {/* Maintenance History Section */}
                    {hangar.assignedDrone && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Maintenance - {hangar.assignedDrone}
                          </span>
                          <span className="text-[10px] text-gray-500 italic">Auto-detected</span>
                        </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">OnsiteTI:</span>
                          <span className={`font-semibold ${
                            hangar.lastOnsiteTI 
                              ? formatDate(hangar.lastOnsiteTI).includes('month') || formatDate(hangar.lastOnsiteTI).includes('year') 
                                ? 'text-orange-600' 
                                : 'text-green-600'
                              : 'text-gray-400'
                          }`}>
                            {formatDate(hangar.lastOnsiteTI)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">ExtendedTI:</span>
                          <span className={`font-semibold ${
                            hangar.lastExtendedTI 
                              ? formatDate(hangar.lastExtendedTI).includes('month') || formatDate(hangar.lastExtendedTI).includes('year') 
                                ? 'text-orange-600' 
                                : 'text-green-600'
                              : 'text-gray-400'
                          }`}>
                            {formatDate(hangar.lastExtendedTI)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Service:</span>
                          <span className={`font-semibold ${
                            hangar.lastService 
                              ? formatDate(hangar.lastService).includes('month') || formatDate(hangar.lastService).includes('year') 
                                ? 'text-orange-600' 
                                : 'text-green-600'
                              : 'text-gray-400'
                          }`}>
                            {formatDate(hangar.lastService)}
                          </span>
                        </div>
                      </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Drone Overview */}
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <Plane className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-800">Drone Fleet Overview</h3>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {drones.map(drone => {
                  const assignedHangar = hangars.find(h => h.assignedDrone === drone.id);
                  return (
                    <div
                      key={drone.id}
                      className={`px-3 py-2 rounded-lg border ${
                        assignedHangar 
                          ? 'bg-white border-gray-200' 
                          : 'bg-green-50 border-green-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm text-gray-900">{drone.label}</p>
                          {assignedHangar ? (
                            <p className="text-xs text-gray-500">{assignedHangar.label}</p>
                          ) : (
                            <p className="text-xs text-green-600">Available</p>
                          )}
                        </div>
                        <div className={`w-2 h-2 rounded-full ${
                          assignedHangar ? 'bg-blue-500' : 'bg-green-500'
                        }`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Edit2, Trash2, X, Check, Power, Wrench, HardHat, AlertTriangle, Save } from 'lucide-react';
import { HANGARS, DRONE_OPTIONS } from '../../constants';
import { API_CONFIG } from '../../config/api.config';
import authService from '../../services/authService';

interface Hangar {
  id: string;
  label: string;
  assignedDrone?: string;
  operational: boolean;
  status: 'operational' | 'maintenance' | 'construction';
  ipAddress?: string;
  createdAt?: string;
  updatedAt?: string;
}

const HangarsManagement: React.FC = () => {
  const [hangars, setHangars] = useState<Hangar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedHangar, setSelectedHangar] = useState<Hangar | null>(null);
  const [error, setError] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Hangar>>({
    label: '',
    status: 'operational',
    ipAddress: '',
    assignedDrone: '',
  });

  useEffect(() => {
    fetchHangars();
  }, []);

  const fetchHangars = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/hangars`, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch hangars');
      }

      const data = await response.json();
      if (data.success) {
        // Ensure all hangars have a status field
        const hangarsWithStatus = data.hangars.map((h: Hangar) => ({
          ...h,
          status: h.status || (h.operational ? 'operational' : 'construction')
        }));
        setHangars(hangarsWithStatus);
      } else {
        // Fallback to constants if backend doesn't have data yet
        const hangarData: Hangar[] = HANGARS.map(h => ({
          id: h.id,
          label: h.label,
          location: undefined,
          assignedDrone: h.assignedDrone,
          operational: h.operational !== false,
          status: h.operational === false ? 'construction' : 'operational',
          ipAddress: undefined,
          vpnPort: undefined,
        }));
        setHangars(hangarData);
      }
    } catch (error) {
      console.error('Error fetching hangars:', error);
      // Load from constants as fallback
      const hangarData: Hangar[] = HANGARS.map(h => ({
        id: h.id,
        label: h.label,
        location: undefined,
        assignedDrone: h.assignedDrone,
        operational: h.operational !== false,
        status: h.operational === false ? 'construction' : 'operational',
        ipAddress: undefined,
        vpnPort: undefined,
      }));
      setHangars(hangarData);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      label: '',
      status: 'operational',
      ipAddress: '',
      assignedDrone: '',
    });
    setError('');
    setSubmitLoading(false);
  };

  const handleAddHangar = async () => {
    try {
      setSubmitLoading(true);
      setError('');

      if (!formData.label) {
        setError('Hangar name is required');
        return;
      }

      // Generate a new ID
      const newId = `hangar_${formData.label.toLowerCase().replace(/\s+/g, '_')}_vpn`;
      
      const newHangar: Hangar = {
        id: newId,
        label: formData.label,
        assignedDrone: formData.assignedDrone,
        operational: formData.status === 'operational',
        status: formData.status || 'operational',
        ipAddress: formData.ipAddress,
        createdAt: new Date().toISOString(),
      };

      // Send to backend
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/hangars`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`,
        },
        body: JSON.stringify(newHangar),
      });

      if (!response.ok) {
        throw new Error('Failed to create hangar');
      }

      // Add to local state
      setHangars([...hangars, newHangar]);
      setShowAddModal(false);
      resetForm();

      // TODO: Send to backend when API is ready
    } catch (error) {
      setError('Failed to create hangar');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleUpdateHangar = async () => {
    if (!selectedHangar) return;

    try {
      setSubmitLoading(true);
      setError('');

      if (!formData.label) {
        setError('Hangar name is required');
        return;
      }

      const updatedHangar = {
        label: formData.label || selectedHangar.label,
        assignedDrone: formData.assignedDrone,
        status: formData.status || selectedHangar.status,
        operational: formData.status === 'operational',
        ipAddress: formData.ipAddress,
      };

      console.log('Updating hangar:', selectedHangar.id, updatedHangar);
      console.log('Auth token:', authService.getToken());

      // Send to backend
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/hangars/${selectedHangar.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`,
        },
        body: JSON.stringify(updatedHangar),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Update failed:', errorData);
        throw new Error('Failed to update hangar');
      }

      // Update in local state - need to include all fields
      setHangars(hangars.map(h => 
        h.id === selectedHangar.id ? {
          ...selectedHangar,
          ...updatedHangar,
          updatedAt: new Date().toISOString()
        } : h
      ));

      setShowEditModal(false);
      resetForm();
      setSelectedHangar(null);
    } catch (error) {
      console.error('Error updating hangar:', error);
      setError(error instanceof Error ? error.message : 'Failed to update hangar');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteHangar = async () => {
    if (!selectedHangar) return;

    try {
      setSubmitLoading(true);
      setError('');

      // Send to backend
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/hangars/${selectedHangar.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete hangar');
      }

      // Remove from local state
      setHangars(hangars.filter(h => h.id !== selectedHangar.id));
      setShowDeleteModal(false);
      setSelectedHangar(null);
    } catch (error) {
      setError('Failed to delete hangar');
    } finally {
      setSubmitLoading(false);
    }
  };

  const openEditModal = (hangar: Hangar) => {
    setSelectedHangar(hangar);
    setFormData({
      label: hangar.label,
      status: hangar.status,
      ipAddress: hangar.ipAddress || '',
      assignedDrone: hangar.assignedDrone || '',
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (hangar: Hangar) => {
    setSelectedHangar(hangar);
    setShowDeleteModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'construction':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return <Power className="w-4 h-4" />;
      case 'maintenance':
        return <Wrench className="w-4 h-4" />;
      case 'construction':
        return <HardHat className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MapPin className="w-6 h-6 text-gray-600" />
          <h3 className="text-xl font-semibold text-gray-800">Hangar Management</h3>
          <span className="text-gray-500 text-sm">({hangars.length} locations)</span>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Hangar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-600 font-medium">Operational</p>
          <p className="text-2xl font-bold text-green-700">
            {hangars.filter(h => h.status === 'operational').length}
          </p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-600 font-medium">Maintenance</p>
          <p className="text-2xl font-bold text-yellow-700">
            {hangars.filter(h => h.status === 'maintenance').length}
          </p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-sm text-orange-600 font-medium">Under Construction</p>
          <p className="text-2xl font-bold text-orange-700">
            {hangars.filter(h => h.status === 'construction').length}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="text-gray-500">Loading hangars...</div>
        </div>
      ) : (
        /* Hangars Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hangars.map(hangar => (
            <div
              key={hangar.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-semibold text-gray-900">{hangar.label}</h4>
                  <p className="text-xs text-gray-500 mt-1">{hangar.id}</p>
                  {hangar.ipAddress && (
                    <p className="text-sm font-mono text-gray-600 mt-1">IP: {hangar.ipAddress}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEditModal(hangar)}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                    title="Edit hangar"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openDeleteModal(hangar)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    title="Delete hangar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Status:</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(hangar.status || 'operational')}`}>
                    {getStatusIcon(hangar.status || 'operational')}
                    {(hangar.status || 'operational').charAt(0).toUpperCase() + (hangar.status || 'operational').slice(1)}
                  </span>
                </div>

                {hangar.assignedDrone && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Drone:</span>
                    <span className="text-sm font-medium text-blue-600">{hangar.assignedDrone}</span>
                  </div>
                )}

              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Add New Hangar</h3>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hangar Name</label>
                  <input
                    type="text"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter hangar name"
                  />
                </div>


                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Hangar['status'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="operational">Operational</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="construction">Under Construction</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IP Address</label>
                  <input
                    type="text"
                    value={formData.ipAddress}
                    onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="e.g., 10.0.10.113"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Drone</label>
                  <select
                    value={formData.assignedDrone || ''}
                    onChange={(e) => setFormData({ ...formData, assignedDrone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No drone assigned</option>
                    {DRONE_OPTIONS.filter(drone => {
                      // Filter out drones already assigned to other hangars
                      const isAssigned = hangars.some(h => 
                        h.id !== selectedHangar?.id && h.assignedDrone === drone.id
                      );
                      return !isAssigned;
                    }).map(drone => (
                      <option key={drone.id} value={drone.id}>
                        {drone.label}
                      </option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
                  disabled={submitLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddHangar}
                  disabled={submitLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitLoading ? 'Creating...' : 'Create Hangar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedHangar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Edit Hangar</h3>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    resetForm();
                    setSelectedHangar(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hangar Name</label>
                  <input
                    type="text"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>


                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Hangar['status'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="operational">Operational</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="construction">Under Construction</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IP Address</label>
                  <input
                    type="text"
                    value={formData.ipAddress}
                    onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="e.g., 10.0.10.113"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Drone</label>
                  <select
                    value={formData.assignedDrone || ''}
                    onChange={(e) => setFormData({ ...formData, assignedDrone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No drone assigned</option>
                    {DRONE_OPTIONS.filter(drone => {
                      // Filter out drones already assigned to other hangars
                      const isAssigned = hangars.some(h => 
                        h.id !== selectedHangar?.id && h.assignedDrone === drone.id
                      );
                      return !isAssigned;
                    }).map(drone => (
                      <option key={drone.id} value={drone.id}>
                        {drone.label}
                      </option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    resetForm();
                    setSelectedHangar(null);
                  }}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
                  disabled={submitLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateHangar}
                  disabled={submitLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitLoading ? 'Updating...' : 'Update Hangar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && selectedHangar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Delete Hangar</h3>
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedHangar(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                  <p className="text-gray-900 font-medium">Are you sure you want to delete this hangar?</p>
                </div>
                <p className="text-sm text-gray-600 ml-9">
                  Hangar: <span className="font-semibold text-gray-900">{selectedHangar.label}</span>
                  {selectedHangar.ipAddress && <span> (IP: {selectedHangar.ipAddress})</span>}
                </p>
                <p className="text-sm text-red-600 ml-9 mt-2">
                  This action cannot be undone.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm mb-4">
                  <AlertTriangle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedHangar(null);
                  }}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
                  disabled={submitLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteHangar}
                  disabled={submitLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitLoading ? 'Deleting...' : 'Delete Hangar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HangarsManagement;
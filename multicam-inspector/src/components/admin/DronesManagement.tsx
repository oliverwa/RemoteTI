import React, { useState, useEffect } from 'react';
import { Plane, Plus, Edit2, Trash2, X, Check, AlertTriangle, Wrench, CheckCircle } from 'lucide-react';
import { API_CONFIG } from '../../config/api.config';
import authService from '../../services/authService';

interface Drone {
  id: string;
  label: string;
  serialNumber?: string;
  model?: string;
  status: 'available' | 'assigned' | 'maintenance' | 'retired';
  currentHangar?: string;
  lastMaintenanceDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

const DronesManagement: React.FC = () => {
  const [drones, setDrones] = useState<Drone[]>([]);
  const [hangars, setHangars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedDrone, setSelectedDrone] = useState<Drone | null>(null);
  const [error, setError] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Drone>>({
    label: '',
    serialNumber: '',
    model: '',
    status: 'available',
  });

  useEffect(() => {
    fetchDrones();
    fetchHangars();
  }, []);

  const fetchDrones = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/drones`, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      const data = await response.json();
      if (data.success && data.drones) {
        setDrones(data.drones);
      } else {
        throw new Error(data.message || 'Failed to fetch drones');
      }
    } catch (error) {
      console.error('Error fetching drones:', error);
      setError('Failed to load drones');
    } finally {
      setLoading(false);
    }
  };

  const fetchHangars = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/hangars`, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      const data = await response.json();
      if (data.hangars) {
        setHangars(data.hangars);
      }
    } catch (error) {
      console.error('Error fetching hangars:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      label: '',
      serialNumber: '',
      model: '',
      status: 'available',
    });
    setError('');
    setSubmitLoading(false);
  };

  const handleAddDrone = async () => {
    try {
      setSubmitLoading(true);
      setError('');

      if (!formData.label) {
        setError('Drone name is required');
        return;
      }

      // Generate a new ID
      const newId = formData.label.toLowerCase().replace(/\s+/g, '_');
      
      const newDrone = {
        id: newId,
        label: formData.label,
        serialNumber: formData.serialNumber,
        model: formData.model,
        status: formData.status || 'available',
      };

      // Send to backend
      console.log('Creating drone:', newDrone);
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/drones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`
        },
        body: JSON.stringify(newDrone)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error:', errorText);
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        // Refresh the list
        await fetchDrones();
        setShowAddModal(false);
        resetForm();
      } else {
        throw new Error(data.message || 'Failed to create drone');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to create drone');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleUpdateDrone = async () => {
    if (!selectedDrone) return;

    try {
      setSubmitLoading(true);
      setError('');

      if (!formData.label) {
        setError('Drone name is required');
        return;
      }

      const updatedDrone = {
        label: formData.label,
        serialNumber: formData.serialNumber,
        model: formData.model,
        status: formData.status,
      };

      // Send to backend
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/drones/${selectedDrone.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`
        },
        body: JSON.stringify(updatedDrone)
      });

      const data = await response.json();
      if (data.success) {
        // Refresh the list
        await fetchDrones();
        setShowEditModal(false);
        resetForm();
        setSelectedDrone(null);
      } else {
        throw new Error(data.message || 'Failed to update drone');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to update drone');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteDrone = async () => {
    if (!selectedDrone) return;

    try {
      setSubmitLoading(true);
      setError('');

      // Send to backend
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/drones/${selectedDrone.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });

      const data = await response.json();
      if (data.success) {
        // Refresh the list
        await fetchDrones();
        setShowDeleteModal(false);
        setSelectedDrone(null);
      } else {
        throw new Error(data.message || 'Failed to delete drone');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to delete drone');
    } finally {
      setSubmitLoading(false);
    }
  };

  const openEditModal = (drone: Drone) => {
    setSelectedDrone(drone);
    setFormData({
      label: drone.label,
      serialNumber: drone.serialNumber,
      model: drone.model,
      status: drone.status,
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (drone: Drone) => {
    setSelectedDrone(drone);
    setShowDeleteModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'assigned':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'retired':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return <CheckCircle className="w-4 h-4" />;
      case 'assigned':
        return <Plane className="w-4 h-4" />;
      case 'maintenance':
        return <Wrench className="w-4 h-4" />;
      default:
        return null;
    }
  };


  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Plane className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Drone Fleet Management</h3>
          <span className="text-gray-500 dark:text-gray-400 text-sm">({drones.length} drones)</span>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Drone
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
          <p className="text-sm text-green-600 dark:text-green-400 font-medium">Available</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">
            {drones.filter(d => d.status === 'available').length}
          </p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Assigned</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
            {drones.filter(d => d.status === 'assigned').length}
          </p>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
          <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">Maintenance</p>
          <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
            {drones.filter(d => d.status === 'maintenance').length}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Total Fleet</p>
          <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{drones.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="text-gray-500 dark:text-gray-400">Loading drones...</div>
        </div>
      ) : (
        /* Drones Table */
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Drone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Current Location</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
              {drones.map(drone => (
                <tr key={drone.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{drone.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{drone.id}</div>
                      {drone.serialNumber && (
                        <div className="text-xs text-gray-400 dark:text-gray-500">SN: {drone.serialNumber}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(drone.status)}`}>
                      {getStatusIcon(drone.status)}
                      {drone.status.charAt(0).toUpperCase() + drone.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {drone.currentHangar ? (
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {hangars.find(h => h.id === drone.currentHangar)?.label || drone.currentHangar}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 italic">Not assigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(drone)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                        title="Edit drone"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openDeleteModal(drone)}
                        className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        title="Delete drone"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add New Drone</h3>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Drone Name</label>
                  <input
                    type="text"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter drone name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter serial number (optional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Everdrone X1 (optional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Drone['status'] })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="available">Available</option>
                    <option value="assigned">Assigned</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="retired">Retired</option>
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
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                  disabled={submitLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddDrone}
                  disabled={submitLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitLoading ? 'Creating...' : 'Create Drone'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedDrone && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit Drone</h3>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    resetForm();
                    setSelectedDrone(null);
                  }}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Drone Name</label>
                  <input
                    type="text"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter serial number (optional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Everdrone X1 (optional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Drone['status'] })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="available">Available</option>
                    <option value="assigned">Assigned</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="retired">Retired</option>
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
                    setSelectedDrone(null);
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                  disabled={submitLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateDrone}
                  disabled={submitLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitLoading ? 'Updating...' : 'Update Drone'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && selectedDrone && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delete Drone</h3>
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedDrone(null);
                  }}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                  <p className="text-gray-900 dark:text-gray-100 font-medium">Are you sure you want to delete this drone?</p>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 ml-9">
                  Drone: <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedDrone.label}</span>
                  {selectedDrone.serialNumber && <span> (SN: {selectedDrone.serialNumber})</span>}
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
                    setSelectedDrone(null);
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                  disabled={submitLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteDrone}
                  disabled={submitLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitLoading ? 'Deleting...' : 'Delete Drone'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DronesManagement;
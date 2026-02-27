import React, { useState, useEffect } from 'react';
import { X, Clock, CheckCircle, AlertCircle, Ban, Loader } from 'lucide-react';
import { API_CONFIG } from '../config/api.config';

interface WorkflowHistorySimpleProps {
  isOpen: boolean;
  onClose: () => void;
}

const WorkflowHistorySimple: React.FC<WorkflowHistorySimpleProps> = ({ isOpen, onClose }) => {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchWorkflows();
    }
  }, [isOpen]);

  const fetchWorkflows = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/workflow-history`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Workflow data received:', data);
        setWorkflows(Array.isArray(data) ? data : []);
      } else {
        setError('Failed to fetch workflows');
        setWorkflows([]);
      }
    } catch (err) {
      console.error('Error fetching workflows:', err);
      setError('Error loading workflows');
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 p-4 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Workflow History (Simple View)</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          )}
          
          {error && (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && workflows.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No workflows found
            </div>
          )}

          {!loading && !error && workflows.length > 0 && (
            <div className="space-y-3">
              {workflows.map((workflow, index) => {
                // Use index as key if id is missing
                const key = workflow?.id || `workflow-${index}`;
                const hangarName = workflow?.hangarName || 'Unknown Hangar';
                const status = workflow?.status || 'unknown';
                const startTime = workflow?.startTime || null;

                return (
                  <div
                    key={key}
                    className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {hangarName}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          Status: {status}
                        </p>
                        {startTime && (
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Started: {new Date(startTime).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div>
                        {status === 'completed' && <CheckCircle className="w-5 h-5 text-green-500" />}
                        {status === 'active' && <Clock className="w-5 h-5 text-blue-500" />}
                        {status === 'cancelled' && <Ban className="w-5 h-5 text-red-500" />}
                        {status === 'unknown' && <AlertCircle className="w-5 h-5 text-gray-400" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkflowHistorySimple;
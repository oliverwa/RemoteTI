import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Activity,
  MapPin,
  Calendar,
  User,
  FileText,
  X,
  Loader,
  Ban,
  Play,
  Pause
} from 'lucide-react';
import { API_CONFIG } from '../config/api.config';

interface WorkflowPhase {
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'skipped' | 'cancelled';
  startTime?: string;
  endTime?: string;
  completedBy?: string;
}

interface WorkflowSession {
  id: string;
  hangarId: string;
  hangarName: string;
  status: 'active' | 'completed' | 'cancelled' | 'failed';
  startTime: string;
  endTime?: string;
  routeDecision?: 'basic' | 'full' | 'onsite';
  phases: {
    [key: string]: WorkflowPhase;
  };
  inspections?: {
    [key: string]: any;
  };
  cancelledBy?: string;
  cancelReason?: string;
}

interface WorkflowHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  hangarId?: string; // Optional: filter by specific hangar
}

const WorkflowHistory: React.FC<WorkflowHistoryProps> = ({ isOpen, onClose, hangarId }) => {
  const [workflows, setWorkflows] = useState<WorkflowSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [cancelModalOpen, setCancelModalOpen] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchWorkflows();
    }
  }, [isOpen, hangarId]);

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const url = hangarId 
        ? `${API_CONFIG.BASE_URL}/api/workflow-history/${hangarId}`
        : `${API_CONFIG.BASE_URL}/api/workflow-history`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        // Ensure data is an array and each workflow has required fields
        const validWorkflows = Array.isArray(data) ? data.filter(w => w && typeof w === 'object').map(w => ({
          ...w,
          status: w.status || 'unknown',
          id: w.id || 'unknown',
          hangarName: w.hangarName || 'Unknown',
          startTime: w.startTime || new Date().toISOString(),
          phases: w.phases || {},
          inspections: w.inspections || {}
        })) : [];
        setWorkflows(validWorkflows);
      } else {
        setWorkflows([]);
      }
    } catch (error) {
      console.error('Failed to fetch workflow history:', error);
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelWorkflow = async (workflowId: string) => {
    setCancelling(true);
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/workflow/${workflowId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ reason: cancelReason })
      });

      if (response.ok) {
        await fetchWorkflows(); // Refresh the list
        setCancelModalOpen(null);
        setCancelReason('');
      }
    } catch (error) {
      console.error('Failed to cancel workflow:', error);
    } finally {
      setCancelling(false);
    }
  };

  const getStatusIcon = (status: string | null | undefined) => {
    if (!status) return <AlertCircle className="w-4 h-4 text-gray-400" />;
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'active':
      case 'in-progress':
        return <Loader className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'cancelled':
        return <Ban className="w-4 h-4 text-red-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-gray-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string | null | undefined) => {
    if (!status) return 'text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-900/20';
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20';
      case 'active':
      case 'in-progress':
        return 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20';
      case 'cancelled':
        return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20';
      case 'failed':
        return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20';
      default:
        return 'text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-900/20';
    }
  };

  const formatDuration = (startTime: string | null | undefined, endTime?: string | null) => {
    if (!startTime) return '-';
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diff = end.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  const getRouteLabel = (route?: string) => {
    switch (route) {
      case 'basic':
        return 'Mission Reset';
      case 'full':
        return 'Full Remote TI';
      case 'onsite':
        return 'Onsite TI';
      default:
        return 'Unknown';
    }
  };

  const filteredWorkflows = React.useMemo(() => {
    if (!Array.isArray(workflows)) return [];
    return workflows.filter(w => {
      if (!w || typeof w !== 'object') return false;
      if (filter === 'all') return true;
      return w.status === filter;
    });
  }, [workflows, filter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Activity className="w-6 h-6" />
              <h2 className="text-xl font-bold">Workflow History</h2>
              {hangarId && (
                <span className="text-blue-200 text-sm">
                  (Filtered by hangar)
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 px-4 py-2">
          <div className="flex gap-2">
            {(['all', 'active', 'completed', 'cancelled'] as const).map(status => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
                <span className="ml-2 text-xs opacity-75">
                  ({Array.isArray(workflows) ? workflows.filter(w => w && (status === 'all' || w.status === status)).length : 0})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-180px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : filteredWorkflows.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No workflows found
            </div>
          ) : (
            <div className="space-y-3">
              {filteredWorkflows.map((workflow) => workflow ? (
                <div
                  key={workflow.id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* Workflow Header */}
                  <div
                    className="p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    onClick={() => setExpandedWorkflow(
                      expandedWorkflow === workflow.id ? null : workflow.id
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedWorkflow === workflow.id ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                        {workflow?.status && getStatusIcon(workflow.status)}
                        <div>
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-gray-400" />
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {workflow.hangarName}
                            </span>
                            {workflow?.status && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(workflow.status)}`}>
                                {workflow.status}
                              </span>
                            )}
                            {workflow.routeDecision && (
                              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                                {getRouteLabel(workflow.routeDecision)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {workflow?.startTime && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(workflow.startTime)}
                              </span>
                            )}
                            {workflow?.startTime && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDuration(workflow.startTime, workflow.endTime)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {workflow?.status === 'active' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCancelModalOpen(workflow.id);
                            }}
                            className="px-3 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium transition-colors"
                          >
                            Cancel Workflow
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedWorkflow === workflow.id && (
                    <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50">
                      {/* Phases Timeline */}
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          Workflow Phases
                        </h4>
                        <div className="space-y-2">
                          {Object.entries(workflow.phases || {})
                            .filter(([_, phase]) => phase !== null && phase !== undefined)
                            .map(([phaseName, phase]: [string, any]) => (
                            <div
                              key={phaseName}
                              className="flex items-center gap-3 p-2 rounded-lg bg-white dark:bg-gray-800"
                            >
                              {phase.status && getStatusIcon(phase.status)}
                              <div className="flex-1">
                                <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                  {phaseName.replace(/([A-Z])/g, ' $1').trim()}
                                </div>
                                {(phase.startTime || phase.completedAt || phase.completedTime || phase.cancelledAt) && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {phase.startTime && `Started: ${formatDate(phase.startTime)}`}
                                    {phase.endTime && ` • Completed: ${formatDate(phase.endTime)}`}
                                    {phase.completedAt && !phase.endTime && ` • Completed: ${formatDate(phase.completedAt)}`}
                                    {phase.completedTime && !phase.endTime && !phase.completedAt && ` • Completed: ${formatDate(phase.completedTime)}`}
                                    {phase.cancelledAt && ` • Cancelled: ${formatDate(phase.cancelledAt)}`}
                                    {phase.completedBy && ` • By: ${phase.completedBy}`}
                                  </div>
                                )}
                              </div>
                              {phase.status && (
                                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(phase.status)}`}>
                                  {phase.status}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Inspections */}
                      {workflow.inspections && Object.keys(workflow.inspections).length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                            Associated Inspections
                          </h4>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(workflow.inspections).map(([type, inspection]: [string, any]) => (
                              <div
                                key={type}
                                className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-gray-800"
                              >
                                <FileText className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-900 dark:text-gray-100">
                                  {type.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                                {inspection.status && (
                                  <span className={`ml-auto px-2 py-0.5 rounded text-xs ${
                                    inspection.status === 'completed' 
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                  }`}>
                                    {inspection.status}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Cancellation Info */}
                      {workflow.status === 'cancelled' && (
                        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                          <div className="flex items-start gap-2">
                            <Ban className="w-4 h-4 text-red-500 mt-0.5" />
                            <div className="text-sm">
                              <div className="font-medium text-red-700 dark:text-red-300">
                                Cancelled by {workflow.cancelledBy || 'Unknown'}
                              </div>
                              {workflow.cancelReason && (
                                <div className="text-red-600 dark:text-red-400 mt-1">
                                  Reason: {workflow.cancelReason}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null)}
            </div>
          )}
        </div>
      </div>

      {/* Cancel Workflow Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Cancel Workflow
              </h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Are you sure you want to cancel this workflow? This action cannot be undone.
              </p>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Reason for cancellation
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                rows={3}
                placeholder="Enter reason for cancellation..."
              />
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => {
                  setCancelModalOpen(null);
                  setCancelReason('');
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCancelWorkflow(cancelModalOpen)}
                disabled={cancelling || !cancelReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {cancelling && <Loader className="w-4 h-4 animate-spin" />}
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowHistory;
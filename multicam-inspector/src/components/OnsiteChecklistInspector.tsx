import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Check, X, ChevronRight, ChevronLeft } from 'lucide-react';

interface Task {
  taskName: string;
  taskNumber: string;
  category: string;
  description: string;
  presetType?: string;
  completion: {
    completedBy: string | null;
    completedAt: string | null;
  };
}

interface InspectionData {
  metadata: {
    author: string;
    version: string;
    created: string;
  };
  completionStatus: {
    status: string;
    startedBy: string | null;
    startedAt: string | null;
    completedBy: string | null;
    completedAt: string | null;
  };
  tasks: Task[];
}

interface OnsiteChecklistInspectorProps {
  selectedInspection: string;
  selectedHangar: string;
  selectedDrone: string;
  currentUser?: string;
}

const OnsiteChecklistInspector: React.FC<OnsiteChecklistInspectorProps> = ({
  selectedInspection,
  selectedHangar,
  selectedDrone,
  currentUser = 'User'
}) => {
  const [inspectionData, setInspectionData] = useState<InspectionData | null>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [taskStatuses, setTaskStatuses] = useState<{ [key: string]: 'pass' | 'fail' | 'pending' }>({});
  const [notes, setNotes] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);

  // Load inspection data
  useEffect(() => {
    const loadInspectionData = async () => {
      try {
        const apiUrl = window.location.hostname === 'localhost' 
          ? `http://localhost:3001/api/inspection-data/${selectedInspection}`
          : `http://172.20.1.93:3001/api/inspection-data/${selectedInspection}`;
        
        const response = await fetch(apiUrl);
        const data = await response.json();
        setInspectionData(data.inspection);
        
        // Initialize task statuses
        const initialStatuses: { [key: string]: 'pass' | 'fail' | 'pending' } = {};
        data.inspection.tasks.forEach((task: Task) => {
          initialStatuses[task.taskNumber] = 'pending';
        });
        setTaskStatuses(initialStatuses);
        
        // Mark inspection as started if not already
        if (data.inspection.completionStatus.status === 'not_started') {
          data.inspection.completionStatus.status = 'in_progress';
          data.inspection.completionStatus.startedBy = currentUser;
          data.inspection.completionStatus.startedAt = new Date().toISOString();
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Failed to load inspection data:', err);
        setLoading(false);
      }
    };

    loadInspectionData();
  }, [selectedInspection, currentUser]);

  const handleTaskStatus = (taskNumber: string, status: 'pass' | 'fail') => {
    setTaskStatuses(prev => ({
      ...prev,
      [taskNumber]: status
    }));
    
    // Update task completion
    if (inspectionData) {
      const taskIndex = inspectionData.tasks.findIndex(t => t.taskNumber === taskNumber);
      if (taskIndex !== -1) {
        const updatedTasks = [...inspectionData.tasks];
        updatedTasks[taskIndex].completion = {
          completedBy: currentUser,
          completedAt: new Date().toISOString()
        };
        setInspectionData({
          ...inspectionData,
          tasks: updatedTasks
        });
      }
    }
  };

  const handleNext = () => {
    if (inspectionData && currentTaskIndex < inspectionData.tasks.length - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentTaskIndex > 0) {
      setCurrentTaskIndex(currentTaskIndex - 1);
    }
  };

  const handleCompleteInspection = () => {
    if (inspectionData) {
      const updatedInspection = {
        ...inspectionData,
        completionStatus: {
          ...inspectionData.completionStatus,
          status: 'completed',
          completedBy: currentUser,
          completedAt: new Date().toISOString()
        }
      };
      setInspectionData(updatedInspection);
      
      // Here you would save to backend
      console.log('Inspection completed:', updatedInspection);
      alert('Inspection completed successfully!');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-lg font-semibold text-gray-700">Loading inspection...</div>
        </div>
      </div>
    );
  }

  if (!inspectionData || !inspectionData.tasks || inspectionData.tasks.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-lg font-semibold text-gray-700">No tasks found in this inspection</div>
        </div>
      </div>
    );
  }

  const currentTask = inspectionData.tasks[currentTaskIndex];
  const completedTasksCount = Object.values(taskStatuses).filter(s => s !== 'pending').length;
  const progressPercentage = (completedTasksCount / inspectionData.tasks.length) * 100;

  // Group tasks by category for overview
  const tasksByCategory = inspectionData.tasks.reduce((acc, task) => {
    if (!acc[task.category]) {
      acc[task.category] = [];
    }
    acc[task.category].push(task);
    return acc;
  }, {} as { [key: string]: Task[] });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Onsite Inspection</h1>
            <p className="text-sm text-gray-600 mt-1">
              {selectedHangar} • {selectedDrone} • {currentUser}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-gray-600">Progress</div>
              <div className="text-lg font-semibold">
                {completedTasksCount} / {inspectionData.tasks.length} tasks
              </div>
            </div>
            <div className="w-32 bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Sidebar - Task List */}
        <div className="w-80 bg-white border-r overflow-y-auto">
          <div className="p-4">
            <h2 className="font-semibold text-gray-900 mb-4">Task Overview</h2>
            {Object.entries(tasksByCategory).map(([category, tasks]) => (
              <div key={category} className="mb-6">
                <h3 className="text-sm font-semibold text-gray-600 mb-2">{category}</h3>
                <div className="space-y-1">
                  {tasks.map((task, idx) => {
                    const globalIdx = inspectionData.tasks.findIndex(t => t.taskNumber === task.taskNumber);
                    const status = taskStatuses[task.taskNumber];
                    return (
                      <button
                        key={task.taskNumber}
                        onClick={() => setCurrentTaskIndex(globalIdx)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                          globalIdx === currentTaskIndex
                            ? 'bg-blue-50 border-blue-300 border'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <span className="text-gray-500">#{task.taskNumber}</span>
                            <span className={globalIdx === currentTaskIndex ? 'font-medium' : ''}>
                              {task.taskName}
                            </span>
                          </span>
                          {status === 'pass' && <Check className="w-4 h-4 text-green-600" />}
                          {status === 'fail' && <X className="w-4 h-4 text-red-600" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content - Current Task */}
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-3xl mx-auto">
            {/* Task Header */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-sm text-gray-500 mb-1">
                    Task #{currentTask.taskNumber} • {currentTask.category}
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">{currentTask.taskName}</h2>
                </div>
                <div className="flex items-center gap-2">
                  {taskStatuses[currentTask.taskNumber] === 'pass' && (
                    <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      Passed
                    </div>
                  )}
                  {taskStatuses[currentTask.taskNumber] === 'fail' && (
                    <div className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                      Failed
                    </div>
                  )}
                  {taskStatuses[currentTask.taskNumber] === 'pending' && (
                    <div className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
                      Pending
                    </div>
                  )}
                </div>
              </div>

              <div className="prose max-w-none">
                <p className="text-gray-700">{currentTask.description}</p>
              </div>
            </div>

            {/* Task Actions */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h3 className="font-semibold text-gray-900 mb-4">Task Status</h3>
              <div className="flex gap-4 mb-6">
                <Button
                  onClick={() => handleTaskStatus(currentTask.taskNumber, 'pass')}
                  className={`flex-1 py-4 text-lg ${
                    taskStatuses[currentTask.taskNumber] === 'pass'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  }`}
                >
                  <Check className="w-5 h-5 mr-2" />
                  Pass
                </Button>
                <Button
                  onClick={() => handleTaskStatus(currentTask.taskNumber, 'fail')}
                  className={`flex-1 py-4 text-lg ${
                    taskStatuses[currentTask.taskNumber] === 'fail'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  }`}
                >
                  <X className="w-5 h-5 mr-2" />
                  Fail
                </Button>
              </div>

              {/* Notes Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes[currentTask.taskNumber] || ''}
                  onChange={(e) => setNotes(prev => ({
                    ...prev,
                    [currentTask.taskNumber]: e.target.value
                  }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={4}
                  placeholder="Add any observations or notes about this task..."
                />
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between items-center">
              <Button
                onClick={handlePrevious}
                disabled={currentTaskIndex === 0}
                className="flex items-center gap-2"
                variant="outline"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>

              {currentTaskIndex === inspectionData.tasks.length - 1 ? (
                <Button
                  onClick={handleCompleteInspection}
                  disabled={completedTasksCount !== inspectionData.tasks.length}
                  className="bg-green-600 hover:bg-green-700 px-6"
                >
                  Complete Inspection
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  className="flex items-center gap-2"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnsiteChecklistInspector;
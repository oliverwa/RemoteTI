import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Check, X, ChevronRight, ChevronLeft } from 'lucide-react';

interface Task {
  id: string;  // Backend ID for the task
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
  action?: 'capture' | 'load' | 'browse' | 'load-session';
}

const OnsiteChecklistInspector: React.FC<OnsiteChecklistInspectorProps> = ({
  selectedInspection,
  selectedHangar,
  selectedDrone,
  currentUser = 'User',
  action
}) => {
  const [inspectionData, setInspectionData] = useState<InspectionData | null>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [taskStatuses, setTaskStatuses] = useState<{ [key: string]: 'pass' | 'fail' | 'pending' }>({});
  const [notes, setNotes] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [sessionFolder, setSessionFolder] = useState<string>('');

  // Load inspection data
  useEffect(() => {
    const loadInspectionData = async () => {
      try {
        let sessionFolderPath = '';
        
        if (action === 'load-session') {
          // Loading existing session - parse hangar|sessionName format
          const [hangarId, sessionName] = selectedHangar.split('|');
          if (hangarId && sessionName) {
            sessionFolderPath = `${hangarId}/${sessionName}`;
            setSessionFolder(sessionFolderPath);
            console.log('Loading existing session:', sessionFolderPath);
          }
        } else {
          // Create new session
          const now = new Date();
          const year = now.getFullYear().toString().slice(-2);
          const month = (now.getMonth() + 1).toString().padStart(2, '0');
          const day = now.getDate().toString().padStart(2, '0');
          const hour = now.getHours().toString().padStart(2, '0');
          const minute = now.getMinutes().toString().padStart(2, '0');
          const second = now.getSeconds().toString().padStart(2, '0');
          const timestamp = `${year}${month}${day}_${hour}${minute}${second}`;
          
          const cleanType = selectedInspection.replace('-ti-inspection', '').replace(/-/g, '_');
          const sessionName = `${cleanType}_${selectedDrone}_${timestamp}`;
          sessionFolderPath = `${selectedHangar}/${sessionName}`;
          setSessionFolder(sessionFolderPath);
          
          console.log('Creating inspection session:', sessionFolderPath);
          
          // Create session and get inspection data
          const createSessionResponse = await fetch('http://172.20.1.93:3001/api/create-inspection-session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              inspectionType: selectedInspection,
              hangar: selectedHangar,
              drone: selectedDrone,
              sessionFolder: sessionFolderPath
            })
          });
          
          if (!createSessionResponse.ok) {
            console.error('Failed to create inspection session');
          }
        }
        
        // Always use Pi backend for consistency
        const apiUrl = `http://172.20.1.93:3001/api/inspection-data/${selectedInspection}`;
        
        console.log('Loading inspection data from:', apiUrl);
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`Failed to load inspection data: ${response.status}`);
        }
        const data = await response.json();
        console.log('Loaded inspection data:', data);
        
        // Handle both response structures (with or without 'inspection' wrapper)
        const inspectionData = data.inspection || data;
        
        // Map the tasks to our expected structure
        const mappedTasks = inspectionData.tasks.map((task: any, index: number) => ({
          id: task.id || `task_${index + 1}`,  // Keep original ID for backend
          taskName: task.title || task.taskName || `Task ${index + 1}`,
          taskNumber: task.id || task.taskNumber || String(index + 1),
          category: task.category || 'General',
          description: task.description || '',
          presetType: task.presetType || '',
          completion: task.completion || {
            completedBy: null,
            completedAt: null
          }
        }));
        
        const formattedData = {
          metadata: inspectionData.metadata || {},
          completionStatus: inspectionData.completionStatus || {
            status: 'not_started',
            startedBy: null,
            startedAt: null,
            completedBy: null,
            completedAt: null
          },
          tasks: mappedTasks
        };
        
        setInspectionData(formattedData);
        
        // Initialize task statuses
        const initialStatuses: { [key: string]: 'pass' | 'fail' | 'pending' } = {};
        const initialNotes: { [key: string]: string } = {};
        
        // First set all tasks to pending
        mappedTasks.forEach((task: Task) => {
          initialStatuses[task.taskNumber] = 'pending';
        });
        
        // If loading an existing session, load the saved progress
        if (action === 'load-session' && sessionFolderPath) {
          try {
            const existingInspectionResponse = await fetch(
              `http://172.20.1.93:3001/api/inspection/${sessionFolderPath}/data`
            );
            if (existingInspectionResponse.ok) {
              const existingData = await existingInspectionResponse.json();
              console.log('Loading existing inspection progress:', existingData);
              
              // Update task statuses and notes from saved data
              if (existingData.tasks) {
                existingData.tasks.forEach((savedTask: any) => {
                  const taskId = savedTask.id || savedTask.taskNumber;
                  
                  // Find corresponding task in the template
                  const templateTask = mappedTasks.find((t: Task) => t.id === taskId || t.taskNumber === taskId);
                  if (templateTask) {
                    // Update completion status
                    if (savedTask.completion?.completedAt) {
                      templateTask.completion = savedTask.completion;
                      // Determine pass/fail based on saved data
                      initialStatuses[templateTask.taskNumber] = savedTask.status || 'pass';
                    }
                    
                    // Load notes if available
                    if (savedTask.notes) {
                      initialNotes[templateTask.taskNumber] = savedTask.notes;
                    }
                  }
                });
                
                // Update formatted data with loaded completion info
                formattedData.tasks = mappedTasks;
                if (existingData.completionStatus) {
                  formattedData.completionStatus = existingData.completionStatus;
                }
                setInspectionData(formattedData);
              }
            }
          } catch (err) {
            console.log('No existing inspection progress found');
          }
        }
        
        setTaskStatuses(initialStatuses);
        setNotes(initialNotes);
        
        // Mark inspection as started if not already
        if (formattedData.completionStatus.status === 'not_started') {
          formattedData.completionStatus.status = 'in_progress';
          formattedData.completionStatus.startedBy = currentUser;
          formattedData.completionStatus.startedAt = new Date().toISOString();
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Failed to load inspection data:', err);
        setLoading(false);
      }
    };

    loadInspectionData();
  }, [selectedInspection, currentUser]);

  const handleTaskStatus = async (taskNumber: string, status: 'pass' | 'fail') => {
    setTaskStatuses(prev => ({
      ...prev,
      [taskNumber]: status
    }));
    
    // Update task completion
    if (inspectionData) {
      const taskIndex = inspectionData.tasks.findIndex(t => t.taskNumber === taskNumber);
      if (taskIndex !== -1) {
        const task = inspectionData.tasks[taskIndex];
        const updatedTasks = [...inspectionData.tasks];
        updatedTasks[taskIndex].completion = {
          completedBy: currentUser,
          completedAt: new Date().toISOString()
        };
        setInspectionData({
          ...inspectionData,
          tasks: updatedTasks
        });
        
        // Update backend if we have session info
        if (sessionFolder && task.id) {
          console.log('Sending task update to backend:', {
            sessionFolder,
            taskId: task.id,
            status,
            url: `http://172.20.1.93:3001/api/inspection/${sessionFolder}/task/${task.id}/status`
          });
          try {
            const response = await fetch(`http://172.20.1.93:3001/api/inspection/${sessionFolder}/task/${task.id}/status`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                status: status,
                completedBy: currentUser,
                comment: notes[taskNumber] || ''
              })
            });
            
            if (response.ok) {
              const result = await response.json();
              console.log(`Task status saved to backend (${result.progress.completed}/${result.progress.total} complete)`);
              
              // Update inspection metadata if completed
              if (result.completionStatus.status === 'completed') {
                console.log('Inspection completed and saved!');
              }
            } else {
              console.error('Failed to save task status to backend');
            }
          } catch (error) {
            console.error('Error updating task status:', error);
          }
        }
        
        // Auto-advance to next task after a short delay
        setTimeout(() => {
          if (taskIndex < inspectionData.tasks.length - 1) {
            setCurrentTaskIndex(taskIndex + 1);
          }
        }, 500);
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Onsite Inspection</h1>
            <p className="text-sm text-gray-600">
              {selectedHangar} • {selectedDrone} • {currentUser}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-gray-700">
              Task {currentTaskIndex + 1} of {inspectionData.tasks.length}
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Sidebar - Task List */}
        <div className="w-64 bg-white border-r overflow-y-auto">
          <div className="p-4">
            <div className="space-y-0.5">
              {inspectionData.tasks.map((task, idx) => {
                const status = taskStatuses[task.taskNumber];
                const isCurrent = idx === currentTaskIndex;
                return (
                  <button
                    key={task.taskNumber}
                    onClick={() => setCurrentTaskIndex(idx)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-all flex items-center gap-2 ${
                      isCurrent
                        ? 'bg-blue-50 text-blue-900 font-medium'
                        : status !== 'pending'
                        ? 'text-gray-600'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      status === 'pass'
                        ? 'border-green-500 bg-green-500'
                        : status === 'fail'
                        ? 'border-red-500 bg-red-500'
                        : isCurrent
                        ? 'border-blue-500'
                        : 'border-gray-300'
                    }`}>
                      {status === 'pass' && <Check className="w-3 h-3 text-white" />}
                      {status === 'fail' && <X className="w-3 h-3 text-white" />}
                      {status === 'pending' && isCurrent && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                    </div>
                    <span className={`truncate ${
                      status !== 'pending' && !isCurrent ? 'line-through opacity-60' : ''
                    }`}>
                      {task.taskName}
                    </span>
                  </button>
                );
              })}
            </div>
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
                  onChange={async (e) => {
                    const newNote = e.target.value;
                    setNotes(prev => ({
                      ...prev,
                      [currentTask.taskNumber]: newNote
                    }));
                    
                    // Update backend if task has been completed
                    if (sessionFolder && currentTask.id && taskStatuses[currentTask.taskNumber] !== 'pending') {
                      try {
                        await fetch(`http://172.20.1.93:3001/api/inspection/${sessionFolder}/task/${currentTask.id}/status`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            status: taskStatuses[currentTask.taskNumber],
                            completedBy: currentUser,
                            comment: newNote
                          })
                        });
                      } catch (error) {
                        console.error('Error updating task comment:', error);
                      }
                    }
                  }}
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
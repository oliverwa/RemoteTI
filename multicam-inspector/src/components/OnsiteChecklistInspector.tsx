import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { ChevronRight, ChevronLeft, Clock, ListTodo, Check, X } from 'lucide-react';
import { API_CONFIG } from '../config/api.config';

interface Task {
  id: string;  // Backend ID for the task
  taskName: string;
  taskNumber: string;
  category: string;
  description: string;
  presetType?: string;
  note?: string;  // Optional note field
  status?: 'pass' | 'fail' | 'pending' | 'na';  // Task status
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
  userType?: 'admin' | 'everdrone' | 'service_partner';
}

const OnsiteChecklistInspector: React.FC<OnsiteChecklistInspectorProps> = ({
  selectedInspection,
  selectedHangar,
  selectedDrone,
  currentUser = 'User',
  action,
  userType = 'admin'
}) => {
  const [inspectionData, setInspectionData] = useState<InspectionData | null>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  
  // Format inspection type for display
  const getInspectionDisplayName = () => {
    switch(selectedInspection) {
      case 'onsite-ti-inspection':
        return 'Onsite Inspection';
      case 'extended-ti-inspection':
        return 'Extended Inspection';
      case 'service-ti-inspection':
        return 'Service Inspection';
      case 'basic-ti-inspection':
      case 'service-partner-inspection':
        return 'Service Partner Inspection';
      case 'remote-ti-inspection':
        return 'Remote Inspection';
      default:
        return 'Inspection';
    }
  };
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
          const createSessionResponse = await fetch(`${API_CONFIG.BASE_URL}/api/create-inspection-session`, {
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
        
        // Load inspection data - either from saved session or template
        let data;
        if (action === 'load-session' && sessionFolderPath) {
          // For existing sessions, load the saved data directly
          const apiUrl = `${API_CONFIG.BASE_URL}/api/inspection/${sessionFolderPath}/data`;
          console.log('Loading saved inspection data from:', apiUrl);
          
          const response = await fetch(apiUrl);
          if (!response.ok) {
            throw new Error(`Failed to load saved inspection data: ${response.status}`);
          }
          data = await response.json();
        } else {
          // For new sessions, load the template
          const apiUrl = `${API_CONFIG.BASE_URL}/api/inspection-data/${selectedInspection}`;
          console.log('Loading inspection template from:', apiUrl);
          
          const response = await fetch(apiUrl);
          if (!response.ok) {
            throw new Error(`Failed to load inspection template: ${response.status}`);
          }
          data = await response.json();
        }
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
          // Load note field from saved data
          note: task.note || '',  
          status: task.status || 'pending',  // Include status field
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
        
        // Initialize task statuses and notes from the loaded data
        mappedTasks.forEach((task: Task) => {
          // Check if task has a saved status (for existing sessions)
          const taskWithStatus = task as any;
          if (taskWithStatus.status) {
            initialStatuses[task.taskNumber] = taskWithStatus.status;
          } else if (task.completion?.completedAt) {
            // If no status but task is completed, default to 'pass'
            initialStatuses[task.taskNumber] = 'pass';
          } else {
            initialStatuses[task.taskNumber] = 'pending';
          }
          
          // Load notes from the task
          if (task.note) {
            initialNotes[task.taskNumber] = task.note;
            console.log(`Loaded note for task ${task.taskNumber}: "${task.note}"`);
          } else {
            console.log(`No note found for task ${task.taskNumber}`);
          }
        });
        
        setTaskStatuses(initialStatuses);
        setNotes(initialNotes);
        
        // Find the first incomplete task and set it as current
        let firstIncompleteIndex = 0;
        for (let i = 0; i < mappedTasks.length; i++) {
          const task = mappedTasks[i];
          const status = initialStatuses[task.taskNumber];
          if (status === 'pending' || !task.completion?.completedAt) {
            firstIncompleteIndex = i;
            break;
          }
        }
        setCurrentTaskIndex(firstIncompleteIndex);
        
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
  }, [selectedInspection, currentUser, action, selectedDrone, selectedHangar]);

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (!inspectionData) return;
    
    switch(event.key) {
      case 'ArrowRight':
        if (currentTaskIndex < inspectionData.tasks.length - 1) {
          setCurrentTaskIndex(prev => prev + 1);
        }
        break;
      case 'ArrowLeft':
        if (currentTaskIndex > 0) {
          setCurrentTaskIndex(prev => prev - 1);
        }
        break;
      case 's':
      case 'S':
        setShowSidebar(prev => !prev);
        break;
    }
  }, [currentTaskIndex, inspectionData]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!inspectionData) return;
      
      // Don't trigger shortcuts when typing in input fields or textareas
      const target = event.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        return;
      }
      
      // Handle P and F keys separately to avoid circular dependency
      if (event.key === 'p' || event.key === 'P') {
        handleTaskStatus(inspectionData.tasks[currentTaskIndex].taskNumber, 'pass');
      } else if (event.key === 'f' || event.key === 'F') {
        handleTaskStatus(inspectionData.tasks[currentTaskIndex].taskNumber, 'fail');
      } else {
        handleKeyPress(event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyPress, currentTaskIndex, inspectionData]);

  const handleTaskStatus = async (taskNumber: string, status: 'pass' | 'fail') => {
    const newStatuses = {
      ...taskStatuses,
      [taskNumber]: status
    };
    setTaskStatuses(newStatuses);
    
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
        
        // Calculate progress and update alarm session
        const completedCount = Object.values(newStatuses).filter(s => s !== 'pending').length;
        const progressPercentage = Math.round((completedCount / inspectionData.tasks.length) * 100);
        
        if (sessionFolder) {
          const [hangarId] = sessionFolder.split('/');
          
          // Update progress in alarm session
          try {
            await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${hangarId}/update-onsite-progress`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                progress: `${progressPercentage}%`
              })
            });
            console.log(`Updated Onsite TI progress to ${progressPercentage}%`);
          } catch (error) {
            console.error('Error updating progress:', error);
          }
        }
        
        // Update backend if we have session info
        if (sessionFolder && task.id) {
          const noteToSend = notes[taskNumber] || '';
          console.log('Sending task update to backend:', {
            sessionFolder,
            taskId: task.id,
            status,
            note: noteToSend,
            url: `${API_CONFIG.BASE_URL}/api/inspection/${sessionFolder}/task/${task.id}/status`
          });
          
          const requestBody = {
            status: status,
            completedBy: currentUser,
            note: noteToSend
          };
          console.log('Request body being sent:', requestBody);
          
          try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/api/inspection/${sessionFolder}/task/${task.id}/status`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody)
            });
            
            if (response.ok) {
              const result = await response.json();
              console.log(`Task status saved to backend (${result.progress.completed}/${result.progress.total} complete)`);
              
              // Update alarm session progress if this is part of an alarm workflow
              if (sessionFolder) {
                try {
                  await fetch(`${API_CONFIG.BASE_URL}/api/inspection/update-progress`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      sessionPath: sessionFolder,
                      progress: result.progress.completed / result.progress.total * 100,
                      tasksCompleted: result.progress.completed,
                      totalTasks: result.progress.total,
                      completed: result.completionStatus.status === 'completed'
                    })
                  });
                  console.log('Alarm session progress updated');
                } catch (error) {
                  console.error('Error updating alarm session progress:', error);
                }
              }
              
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

  const handleCompleteInspection = async () => {
    if (inspectionData && sessionFolder) {
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
      
      // Update the alarm session to mark Onsite TI as completed
      try {
        const [hangarId] = sessionFolder.split('/');
        const progressPercentage = Math.round((completedTasksCount / inspectionData.tasks.length) * 100);
        
        // Update the completion status in the alarm session
        const response = await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${hangarId}/complete-onsite-ti`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            progress: `${progressPercentage}%`,
            completedBy: currentUser,
            completedAt: new Date().toISOString()
          })
        });
        
        console.log('Complete response status:', response.status);
        
        if (response.ok) {
          console.log('Onsite TI marked as completed - navigating to dashboard');
        } else {
          console.error('Server response not OK:', response.status);
        }
      } catch (error) {
        console.error('Error updating alarm session:', error);
      }
      
      // Always navigate back to dashboard regardless of server response
      console.log('Navigating to dashboard...');
      window.location.href = `/?returnToDashboard=true&userType=${userType}`;
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
      {/* Simplified Header */}
      <div className="bg-white border-b">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-gray-900">{getInspectionDisplayName()}</h1>
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-1 rounded hover:bg-gray-100"
                title="Toggle task list"
              >
                <ListTodo className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              <span>{completedTasksCount} / {inspectionData.tasks.length} completed</span>
              <span className="mx-2">•</span>
              <span>{selectedHangar} • {selectedDrone}</span>
            </div>
          </div>
          
          {/* Simplified Progress Dots */}
          <div className="mt-4">
            <div className="flex items-center justify-center gap-1">
              {inspectionData.tasks.map((task, idx) => {
                const status = taskStatuses[task.taskNumber];
                const isCurrent = idx === currentTaskIndex;
                return (
                  <button
                    key={task.taskNumber}
                    onClick={() => setCurrentTaskIndex(idx)}
                    className="p-0.5"
                    title={task.taskName}
                  >
                    <div className={`rounded-full transition-all ${
                      isCurrent ? 'w-3 h-3 ring-2 ring-offset-1' : 'w-2 h-2'
                    } ${
                      status === 'pass' 
                        ? 'bg-green-500' + (isCurrent ? ' ring-green-400' : '')
                        : status === 'fail' 
                        ? 'bg-red-500' + (isCurrent ? ' ring-red-400' : '')
                        : isCurrent 
                        ? 'bg-blue-500 ring-blue-400' 
                        : 'bg-gray-300'
                    }`} />
                  </button>
                );
              })}
            </div>
            
            {/* Thin Progress Bar */}
            <div className="mt-3 mx-auto max-w-xl">
              <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-120px)] relative">
        {/* Collapsible Sidebar - Task List */}
        <div className={`absolute left-0 top-0 h-full bg-white border-r shadow-lg overflow-y-auto transition-all duration-300 z-10 ${
          showSidebar ? 'w-80' : 'w-0'
        }`}>
          {showSidebar && (
            <div className="p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-gray-800">All Tasks</h3>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="p-1 rounded hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1">
                {inspectionData.tasks.map((task, idx) => {
                  const status = taskStatuses[task.taskNumber];
                  const isCurrent = idx === currentTaskIndex;
                  return (
                    <button
                      key={task.taskNumber}
                      onClick={() => {
                        setCurrentTaskIndex(idx);
                        setShowSidebar(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-all flex items-center gap-2 ${
                        isCurrent
                          ? 'bg-blue-50 text-blue-900 font-medium'
                          : status !== 'pending'
                          ? 'text-gray-600'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs text-gray-500 font-mono">{idx + 1}.</span>
                        <span className={`truncate ${
                          status !== 'pending' && !isCurrent ? 'line-through opacity-60' : ''
                        }`}>
                          {task.taskName}
                        </span>
                      </div>
                      <div className="flex-shrink-0">
                        {status === 'pass' && <div className="w-4 h-4 bg-green-500 rounded-full" />}
                        {status === 'fail' && <div className="w-4 h-4 bg-red-500 rounded-full" />}
                        {status === 'pending' && <div className="w-4 h-4 bg-gray-300 rounded-full" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Main Content - Current Task */}
        <div className="flex-1 overflow-y-auto">
          <div className="w-full max-w-3xl mx-auto px-8 py-8">
            {/* Simplified Task Card */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-semibold text-gray-700">{currentTaskIndex + 1}</span>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide">{currentTask.category}</div>
                    <h2 className="text-lg font-semibold text-gray-900">{currentTask.taskName}</h2>
                  </div>
                </div>
                {taskStatuses[currentTask.taskNumber] === 'pass' && (
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
                {taskStatuses[currentTask.taskNumber] === 'fail' && (
                  <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                    <X className="w-4 h-4 text-white" />
                  </div>
                )}
                {taskStatuses[currentTask.taskNumber] === 'pending' && (
                  <div className="w-6 h-6 border border-gray-300 rounded-full" />
                )}
              </div>
              
              {/* Task Description */}
              <div className="mb-6">
                <p className="text-gray-600 leading-relaxed">{currentTask.description}</p>
              </div>
            </div>

            {/* Simplified Task Actions */}
            <div className="mb-6">
              <div className="flex gap-3">
                <Button
                  onClick={() => handleTaskStatus(currentTask.taskNumber, 'pass')}
                  className={`flex-1 py-4 text-lg font-medium transition-all ${
                    taskStatuses[currentTask.taskNumber] === 'pass'
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-white hover:bg-green-50 text-green-600 border border-green-500'
                  }`}
                >
                  <Check className="w-5 h-5 mr-2" />
                  Pass
                </Button>
                <Button
                  onClick={() => handleTaskStatus(currentTask.taskNumber, 'fail')}
                  className={`flex-1 py-4 text-lg font-medium transition-all ${
                    taskStatuses[currentTask.taskNumber] === 'fail'
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-white hover:bg-red-50 text-red-600 border border-red-500'
                  }`}
                >
                  <X className="w-5 h-5 mr-2" />
                  Fail
                </Button>
              </div>

              {/* Notes Section */}
              <div className="mt-4">
                <label className="block text-sm text-gray-600 mb-2">
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
                        await fetch(`${API_CONFIG.BASE_URL}/api/inspection/${sessionFolder}/task/${currentTask.id}/status`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            status: taskStatuses[currentTask.taskNumber],
                            completedBy: currentUser,
                            note: newNote
                          })
                        });
                      } catch (error) {
                        console.error('Error updating task comment:', error);
                      }
                    }
                  }}
                  className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 resize-none"
                  rows={3}
                  placeholder="Add any observations or notes about this task..."
                />
              </div>
            </div>

            {/* Simplified Navigation */}
            <div className="flex justify-between items-center">
              <Button
                onClick={handlePrevious}
                disabled={currentTaskIndex === 0}
                className="flex items-center gap-1 px-4 py-2"
                variant="outline"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>

              <div className="text-center">
                <div className="text-xs text-gray-400">← → Navigate | P Pass | F Fail | S Sidebar</div>
              </div>

              {currentTaskIndex === inspectionData.tasks.length - 1 ? (
                <Button
                  onClick={handleCompleteInspection}
                  disabled={completedTasksCount !== inspectionData.tasks.length}
                  className="bg-green-600 hover:bg-green-700 px-6 py-2 font-medium"
                >
                  Complete Inspection
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  className="flex items-center gap-1 px-6 py-2 bg-blue-600 hover:bg-blue-700"
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
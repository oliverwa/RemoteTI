import React, { useState, useEffect } from 'react';
import { FileText, ChevronDown, ChevronUp, AlertCircle, Plus, Trash2, Check, BookOpen } from 'lucide-react';

interface Task {
  id: string;
  category: string;
  title: string;
  description: string;
  instructions: string[];
  type?: string;
  scheduling?: any;
  consumables?: any[];
  tooling?: any[];
  testing?: any;
}

interface Template {
  inspectionType: string;
  name: string;
  version: string;
  description: string;
  metadata: {
    author: string;
    created: string;
    updated?: string;
    inspectionMode: string;
  };
  tasks: Array<{ id: string; [key: string]: any }>;
}

interface TaskLibrary {
  version: string;
  created: string;
  description: string;
  metadata: {
    author: string;
    totalTasks: number;
    categories: string[];
  };
  tasks: Record<string, Task>;
}

const getTemplateDisplayName = (key: string): string => {
  const displayNames: Record<string, string> = {
    'initial-remote-ti-inspection': 'Initial Remote TI',
    'service-partner-inspection': 'Service Partner',
    'onsite-ti-inspection': 'Onsite TI',
    'full-remote-ti-inspection': 'Full Remote TI',
    'extended-ti-inspection': 'Extended TI',
    'service-inspection': 'Service',
    'mission-reset': 'Mission Reset'
  };
  
  return displayNames[key] || key;
};

const InspectionManagement: React.FC = () => {
  const [templates, setTemplates] = useState<Record<string, Template>>({});
  const [taskLibrary, setTaskLibrary] = useState<TaskLibrary | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [addingTask, setAddingTask] = useState(false);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);

  // Load templates and task library on mount
  useEffect(() => {
    fetchTemplates();
    fetchTaskLibrary();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      setTemplates(data);
      if (!selectedTemplate && Object.keys(data).length > 0) {
        setSelectedTemplate(Object.keys(data)[0]);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      setMessage({ type: 'error', text: 'Failed to load templates' });
    } finally {
      setLoading(false);
    }
  };

  const fetchTaskLibrary = async () => {
    try {
      const response = await fetch('/api/task-library');
      if (!response.ok) throw new Error('Failed to fetch task library');
      const data = await response.json();
      setTaskLibrary(data);
    } catch (error) {
      console.error('Error fetching task library:', error);
      setMessage({ type: 'error', text: 'Failed to load task library' });
    }
  };

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const saveTemplate = async () => {
    if (!selectedTemplate || !templates[selectedTemplate]) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/templates/${selectedTemplate}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templates[selectedTemplate])
      });

      if (!response.ok) throw new Error('Failed to save template');
      
      setMessage({ type: 'success', text: 'Inspection template saved successfully!' });
      setTimeout(() => setMessage(null), 3000);
      setAddingTask(false);
      setSelectedTasks(new Set());
    } catch (error) {
      console.error('Error saving template:', error);
      setMessage({ type: 'error', text: 'Failed to save template' });
    } finally {
      setSaving(false);
    }
  };

  const startAddingTasks = () => {
    if (!selectedTemplate || !taskLibrary) return;
    
    const currentTaskIds = new Set(templates[selectedTemplate].tasks.map(t => t.id));
    const available = Object.values(taskLibrary.tasks).filter(task => !currentTaskIds.has(task.id));
    setAvailableTasks(available);
    setAddingTask(true);
    setSelectedTasks(new Set());
  };

  const addSelectedTasks = () => {
    if (!selectedTemplate || selectedTasks.size === 0) return;

    const tasksToAdd = Array.from(selectedTasks).map(taskId => ({ id: taskId }));
    
    setTemplates(prev => ({
      ...prev,
      [selectedTemplate]: {
        ...prev[selectedTemplate],
        tasks: [...prev[selectedTemplate].tasks, ...tasksToAdd]
      }
    }));

    setAddingTask(false);
    setSelectedTasks(new Set());
    setMessage({ type: 'success', text: `Added ${selectedTasks.size} task(s) to the inspection` });
    setTimeout(() => setMessage(null), 3000);
  };

  const removeTask = (taskId: string) => {
    if (!selectedTemplate) return;

    if (window.confirm(`Remove task ${taskId} from this inspection?`)) {
      setTemplates(prev => ({
        ...prev,
        [selectedTemplate]: {
          ...prev[selectedTemplate],
          tasks: prev[selectedTemplate].tasks.filter(task => task.id !== taskId)
        }
      }));
    }
  };

  const moveTask = (taskId: string, direction: 'up' | 'down') => {
    if (!selectedTemplate) return;

    const tasks = [...templates[selectedTemplate].tasks];
    const index = tasks.findIndex(t => t.id === taskId);
    
    if ((direction === 'up' && index > 0) || (direction === 'down' && index < tasks.length - 1)) {
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      [tasks[index], tasks[newIndex]] = [tasks[newIndex], tasks[index]];
      
      setTemplates(prev => ({
        ...prev,
        [selectedTemplate]: {
          ...prev[selectedTemplate],
          tasks
        }
      }));
    }
  };

  const currentTemplate = selectedTemplate ? templates[selectedTemplate] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Inspection Management</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Organize inspection templates using tasks from the Task Library
          </p>
        </div>
        {currentTemplate && (
          <button
            onClick={saveTemplate}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400'
        }`}>
          {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      {/* Template Selector */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Select Inspection Template
        </label>
        <select
          value={selectedTemplate}
          onChange={(e) => setSelectedTemplate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.keys(templates).map((key) => (
            <option key={key} value={key}>
              {getTemplateDisplayName(key)}
            </option>
          ))}
        </select>
      </div>

      {/* Template Info */}
      {currentTemplate && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
          <div className="space-y-2">
            <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100">{currentTemplate.name}</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">{currentTemplate.description}</p>
            <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span>Version: {currentTemplate.version}</span>
              <span>Mode: {currentTemplate.metadata?.inspectionMode}</span>
              <span>Tasks: {currentTemplate.tasks?.length || 0}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tasks Section */}
      {currentTemplate && taskLibrary && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-100">
              Inspection Tasks ({currentTemplate.tasks?.length || 0})
            </h4>
            {!addingTask && (
              <button
                onClick={startAddingTasks}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Tasks
              </button>
            )}
          </div>

          {/* Add Tasks Mode */}
          {addingTask && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h5 className="font-medium text-blue-900 dark:text-blue-300">
                  Select tasks to add ({selectedTasks.size} selected)
                </h5>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setAddingTask(false);
                      setSelectedTasks(new Set());
                    }}
                    className="px-3 py-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addSelectedTasks}
                    disabled={selectedTasks.size === 0}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Add Selected
                  </button>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {availableTasks.map(task => (
                  <label
                    key={task.id}
                    className="flex items-start gap-3 p-2 hover:bg-white dark:hover:bg-gray-700 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTasks.has(task.id)}
                      onChange={(e) => {
                        const next = new Set(selectedTasks);
                        if (e.target.checked) {
                          next.add(task.id);
                        } else {
                          next.delete(task.id);
                        }
                        setSelectedTasks(next);
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{task.id}</div>
                      <div className="text-sm text-gray-900 dark:text-gray-100">{task.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{task.category}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Task List */}
          <div className="space-y-3">
            {(currentTemplate.tasks || []).map((templateTask, index) => {
              const task = taskLibrary.tasks[templateTask.id];
              if (!task) {
                return (
                  <div key={templateTask.id} className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      <span className="font-medium">Task {templateTask.id} not found in library</span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={templateTask.id}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"
                >
                  {/* Task Header */}
                  <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleTaskExpanded(templateTask.id)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                      >
                        {expandedTasks.has(templateTask.id) ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">#{index + 1}</span>
                      <span className="font-mono text-sm text-blue-600 dark:text-blue-400">{task.id}</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{task.title}</span>
                      <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded">{task.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => moveTask(templateTask.id, 'up')}
                        disabled={index === 0}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveTask(templateTask.id, 'down')}
                        disabled={index === currentTemplate.tasks.length - 1}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeTask(templateTask.id)}
                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-600 dark:text-red-400"
                        title="Remove from inspection"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Task Details (Read-only from library) */}
                  {expandedTasks.has(templateTask.id) && (
                    <div className="p-4 space-y-3 bg-white dark:bg-gray-800">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {task.description}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Instructions</label>
                        <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          {task.instructions.map((instruction, i) => (
                            <div key={i} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300 mb-1">
                              <span className="text-gray-500 dark:text-gray-400">{i + 1}.</span>
                              <span>{instruction}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <BookOpen className="w-3 h-3" />
                        <span>This task is defined in the Task Library. Edit it there to change its content.</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionManagement;
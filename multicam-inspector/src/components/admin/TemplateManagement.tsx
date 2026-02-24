import React, { useState, useEffect } from 'react';
import { Plus, Save, Trash2, Edit2, ChevronDown, ChevronUp, AlertCircle, Check } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  description: string;
  instructions: string[];
  validationBoxes?: Record<string, any>;
  completion?: {
    completedBy: string | null;
    completedAt: string | null;
  };
}

interface Template {
  inspectionType: string;
  name: string;
  version: string;
  description: string;
  metadata: {
    author: string;
    created: string;
    inspectionMode: string;
  };
  tasks: Task[];
}

const getTemplateDisplayName = (key: string): string => {
  // Clean display names for templates
  const displayNames: Record<string, string> = {
    'initial-remote-ti-inspection': 'Initial Remote TI',
    'service-partner-inspection': 'Service Partner',
    'onsite-ti-inspection': 'Onsite TI',
    'full-remote-ti-inspection': 'Full Remote TI',
    'extended-ti-inspection': 'Extended TI',
    'service-inspection': 'Service',
    'alarm_reset': 'Alarm Reset'
  };
  
  return displayNames[key] || key;
};

const TemplateManagement: React.FC = () => {
  const [templates, setTemplates] = useState<Record<string, Template>>({});
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load templates on mount
  useEffect(() => {
    fetchTemplates();
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
      
      setMessage({ type: 'success', text: 'Template saved successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving template:', error);
      setMessage({ type: 'error', text: 'Failed to save template' });
    } finally {
      setSaving(false);
    }
  };

  const updateTask = (taskId: string, field: keyof Task, value: any) => {
    if (!selectedTemplate) return;

    setTemplates(prev => {
      const updatedTemplate = { ...prev[selectedTemplate] };
      const taskIndex = updatedTemplate.tasks.findIndex(t => t.id === taskId);
      
      if (taskIndex !== -1) {
        // If we're changing the ID, we need to update our tracking
        if (field === 'id' && value !== taskId) {
          // Update the expanded tasks set if needed
          setExpandedTasks(prevExpanded => {
            const newExpanded = new Set(prevExpanded);
            if (newExpanded.has(taskId)) {
              newExpanded.delete(taskId);
              newExpanded.add(value);
            }
            return newExpanded;
          });
          
          // Update editing task if needed
          if (editingTask === taskId) {
            setEditingTask(value);
          }
        }
        
        // Update the task
        updatedTemplate.tasks[taskIndex] = {
          ...updatedTemplate.tasks[taskIndex],
          [field]: value
        };
      }
      
      return {
        ...prev,
        [selectedTemplate]: updatedTemplate
      };
    });
  };

  const addTask = () => {
    if (!selectedTemplate) return;

    const newTask: Task = {
      id: `task_${Date.now()}`,
      title: 'New Task',
      description: 'Task description',
      instructions: ['Step 1', 'Step 2', 'Step 3'],
      validationBoxes: {},
      completion: {
        completedBy: null,
        completedAt: null
      }
    };

    setTemplates(prev => ({
      ...prev,
      [selectedTemplate]: {
        ...prev[selectedTemplate],
        tasks: [...(prev[selectedTemplate].tasks || []), newTask]
      }
    }));

    setEditingTask(newTask.id);
    setExpandedTasks(prev => new Set(prev).add(newTask.id));
  };

  const deleteTask = (taskId: string) => {
    if (!selectedTemplate) return;

    if (window.confirm('Are you sure you want to delete this task?')) {
      setTemplates(prev => ({
        ...prev,
        [selectedTemplate]: {
          ...prev[selectedTemplate],
          tasks: (prev[selectedTemplate].tasks || []).filter(task => task.id !== taskId)
        }
      }));
    }
  };

  const moveTask = (taskId: string, direction: 'up' | 'down') => {
    if (!selectedTemplate) return;

    const tasks = [...(templates[selectedTemplate].tasks || [])];
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
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Template Management</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Edit inspection checklist templates that will be used for all future inspections
          </p>
        </div>
        <button
          onClick={saveTemplate}
          disabled={saving || !selectedTemplate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Template
            </>
          )}
        </button>
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
          Select Template
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

      {/* Template Editor */}
      {currentTemplate && (
        <div className="space-y-4">
          {/* Template Info */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4 space-y-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-100">Template Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={currentTemplate.name}
                  onChange={(e) => setTemplates(prev => ({
                    ...prev,
                    [selectedTemplate]: { ...prev[selectedTemplate], name: e.target.value }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">Version</label>
                <input
                  type="text"
                  value={currentTemplate.version}
                  onChange={(e) => setTemplates(prev => ({
                    ...prev,
                    [selectedTemplate]: { ...prev[selectedTemplate], version: e.target.value }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <textarea
                value={currentTemplate.description}
                onChange={(e) => setTemplates(prev => ({
                  ...prev,
                  [selectedTemplate]: { ...prev[selectedTemplate], description: e.target.value }
                }))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4 space-y-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-100">Metadata</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">Author</label>
                <input
                  type="text"
                  value={currentTemplate.metadata?.author || ''}
                  onChange={(e) => setTemplates(prev => ({
                    ...prev,
                    [selectedTemplate]: {
                      ...prev[selectedTemplate],
                      metadata: {
                        ...prev[selectedTemplate].metadata,
                        author: e.target.value
                      }
                    }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">Created Date</label>
                <input
                  type="text"
                  value={currentTemplate.metadata?.created || ''}
                  onChange={(e) => setTemplates(prev => ({
                    ...prev,
                    [selectedTemplate]: {
                      ...prev[selectedTemplate],
                      metadata: {
                        ...prev[selectedTemplate].metadata,
                        created: e.target.value
                      }
                    }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">Inspection Mode</label>
                <select
                  value={currentTemplate.metadata?.inspectionMode || 'remote'}
                  onChange={(e) => setTemplates(prev => ({
                    ...prev,
                    [selectedTemplate]: {
                      ...prev[selectedTemplate],
                      metadata: {
                        ...prev[selectedTemplate].metadata,
                        inspectionMode: e.target.value
                      }
                    }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="remote">Remote</option>
                  <option value="onsite">Onsite</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tasks */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">Tasks ({currentTemplate.tasks?.length || 0})</h4>
              <button
                onClick={addTask}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Task
              </button>
            </div>

            <div className="space-y-3">
              {(currentTemplate.tasks || []).map((task, index) => (
                <div
                  key={task.id}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"
                >
                  {/* Task Header */}
                  <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleTaskExpanded(task.id)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                      >
                        {expandedTasks.has(task.id) ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">#{index + 1}</span>
                      {editingTask === task.id ? (
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => updateTask(task.id, 'title', e.target.value)}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && setEditingTask(null)}
                        />
                      ) : (
                        <span className="font-medium text-gray-900 dark:text-gray-100">{task.title}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingTask(editingTask === task.id ? null : task.id)}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                      >
                        <Edit2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </button>
                      <button
                        onClick={() => moveTask(task.id, 'up')}
                        disabled={index === 0}
                        className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveTask(task.id, 'down')}
                        disabled={index === currentTemplate.tasks.length - 1}
                        className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-600 dark:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Task Details */}
                  {expandedTasks.has(task.id) && (
                    <div className="p-4 space-y-3 bg-gray-50 dark:bg-gray-700">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">Task ID</label>
                        <input
                          type="text"
                          value={task.id}
                          onChange={(e) => updateTask(task.id, 'id', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">Description</label>
                        <textarea
                          value={task.description}
                          onChange={(e) => updateTask(task.id, 'description', e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Detailed description of what needs to be inspected..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-300 mb-1">
                          Instructions (one per line)
                        </label>
                        <textarea
                          value={task.instructions.join('\n')}
                          onChange={(e) => updateTask(task.id, 'instructions', e.target.value.split('\n').filter(Boolean))}
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Step 1: Check...
Step 2: Verify...
Step 3: Document..."
                        />
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Note: Validation boxes can be configured during inspection setup
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateManagement;
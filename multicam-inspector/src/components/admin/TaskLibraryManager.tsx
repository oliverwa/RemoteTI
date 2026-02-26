import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Edit2, Save, X, Search, Plus, AlertCircle, Check, Copy } from 'lucide-react';

interface TaskLibraryTask {
  id: string;
  category: string;
  title: string;
  description: string;
  instructions: string[];
  validationBoxes: Record<string, any>;
  type: 'physical' | 'visual' | 'combined';
  scheduling: Record<string, any>;
  consumables: any[];
  tooling: any[];
  testing: Record<string, any>;
}

interface TaskLibrary {
  tasks: Record<string, TaskLibraryTask>;
}

const TaskLibraryManager: React.FC = () => {
  const [taskLibrary, setTaskLibrary] = useState<TaskLibrary>({ tasks: {} });
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<TaskLibraryTask | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Load task library on mount
  useEffect(() => {
    fetchTaskLibrary();
  }, []);

  const fetchTaskLibrary = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/task-library');
      if (!response.ok) throw new Error('Failed to fetch task library');
      const data = await response.json();
      setTaskLibrary(data);
    } catch (error) {
      console.error('Error fetching task library:', error);
      setMessage({ type: 'error', text: 'Failed to load task library' });
    } finally {
      setLoading(false);
    }
  };

  const saveTask = async (taskId: string) => {
    if (!editingData) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/task-library/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingData)
      });

      if (!response.ok) throw new Error('Failed to save task');
      
      // Update local state
      setTaskLibrary(prev => ({
        ...prev,
        tasks: {
          ...prev.tasks,
          [taskId]: editingData
        }
      }));

      setEditingTask(null);
      setEditingData(null);
      setMessage({ type: 'success', text: 'Task saved and all templates updated!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving task:', error);
      setMessage({ type: 'error', text: 'Failed to save task' });
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (taskId: string) => {
    const task = taskLibrary.tasks[taskId];
    if (!task) {
      console.error(`Task ${taskId} not found in library`);
      return;
    }
    setEditingTask(taskId);
    setEditingData({ ...task });
  };

  const cancelEditing = () => {
    setEditingTask(null);
    setEditingData(null);
  };

  const updateEditingData = (field: keyof TaskLibraryTask, value: any) => {
    if (!editingData) return;
    setEditingData({ ...editingData, [field]: value });
  };

  const addNewTask = () => {
    const newTaskId = `TSK-NEW${Date.now().toString().slice(-3)}`;
    const newTask: TaskLibraryTask = {
      id: newTaskId,
      category: 'Uncategorized',
      title: 'New Task',
      description: 'Task description',
      instructions: ['Step 1'],
      validationBoxes: {},
      type: 'physical',
      scheduling: {},
      consumables: [],
      tooling: [],
      testing: {}
    };

    setTaskLibrary(prev => ({
      ...prev,
      tasks: {
        ...prev.tasks,
        [newTaskId]: newTask
      }
    }));

    startEditing(newTaskId);
  };

  const duplicateTask = (taskId: string) => {
    const originalTask = taskLibrary.tasks[taskId];
    const newTaskId = `${taskId}-COPY`;
    const newTask = {
      ...originalTask,
      id: newTaskId,
      title: `${originalTask.title} (Copy)`
    };

    setTaskLibrary(prev => ({
      ...prev,
      tasks: {
        ...prev.tasks,
        [newTaskId]: newTask
      }
    }));

    startEditing(newTaskId);
  };

  // Group tasks by category
  const tasksByCategory = Object.values(taskLibrary.tasks).reduce((acc, task) => {
    if (!acc[task.category]) acc[task.category] = [];
    acc[task.category].push(task);
    return acc;
  }, {} as Record<string, TaskLibraryTask[]>);

  // Filter tasks based on search
  const filteredTasksByCategory = Object.entries(tasksByCategory).reduce((acc, [category, tasks]) => {
    const filtered = tasks.filter(task => 
      (selectedCategory === 'all' || category === selectedCategory) &&
      (searchTerm === '' || 
       task.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
       task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
       task.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    if (filtered.length > 0) acc[category] = filtered;
    return acc;
  }, {} as Record<string, TaskLibraryTask[]>);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const categories = Object.keys(tasksByCategory).sort();

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
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Task Library</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage all inspection tasks. Changes here will update all templates using these tasks.
        </p>
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

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
        <div className="flex gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search tasks by ID, title, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Add Task Button */}
          <button
            onClick={addNewTask}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Task Categories */}
      <div className="space-y-4">
        {Object.entries(filteredTasksByCategory).map(([category, tasks]) => (
          <div key={category} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
            {/* Category Header */}
            <button
              onClick={() => toggleCategory(category)}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900 dark:text-gray-100">{category}</span>
                <span className="px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs rounded-full">
                  {tasks.length} tasks
                </span>
              </div>
              {expandedCategories.has(category) ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>

            {/* Tasks in Category */}
            {expandedCategories.has(category) && (
              <div className="divide-y divide-gray-200 dark:divide-gray-600">
                {tasks.map(task => (
                  <div key={task.id} className="p-4">
                    {editingTask === task.id && editingData ? (
                      /* Editing Mode */
                      <div className="space-y-4">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">Editing: {task.id}</h4>
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveTask(task.id)}
                              disabled={saving}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                              {saving ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <Save className="w-4 h-4" />
                                  Save
                                </>
                              )}
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                              <X className="w-4 h-4" />
                              Cancel
                            </button>
                          </div>
                        </div>

                        {/* Edit Form */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Task ID</label>
                            <input
                              type="text"
                              value={editingData?.id || ''}
                              onChange={(e) => updateEditingData('id', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                            <select
                              value={editingData?.category || ''}
                              onChange={(e) => updateEditingData('category', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                              <option value="Uncategorized">Uncategorized</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                          <input
                            type="text"
                            value={editingData?.title || ''}
                            onChange={(e) => updateEditingData('title', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                          <textarea
                            value={editingData?.description || ''}
                            onChange={(e) => updateEditingData('description', e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Instructions (one per line)</label>
                          <textarea
                            value={editingData?.instructions?.join('\n') || ''}
                            onChange={(e) => updateEditingData('instructions', e.target.value.split('\n').filter(Boolean))}
                            rows={5}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                          <select
                            value={editingData?.type || 'physical'}
                            onChange={(e) => updateEditingData('type', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          >
                            <option value="physical">Physical</option>
                            <option value="visual">Visual</option>
                            <option value="combined">Combined</option>
                          </select>
                        </div>

                        {/* Future OSO#3 fields can be added here */}
                        <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                          Scheduling, consumables, tooling, and testing fields will be implemented in a future update.
                        </div>
                      </div>
                    ) : (
                      /* View Mode */
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-mono text-sm font-medium text-blue-600 dark:text-blue-400">{task.id}</span>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              task.type === 'physical' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                              task.type === 'visual' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                              'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            }`}>
                              {task.type}
                            </span>
                          </div>
                          <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-1">{task.title}</h5>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{task.description}</p>
                          <div className="mt-2">
                            <span className="text-xs text-gray-500 dark:text-gray-500">
                              {task.instructions.length} instruction{task.instructions.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => duplicateTask(task.id)}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            title="Duplicate task"
                          >
                            <Copy className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          </button>
                          <button
                            onClick={() => startEditing(task.id)}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            title="Edit task"
                          >
                            <Edit2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {Object.keys(filteredTasksByCategory).length === 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {searchTerm || selectedCategory !== 'all' 
              ? 'No tasks found matching your filters.' 
              : 'No tasks in the library yet.'}
          </p>
          {Object.keys(taskLibrary.tasks).length === 0 && (
            <button
              onClick={addNewTask}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add First Task
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TaskLibraryManager;
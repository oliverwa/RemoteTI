import React, { useEffect, useState } from 'react';

interface InspectionType {
  file: string;
  type: string;
  name: string;
  description: string;
  mode: 'remote' | 'onsite';
  taskCount: number;
}

interface InspectionSelectionScreenProps {
  currentUser: string;
  onSelectInspection: (inspectionType: string) => void;
  onLogout: () => void;
}

const InspectionSelectionScreen: React.FC<InspectionSelectionScreenProps> = ({ 
  currentUser, 
  onSelectInspection,
  onLogout 
}) => {
  const [inspectionTypes, setInspectionTypes] = useState<InspectionType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const apiUrl = window.location.hostname === 'localhost' 
      ? 'http://localhost:3001/api/inspection-types'
      : `http://172.20.1.93:3001/api/inspection-types`;
    
    fetch(apiUrl)
      .then(res => res.json())
      .then(data => {
        setInspectionTypes(data);
      })
      .catch(err => console.error('Failed to fetch inspection types:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-8">
          Select Inspection Type
        </h1>
        
        {loading ? (
          <div className="text-center text-gray-500">
            Loading inspection types...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inspectionTypes.map((inspection) => (
              <button
                key={inspection.file}
                onClick={() => onSelectInspection(inspection.file)}
                className="bg-white rounded-lg border-2 border-gray-200 p-6 text-left hover:border-blue-400 hover:shadow-lg transition-all"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {inspection.name}
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  {inspection.description}
                </p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    {inspection.taskCount} tasks
                  </span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    inspection.mode === 'remote' 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {inspection.mode === 'remote' ? 'Remote' : 'Onsite'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
        
        {/* Simple logout at bottom */}
        <div className="mt-8 text-center">
          <button
            onClick={onLogout}
            className="text-sm text-gray-500 hover:text-red-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default InspectionSelectionScreen;
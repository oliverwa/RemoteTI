import React from 'react';
import { Button } from '../ui/button';

// Types
interface Session {
  id: string;
  name: string;
  imageCount: number;
  created: string;
  images: any[];
}

interface HangarData {
  id: string;
  name: string;
  sessions: Session[];
}

// Props interface
interface FolderBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  loadingFolders: boolean;
  availableFolders: HangarData[];
  onLoadSession: (hangarId: string, sessionName: string, images: any[]) => void;
}

export const FolderBrowserModal: React.FC<FolderBrowserModalProps> = ({
  isOpen,
  onClose,
  loadingFolders,
  availableFolders,
  onLoadSession,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-4/5 max-w-4xl max-h-4/5 mx-4 overflow-hidden flex flex-col">
        <h2 className="text-lg font-semibold mb-4">Browse Snapshot Folders</h2>
        
        {loadingFolders ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl mb-2">📁</div>
              <div>Loading folders...</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {availableFolders.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No snapshot folders found
              </div>
            ) : (
              availableFolders.map((hangar) => (
                <div key={hangar.id} className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">
                    📍 {hangar.name}
                  </h3>
                  <div className="grid gap-3 max-h-64 overflow-y-auto">
                    {hangar.sessions.map((session: Session) => (
                      <div 
                        key={session.id}
                        className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => onLoadSession(hangar.id, session.name, session.images)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-gray-900">{session.name}</div>
                            <div className="text-sm text-gray-500">
                              {session.imageCount} images • {new Date(session.created).toLocaleString()}
                            </div>
                          </div>
                          <div className="text-blue-600">
                            →
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        
        <div className="flex gap-2 mt-4 pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="flex-1"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FolderBrowserModal;
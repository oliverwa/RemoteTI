import React, { useState, useEffect, useRef } from 'react';

interface SessionImage {
  path: string;
  sessionName: string;
  cameraId: string;
  timestamp: string;
  selected: boolean;
}

interface CameraGroup {
  cameraId: string;
  images: SessionImage[];
}

interface ImageOverlayAnalyzerProps {
  onClose: () => void;
}

const ImageOverlayAnalyzer: React.FC<ImageOverlayAnalyzerProps> = ({ onClose }) => {
  const [sessionGroups, setSessionGroups] = useState<{ [hangar: string]: string[] }>({});
  const [selectedHangar, setSelectedHangar] = useState<string>('');
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [cameraGroups, setCameraGroups] = useState<CameraGroup[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.5);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Camera IDs based on the naming convention
  const cameraIds = ['FDL', 'FDR', 'FUL', 'FUR', 'RDL', 'RDR', 'RUL', 'RUR'];

  useEffect(() => {
    loadHangarSessions();
  }, []);

  const loadHangarSessions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/overlay-sessions');
      if (response.ok) {
        const data = await response.json();
        setSessionGroups(data.sessionGroups || {});
        // Auto-select first hangar
        const hangars = Object.keys(data.sessionGroups || {});
        if (hangars.length > 0) {
          setSelectedHangar(hangars[0]);
        }
      } else {
        console.error('Failed to load session groups');
      }
    } catch (error) {
      console.error('Error loading session groups:', error);
    }
    setLoading(false);
  };

  const handleSessionToggle = (sessionName: string) => {
    setSelectedSessions(prev => 
      prev.includes(sessionName) 
        ? prev.filter(s => s !== sessionName)
        : [...prev, sessionName]
    );
  };

  const loadSelectedSessionsImages = async () => {
    if (selectedSessions.length === 0 || !selectedHangar) return;

    setLoading(true);
    try {
      const response = await fetch('/api/overlay-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hangar: selectedHangar,
          sessions: selectedSessions
        })
      });

      if (response.ok) {
        const data = await response.json();
        groupImagesByCamera(data.images || []);
      } else {
        console.error('Failed to load session images');
      }
    } catch (error) {
      console.error('Error loading session images:', error);
    }
    setLoading(false);
  };

  const groupImagesByCamera = (images: any[]) => {
    const groups: { [key: string]: SessionImage[] } = {};
    
    images.forEach((img: any) => {
      if (!groups[img.cameraId]) {
        groups[img.cameraId] = [];
      }
      groups[img.cameraId].push({
        path: img.path,
        sessionName: img.sessionName,
        cameraId: img.cameraId,
        timestamp: img.timestamp,
        selected: true
      });
    });

    const cameraGroupArray = Object.keys(groups).map(cameraId => ({
      cameraId,
      images: groups[cameraId].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    }));

    setCameraGroups(cameraGroupArray);
    
    // Auto-select first camera with images
    if (cameraGroupArray.length > 0) {
      setSelectedCamera(cameraGroupArray[0].cameraId);
    }
  };

  const toggleImageSelection = (cameraId: string, imagePath: string) => {
    setCameraGroups(prev => prev.map(group => {
      if (group.cameraId === cameraId) {
        return {
          ...group,
          images: group.images.map(img => 
            img.path === imagePath 
              ? { ...img, selected: !img.selected }
              : img
          )
        };
      }
      return group;
    }));
  };

  const renderOverlay = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentGroup = cameraGroups.find(g => g.cameraId === selectedCamera);
    if (!currentGroup) return;

    const selectedImages = currentGroup.images.filter(img => img.selected);
    if (selectedImages.length === 0) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Load and draw first image at full opacity to set canvas size
    const firstImage = new Image();
    firstImage.crossOrigin = 'anonymous';
    
    return new Promise<void>((resolve) => {
      firstImage.onload = async () => {
        // Set canvas size based on first image
        canvas.width = firstImage.width;
        canvas.height = firstImage.height;
        setCanvasSize({ width: firstImage.width, height: firstImage.height });
        
        // Draw first image at full opacity
        ctx.globalAlpha = 1.0;
        ctx.drawImage(firstImage, 0, 0);

        // Load and overlay remaining images
        for (let i = 1; i < selectedImages.length; i++) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          await new Promise<void>((imgResolve) => {
            img.onload = () => {
              ctx.globalAlpha = overlayOpacity;
              ctx.drawImage(img, 0, 0);
              imgResolve();
            };
            img.src = `/api/image/${encodeURIComponent(selectedImages[i].path)}`;
          });
        }
        
        ctx.globalAlpha = 1.0; // Reset
        resolve();
      };
      
      firstImage.src = `/api/image/${encodeURIComponent(selectedImages[0].path)}`;
    });
  };

  useEffect(() => {
    if (selectedCamera) {
      renderOverlay();
    }
  }, [selectedCamera, cameraGroups, overlayOpacity]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-7xl max-h-screen overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Image Overlay Analyzer</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {/* Session Selection */}
          <div className="col-span-1">
            <h3 className="text-lg font-semibold mb-2">Select Hangar</h3>
            <select
              value={selectedHangar}
              onChange={(e) => setSelectedHangar(e.target.value)}
              className="w-full p-2 border rounded mb-4"
            >
              <option value="">Select Hangar</option>
              {Object.keys(sessionGroups).map(hangar => (
                <option key={hangar} value={hangar}>{hangar}</option>
              ))}
            </select>

            {selectedHangar && (
              <>
                <h3 className="text-lg font-semibold mb-2">Select Sessions</h3>
                <div className="max-h-64 overflow-y-auto border rounded p-2 mb-4">
                  {sessionGroups[selectedHangar]?.map(session => (
                    <label key={session} className="flex items-center mb-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSessions.includes(session)}
                        onChange={() => handleSessionToggle(session)}
                        className="mr-2"
                      />
                      <span className="text-sm">{session}</span>
                    </label>
                  ))}
                </div>
                
                <button
                  onClick={loadSelectedSessionsImages}
                  disabled={selectedSessions.length === 0 || loading}
                  className="w-full bg-blue-500 text-white p-2 rounded disabled:bg-gray-300"
                >
                  {loading ? 'Loading...' : 'Load Images'}
                </button>
              </>
            )}
          </div>

          {/* Camera and Image Selection */}
          <div className="col-span-1">
            <h3 className="text-lg font-semibold mb-2">Select Camera</h3>
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              className="w-full p-2 border rounded mb-4"
            >
              <option value="">Select Camera</option>
              {cameraGroups.map(group => (
                <option key={group.cameraId} value={group.cameraId}>
                  {group.cameraId} ({group.images.length} images)
                </option>
              ))}
            </select>

            {selectedCamera && (
              <>
                <h3 className="text-lg font-semibold mb-2">
                  Images for {selectedCamera}
                </h3>
                <div className="max-h-64 overflow-y-auto border rounded p-2 mb-4">
                  {cameraGroups
                    .find(g => g.cameraId === selectedCamera)
                    ?.images.map(img => (
                      <label key={img.path} className="flex items-center mb-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={img.selected}
                          onChange={() => toggleImageSelection(selectedCamera, img.path)}
                          className="mr-2"
                        />
                        <span className="text-sm">{img.sessionName}</span>
                      </label>
                    ))}
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Overlay Opacity: {Math.round(overlayOpacity * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              </>
            )}
          </div>

          {/* Canvas Display */}
          <div className="col-span-2">
            <h3 className="text-lg font-semibold mb-2">Overlay Visualization</h3>
            <div className="border rounded p-4 bg-gray-50">
              {selectedCamera ? (
                <div className="overflow-auto max-h-96">
                  <canvas
                    ref={canvasRef}
                    style={{
                      maxWidth: '100%',
                      height: 'auto',
                      border: '1px solid #ccc'
                    }}
                  />
                  <div className="mt-2 text-sm text-gray-600">
                    Canvas size: {canvasSize.width} × {canvasSize.height}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 text-gray-500">
                  Select a camera to view overlay visualization
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageOverlayAnalyzer;
import React from 'react';
import { Wifi, Signal, AlertCircle, CheckCircle } from 'lucide-react';

interface ReceptionPanelProps {
  reception?: any;
}

const ReceptionPanel: React.FC<ReceptionPanelProps> = ({ reception }) => {
  if (!reception) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Signal className="h-5 w-5 text-purple-600" />
          <h3 className="font-medium text-gray-900">Network Reception</h3>
        </div>
        <p className="text-sm text-gray-500">No reception data available</p>
      </div>
    );
  }

  // Extract SIM card data
  const simCards = [];
  for (let i = 1; i <= 4; i++) {
    const carrier = reception[`sim${i}Carrier`];
    const rssi = reception[`sim${i}RssiAvg`];
    const snr = reception[`sim${i}SignalToNoiseAvg`];
    const rxLevel = reception[`sim${i}RxLevelAvg`];
    
    if (carrier || rssi !== undefined) {
      simCards.push({
        id: i,
        carrier: carrier || `SIM ${i}`,
        rssi: rssi,
        snr: snr,
        rxLevel: rxLevel
      });
    }
  }

  // Calculate signal quality (simplified assessment)
  const getSignalQuality = (rssi?: number, rxLevel?: number): { level: string; color: string; bars: number } => {
    // Using RSSI as primary indicator (typical values: -30 to -110 dBm)
    const signal = rssi || rxLevel;
    
    if (!signal) return { level: 'Unknown', color: 'text-gray-400', bars: 0 };
    
    if (signal > -50) return { level: 'Excellent', color: 'text-green-600', bars: 4 };
    if (signal > -60) return { level: 'Good', color: 'text-green-500', bars: 3 };
    if (signal > -70) return { level: 'Fair', color: 'text-yellow-600', bars: 2 };
    if (signal > -85) return { level: 'Poor', color: 'text-orange-600', bars: 1 };
    return { level: 'Very Poor', color: 'text-red-600', bars: 0 };
  };

  const getOperatorColor = (carrier: string): string => {
    const normalized = carrier?.toLowerCase() || '';
    if (normalized.includes('tele2')) return 'bg-blue-100 text-blue-800';
    if (normalized.includes('telia') || normalized.includes('teliasonera')) return 'bg-purple-100 text-purple-800';
    if (normalized === '3' || normalized.includes('tre')) return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  // Calculate overall connectivity status
  const avgSignal = simCards.reduce((sum, sim) => sum + (sim.rssi || -100), 0) / simCards.length;
  const overallQuality = getSignalQuality(avgSignal);

  return (
    <div className="bg-white rounded-lg border p-3">
      <div className="flex items-center gap-2 mb-2">
        <Signal className="h-4 w-4 text-purple-600" />
        <h3 className="font-medium text-gray-900 text-sm">Network Reception</h3>
        {reception.haloFirmware && (
          <span className="text-xs text-gray-500 ml-auto">HALO v{reception.haloFirmware}</span>
        )}
      </div>

      <div className="space-y-2">
        {/* SIM Cards Grid - More compact */}
        <div className="grid grid-cols-4 gap-1.5">
          {simCards.map(sim => {
            const quality = getSignalQuality(sim.rssi, sim.rxLevel);
            return (
              <div key={sim.id} className="bg-gray-50 rounded p-1.5 text-center">
                <div className="text-xs font-medium text-gray-600 mb-0.5">SIM {sim.id}</div>
                <div className="mb-1">
                  <span className={`inline-block px-1 py-0 rounded text-xs font-medium ${getOperatorColor(sim.carrier)}`}>
                    {sim.carrier}
                  </span>
                </div>
                <div className="flex gap-0.5 justify-center mb-0.5">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-0.5 h-2.5 rounded-sm ${
                        i < quality.bars ? quality.color.replace('text-', 'bg-') : 'bg-gray-300'
                      }`}
                    />
                  ))}
                </div>
                <div className={`text-xs ${quality.color}`}>
                  {quality.level}
                </div>
              </div>
            );
          })}
        </div>

        {/* Combined Status and Summary - More compact */}
        <div className={`rounded px-2 py-1.5 ${
          overallQuality.bars >= 3 ? 'bg-green-50' : 
          overallQuality.bars >= 2 ? 'bg-yellow-50' : 'bg-orange-50'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {overallQuality.bars >= 3 ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-xs text-green-700">Strong connectivity</span>
                </>
              ) : overallQuality.bars >= 2 ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-yellow-600" />
                  <span className="text-xs text-yellow-700">Moderate signal</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-orange-600" />
                  <span className="text-xs text-orange-700">Weak signal</span>
                </>
              )}
            </div>
            <div className="flex gap-3 text-xs text-gray-600">
              <span>Active: <span className="font-medium">{simCards.length}/4</span></span>
              <span>Avg: <span className="font-medium">{avgSignal.toFixed(1)} dBm</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceptionPanel;
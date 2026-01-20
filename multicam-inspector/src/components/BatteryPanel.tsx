import React, { useMemo } from 'react';
import { Battery, TrendingDown, AlertCircle, CheckCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface BatteryPanelProps {
  battery?: {
    takeOffPercentage?: number;
    takeOffVoltage?: number;
    wpOutStartPercentage?: number;
    wpOutStartVoltage?: number;
    wpHomeStartPercentage?: number;
    wpHomeStartVoltage?: number;
    wpHomeEndPercentage?: number;
    wpHomeEndVoltage?: number;
    landingPercentage?: number;
    landingVoltage?: number;
  };
  flightDuration?: number;
}

const BatteryPanel: React.FC<BatteryPanelProps> = ({ battery, flightDuration }) => {
  const chartData = useMemo(() => {
    if (!battery) return [];

    const totalDuration = flightDuration || 100;
    const takeoffTime = 0;
    const outboundTime = totalDuration * 0.05;
    const returnStartTime = totalDuration * 0.45;
    const returnEndTime = totalDuration * 0.85;
    const landingTime = totalDuration;

    const data = [];
    if (battery.takeOffPercentage !== undefined && battery.takeOffVoltage !== undefined) {
      data.push({ 
        phase: 'Takeoff', 
        time: takeoffTime,
        timeLabel: '0%',
        percentage: battery.takeOffPercentage, 
        voltage: battery.takeOffVoltage 
      });
    }
    if (battery.wpOutStartPercentage !== undefined && battery.wpOutStartVoltage !== undefined) {
      data.push({ 
        phase: 'Outbound', 
        time: outboundTime,
        timeLabel: '5%',
        percentage: battery.wpOutStartPercentage, 
        voltage: battery.wpOutStartVoltage 
      });
    }
    if (battery.wpHomeStartPercentage !== undefined && battery.wpHomeStartVoltage !== undefined) {
      data.push({ 
        phase: 'Return Start', 
        time: returnStartTime,
        timeLabel: '45%',
        percentage: battery.wpHomeStartPercentage, 
        voltage: battery.wpHomeStartVoltage 
      });
    }
    if (battery.wpHomeEndPercentage !== undefined && battery.wpHomeEndVoltage !== undefined) {
      data.push({ 
        phase: 'Return End', 
        time: returnEndTime,
        timeLabel: '85%',
        percentage: battery.wpHomeEndPercentage, 
        voltage: battery.wpHomeEndVoltage 
      });
    }
    if (battery.landingPercentage !== undefined && battery.landingVoltage !== undefined) {
      data.push({ 
        phase: 'Landing', 
        time: landingTime,
        timeLabel: '100%',
        percentage: battery.landingPercentage, 
        voltage: battery.landingVoltage 
      });
    }
    return data;
  }, [battery, flightDuration]);

  if (!battery) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Battery className="h-5 w-5 text-green-600" />
          <h3 className="font-medium text-gray-900">Battery Performance</h3>
        </div>
        <p className="text-sm text-gray-500">No battery data available</p>
      </div>
    );
  }

  const totalUsed = (battery.takeOffPercentage || 100) - (battery.landingPercentage || 0);
  const voltDrop = (battery.takeOffVoltage || 0) - (battery.landingVoltage || 0);

  const getBatteryColor = (percentage: number): string => {
    if (percentage > 60) return 'text-green-600';
    if (percentage > 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getVoltageColor = (voltage: number): string => {
    if (voltage > 22) return 'text-green-600';
    if (voltage > 21) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Battery className="h-5 w-5 text-green-600" />
        <h3 className="font-medium text-gray-900">Battery Performance</h3>
      </div>

      <div className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 rounded p-2">
            <p className="text-xs text-gray-600 mb-1">Total Used</p>
            <p className="text-lg font-semibold text-gray-900">{totalUsed}%</p>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <p className="text-xs text-gray-600 mb-1">Voltage Drop</p>
            <p className="text-lg font-semibold text-gray-900">{voltDrop.toFixed(2)}V</p>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <p className="text-xs text-gray-600 mb-1">Landing</p>
            <p className={`text-lg font-semibold ${getBatteryColor(battery.landingPercentage || 0)}`}>
              {battery.landingPercentage}%
            </p>
          </div>
        </div>

        {/* Battery chart */}
        {chartData.length > 0 && (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 35, left: 35 }}>
                <defs>
                  <linearGradient id="batteryGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time"
                  type="number"
                  domain={[0, flightDuration || 100]}
                  tick={false}
                  axisLine={{ stroke: '#9ca3af' }}
                />
                <XAxis 
                  xAxisId="phase"
                  dataKey="phase" 
                  tick={{ fontSize: 9 }} 
                  angle={-30}
                  textAnchor="end"
                  height={60}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  yAxisId="percentage"
                  domain={[0, 100]}
                  tick={{ fontSize: 10 }}
                  label={{ value: 'Battery %', position: 'insideLeft', angle: -90, style: { fontSize: 10 } }}
                />
                <YAxis 
                  yAxisId="voltage"
                  orientation="right"
                  domain={[20, 24]}
                  tick={{ fontSize: 10 }}
                  label={{ value: 'Voltage (V)', position: 'insideRight', angle: 90, style: { fontSize: 10 } }}
                />
                <Tooltip 
                  contentStyle={{ fontSize: 11, backgroundColor: 'rgba(255,255,255,0.95)' }}
                  formatter={(value: any, name?: string) => {
                    if (name === 'percentage') return [`${value}%`, 'Battery'];
                    if (name === 'voltage') return [`${value.toFixed(2)}V`, 'Voltage'];
                    return [value, name];
                  }}
                  labelFormatter={(label) => chartData.find(d => d.time === label)?.phase || label}
                />
                <Area 
                  yAxisId="percentage"
                  type="monotone" 
                  dataKey="percentage" 
                  stroke="#10b981" 
                  fill="url(#batteryGradient)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#10b981' }}
                />
                <Line 
                  yAxisId="voltage"
                  type="monotone" 
                  dataKey="voltage" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 3, fill: '#3b82f6' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Phase breakdown */}
        <div className="space-y-1 text-xs">
          <div className="flex justify-between py-1 border-t">
            <span className="text-gray-600">Takeoff → Outbound</span>
            <span className="font-medium">
              {((battery.takeOffPercentage || 0) - (battery.wpOutStartPercentage || 0))}% used
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-600">Outbound → Return</span>
            <span className="font-medium">
              {((battery.wpOutStartPercentage || 0) - (battery.wpHomeStartPercentage || 0))}% used
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-600">Return → Landing</span>
            <span className="font-medium">
              {((battery.wpHomeStartPercentage || 0) - (battery.landingPercentage || 0))}% used
            </span>
          </div>
        </div>

        {/* Battery health indicator */}
        <div className={`rounded p-2 ${battery.landingPercentage && battery.landingPercentage > 30 ? 'bg-green-50' : 'bg-yellow-50'}`}>
          <div className="flex items-center gap-2">
            {battery.landingPercentage && battery.landingPercentage > 30 ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-xs text-green-700">Safe landing reserve maintained</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-xs text-yellow-700">Low landing reserve</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatteryPanel;
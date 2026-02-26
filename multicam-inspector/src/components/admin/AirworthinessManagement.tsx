import React, { useState, useEffect } from 'react';
import { Settings, AlertCircle, Clock, Plane, FileText, CheckCircle, Activity, Zap, Gauge, Wind, Thermometer, Battery, TrendingDown, RotateCcw, AlertTriangle } from 'lucide-react';
import { API_CONFIG } from '../../config/api.config';

interface Template {
  filename: string;
  type: string;
  displayName: string;
  dayInterval: number | null;
  airtimeHours: number | null;
}

interface TechnicalLimit {
  id: string;
  name: string;
  metric: string;
  unit: string;
  warningThreshold: number;
  criticalThreshold: number;
  description: string;
  icon: React.ReactNode;
}

const AirworthinessManagement: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  // POC Technical Limitations - hardcoded for now
  const technicalLimits: TechnicalLimit[] = [
    {
      id: 'landing_impact',
      name: 'Landing Impact',
      metric: 'g-force',
      unit: 'G',
      warningThreshold: 1.5,
      criticalThreshold: 2.0,
      description: 'Maximum acceleration force during landing',
      icon: <TrendingDown className="w-3.5 h-3.5" />
    },
    {
      id: 'max_altitude',
      name: 'Max Altitude',
      metric: 'altitude',
      unit: 'm',
      warningThreshold: 110,
      criticalThreshold: 120,
      description: 'Maximum allowed flight altitude',
      icon: <Plane className="w-3.5 h-3.5" />
    },
    {
      id: 'wind_speed',
      name: 'Wind Speed',
      metric: 'wind_speed',
      unit: 'm/s',
      warningThreshold: 12,
      criticalThreshold: 15,
      description: 'Maximum wind speed for safe operation',
      icon: <Wind className="w-3.5 h-3.5" />
    },
    {
      id: 'battery_temp',
      name: 'Battery Temp',
      metric: 'temperature',
      unit: '°C',
      warningThreshold: 45,
      criticalThreshold: 55,
      description: 'Maximum battery operating temperature',
      icon: <Thermometer className="w-3.5 h-3.5" />
    },
    {
      id: 'vibration_level',
      name: 'Vibration',
      metric: 'vibration',
      unit: 'Hz',
      warningThreshold: 80,
      criticalThreshold: 100,
      description: 'Maximum acceptable vibration frequency',
      icon: <Activity className="w-3.5 h-3.5" />
    },
    {
      id: 'motor_current',
      name: 'Motor Current',
      metric: 'current',
      unit: 'A',
      warningThreshold: 25,
      criticalThreshold: 30,
      description: 'Maximum current draw per motor',
      icon: <Zap className="w-3.5 h-3.5" />
    },
    {
      id: 'battery_voltage',
      name: 'Voltage Drop',
      metric: 'voltage_drop',
      unit: 'V',
      warningThreshold: 3.3,
      criticalThreshold: 3.0,
      description: 'Minimum voltage per cell under load',
      icon: <Battery className="w-3.5 h-3.5" />
    },
    {
      id: 'pitch_angle',
      name: 'Max Pitch',
      metric: 'pitch',
      unit: '°',
      warningThreshold: 35,
      criticalThreshold: 45,
      description: 'Maximum pitch angle during flight',
      icon: <RotateCcw className="w-3.5 h-3.5" />
    },
    {
      id: 'gps_accuracy',
      name: 'GPS (HDOP)',
      metric: 'hdop',
      unit: '',
      warningThreshold: 1.5,
      criticalThreshold: 2.5,
      description: 'Horizontal dilution of precision',
      icon: <Gauge className="w-3.5 h-3.5" />
    },
    {
      id: 'flight_time',
      name: 'Flight Time',
      metric: 'flight_duration',
      unit: 'min',
      warningThreshold: 25,
      criticalThreshold: 30,
      description: 'Maximum continuous flight duration',
      icon: <Clock className="w-3.5 h-3.5" />
    }
  ];

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/template-list`);
      
      if (response.ok) {
        const data = await response.json();
        const inspectionTemplates = data.filter((t: Template) => {
          const type = t.type.toLowerCase();
          return type.includes('inspection') || type.includes('ti') || type.includes('service');
        });
        setTemplates(inspectionTemplates);
      } else {
        console.error('Failed to fetch templates');
        setTemplates([]);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  };

  if (templatesLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Airworthiness Limitations
            </h3>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              (View Only)
            </span>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left Column - Template Airworthiness Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              Inspection Intervals
            </h4>
          </div>
          
          <div className="p-2">
            {templates.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400 italic text-center py-2">
                No templates found
              </div>
            ) : (
              <div className="space-y-1">
                {templates.map((template) => {
                  const hasLimits = template.dayInterval !== null || template.airtimeHours !== null;
                  return (
                    <div 
                      key={template.type} 
                      className="flex items-center justify-between p-1.5 rounded bg-gray-50 dark:bg-gray-700/50 text-xs"
                    >
                      <div className="flex items-center gap-1.5 flex-1">
                        {hasLimits ? (
                          <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                        )}
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate" title={template.displayName}>
                          {template.displayName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          <span className="font-medium">{template.dayInterval ?? '-'}</span>
                          {template.dayInterval && <span className="text-[10px]">d</span>}
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Plane className="w-3 h-3" />
                          <span className="font-medium">{template.airtimeHours ?? '-'}</span>
                          {template.airtimeHours !== null && template.airtimeHours > 0 && <span className="text-[10px]">h</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Technical Limitations POC */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1">
                <Activity className="w-3.5 h-3.5" />
                Technical Limits
              </h4>
              <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-[10px] rounded">
                POC
              </span>
            </div>
          </div>
          
          <div className="p-2">
            <div className="grid grid-cols-2 gap-1">
              {technicalLimits.map((limit) => (
                <div 
                  key={limit.id} 
                  className="bg-gray-50 dark:bg-gray-700/50 rounded p-1.5 text-xs"
                  title={limit.description}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 flex-1">
                      <div className="text-gray-500 dark:text-gray-400">
                        {limit.icon}
                      </div>
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {limit.name}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                    <span className="text-yellow-600 dark:text-yellow-400">
                      ⚠ {limit.warningThreshold}{limit.unit}
                    </span>
                    <span className="text-red-600 dark:text-red-400">
                      ⛔ {limit.criticalThreshold}{limit.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Compact Info Bar */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 border border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <p className="text-[10px] text-gray-700 dark:text-gray-300">
            <strong>Inspection intervals</strong> trigger maintenance when exceeded. 
            <strong className="ml-1">Technical limits</strong> will flag telemetry anomalies. 
            <span className="text-red-600 dark:text-red-400 ml-1 font-semibold">Failed inspections = immediate maintenance.</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AirworthinessManagement;
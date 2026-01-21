import React from 'react';
import { Filter, X, Calendar, Plane, AlertCircle, CheckCircle } from 'lucide-react';

interface FlightFiltersProps {
  flights: any[];
  filters: {
    alarmType: string;
    droneName: string;
    dateFrom: string;
    dateTo: string;
    completionStatus: string;
  };
  onFilterChange: (filters: any) => void;
  onClearFilters: () => void;
}

const FlightFilters: React.FC<FlightFiltersProps> = ({ 
  flights, 
  filters, 
  onFilterChange,
  onClearFilters 
}) => {
  // Extract unique values for filter options
  const alarmTypes = Array.from(new Set(flights.map(f => f.alarmType))).filter(Boolean).sort();
  const droneNames = Array.from(new Set(flights.map(f => f.droneName))).filter(Boolean).sort();
  const completionStatuses = Array.from(new Set(flights.map(f => f.completionStatus))).filter(Boolean).sort();
  
  // Get date range
  const dates = flights.map(f => f.date).filter(Boolean);
  const minDate = dates.length > 0 ? dates.reduce((a, b) => a < b ? a : b) : '';
  const maxDate = dates.length > 0 ? dates.reduce((a, b) => a > b ? a : b) : '';
  
  const handleFilterChange = (key: string, value: string) => {
    onFilterChange({
      ...filters,
      [key]: value
    });
  };
  
  const activeFiltersCount = Object.values(filters).filter(v => v !== '').length;
  
  const getStatusColor = (status: string): string => {
    switch(status) {
      case 'normal':
      case 'complete':
        return 'text-green-600';
      case 'motbud':
        return 'text-yellow-600';
      case 'abnormal':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };
  
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-600" />
          <h3 className="font-semibold text-base text-slate-800">Filters</h3>
          {activeFiltersCount > 0 && (
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
              {activeFiltersCount} active
            </span>
          )}
        </div>
        {activeFiltersCount > 0 && (
          <button
            onClick={onClearFilters}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Alarm Type Filter */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
            <AlertCircle className="w-3.5 h-3.5" />
            Alarm Type
          </label>
          <select
            value={filters.alarmType}
            onChange={(e) => handleFilterChange('alarmType', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="">All types</option>
            {alarmTypes.map(type => (
              <option key={type} value={type}>
                {type === 'OHCA' ? 'OHCA (AED)' : type}
              </option>
            ))}
          </select>
        </div>
        
        {/* Drone Filter */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
            <Plane className="w-3.5 h-3.5" />
            Drone
          </label>
          <select
            value={filters.droneName}
            onChange={(e) => handleFilterChange('droneName', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="">All drones</option>
            {droneNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        
        {/* Date From Filter */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
            <Calendar className="w-3.5 h-3.5" />
            From Date
          </label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            min={minDate}
            max={maxDate}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
        </div>
        
        {/* Date To Filter */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
            <Calendar className="w-3.5 h-3.5" />
            To Date
          </label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleFilterChange('dateTo', e.target.value)}
            min={minDate}
            max={maxDate}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
        </div>
        
        {/* Completion Status Filter */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
            <CheckCircle className="w-3.5 h-3.5" />
            Status
          </label>
          <select
            value={filters.completionStatus}
            onChange={(e) => handleFilterChange('completionStatus', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="">All statuses</option>
            {completionStatuses.map(status => (
              <option key={status} value={status}>
                <span className={getStatusColor(status)}>
                  {status}
                </span>
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Filter Summary */}
      {activeFiltersCount > 0 && (
        <div className="pt-4 border-t border-slate-200">
          <div className="flex flex-wrap gap-2.5">
            {filters.alarmType && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                {filters.alarmType}
                <button
                  onClick={() => handleFilterChange('alarmType', '')}
                  className="ml-1 hover:text-blue-900 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            {filters.droneName && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium">
                <Plane className="w-3.5 h-3.5" />
                {filters.droneName}
                <button
                  onClick={() => handleFilterChange('droneName', '')}
                  className="ml-1 hover:text-blue-900 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            {filters.dateFrom && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium">
                <Calendar className="w-3.5 h-3.5" />
                From: {filters.dateFrom}
                <button
                  onClick={() => handleFilterChange('dateFrom', '')}
                  className="ml-1 hover:text-blue-900 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            {filters.dateTo && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium">
                <Calendar className="w-3.5 h-3.5" />
                To: {filters.dateTo}
                <button
                  onClick={() => handleFilterChange('dateTo', '')}
                  className="ml-1 hover:text-blue-900 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            {filters.completionStatus && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium">
                <CheckCircle className="w-3.5 h-3.5" />
                {filters.completionStatus}
                <button
                  onClick={() => handleFilterChange('completionStatus', '')}
                  className="ml-1 hover:text-blue-900 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FlightFilters;
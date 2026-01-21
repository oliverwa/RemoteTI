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
    <div className="bg-gray-50 border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-600" />
          <h3 className="font-semibold text-sm text-gray-700">Filters</h3>
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
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Alarm Type Filter */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
            <AlertCircle className="w-3 h-3" />
            Alarm Type
          </label>
          <select
            value={filters.alarmType}
            onChange={(e) => handleFilterChange('alarmType', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
            <Plane className="w-3 h-3" />
            Drone
          </label>
          <select
            value={filters.droneName}
            onChange={(e) => handleFilterChange('droneName', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All drones</option>
            {droneNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        
        {/* Date From Filter */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
            <Calendar className="w-3 h-3" />
            From Date
          </label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            min={minDate}
            max={maxDate}
            className="w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        {/* Date To Filter */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
            <Calendar className="w-3 h-3" />
            To Date
          </label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleFilterChange('dateTo', e.target.value)}
            min={minDate}
            max={maxDate}
            className="w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        {/* Completion Status Filter */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
            <CheckCircle className="w-3 h-3" />
            Status
          </label>
          <select
            value={filters.completionStatus}
            onChange={(e) => handleFilterChange('completionStatus', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <div className="pt-2 border-t">
          <div className="flex flex-wrap gap-2">
            {filters.alarmType && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                <AlertCircle className="w-3 h-3" />
                {filters.alarmType}
                <button
                  onClick={() => handleFilterChange('alarmType', '')}
                  className="hover:text-blue-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.droneName && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                <Plane className="w-3 h-3" />
                {filters.droneName}
                <button
                  onClick={() => handleFilterChange('droneName', '')}
                  className="hover:text-blue-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.dateFrom && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                <Calendar className="w-3 h-3" />
                From: {filters.dateFrom}
                <button
                  onClick={() => handleFilterChange('dateFrom', '')}
                  className="hover:text-blue-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.dateTo && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                <Calendar className="w-3 h-3" />
                To: {filters.dateTo}
                <button
                  onClick={() => handleFilterChange('dateTo', '')}
                  className="hover:text-blue-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.completionStatus && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                <CheckCircle className="w-3 h-3" />
                {filters.completionStatus}
                <button
                  onClick={() => handleFilterChange('completionStatus', '')}
                  className="hover:text-blue-900"
                >
                  <X className="w-3 h-3" />
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
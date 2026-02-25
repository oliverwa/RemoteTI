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
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-slate-600">
        <Filter className="w-3.5 h-3.5" />
        <span className="text-xs font-medium uppercase tracking-wide">Filters</span>
      </div>
      
      <div className="flex flex-1 items-center gap-2">
        {/* Alarm Type Filter */}
        <div className="flex items-center gap-2">
          <AlertCircle className="w-3 h-3 text-slate-500" />
          <select
            value={filters.alarmType}
            onChange={(e) => handleFilterChange('alarmType', e.target.value)}
            className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50"
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
        <div className="flex items-center gap-2">
          <Plane className="w-3 h-3 text-slate-500" />
          <select
            value={filters.droneName}
            onChange={(e) => handleFilterChange('droneName', e.target.value)}
            className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50"
          >
            <option value="">All drones</option>
            {droneNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        
        {/* Date From Filter */}
        <div className="flex items-center gap-2">
          <Calendar className="w-3 h-3 text-slate-500" />
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            min={minDate}
            max={maxDate}
            placeholder="From"
            className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50"
          />
        </div>
        
        {/* Date To Filter */}
        <div className="flex items-center gap-2">
          <Calendar className="w-3 h-3 text-slate-500" />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleFilterChange('dateTo', e.target.value)}
            min={minDate}
            max={maxDate}
            placeholder="To"
            className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50"
          />
        </div>
        
        {/* Completion Status Filter */}
        <div className="flex items-center gap-2">
          <CheckCircle className="w-3 h-3 text-slate-500" />
          <select
            value={filters.completionStatus}
            onChange={(e) => handleFilterChange('completionStatus', e.target.value)}
            className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50"
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
      
      {/* Clear button */}
      {activeFiltersCount > 0 && (
        <button
          onClick={onClearFilters}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors whitespace-nowrap"
        >
          <X className="w-3 h-3" />
          Clear all
        </button>
      )}
      
      {/* Active filter pills */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            {filters.alarmType && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[11px] font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                {filters.alarmType}
                <button
                  onClick={() => handleFilterChange('alarmType', '')}
                  className="ml-1 hover:text-blue-900 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.droneName && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[11px] font-medium">
                <Plane className="w-3.5 h-3.5" />
                {filters.droneName}
                <button
                  onClick={() => handleFilterChange('droneName', '')}
                  className="ml-1 hover:text-blue-900 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.dateFrom && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[11px] font-medium">
                <Calendar className="w-3.5 h-3.5" />
                From: {filters.dateFrom}
                <button
                  onClick={() => handleFilterChange('dateFrom', '')}
                  className="ml-1 hover:text-blue-900 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.dateTo && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[11px] font-medium">
                <Calendar className="w-3.5 h-3.5" />
                To: {filters.dateTo}
                <button
                  onClick={() => handleFilterChange('dateTo', '')}
                  className="ml-1 hover:text-blue-900 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.completionStatus && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[11px] font-medium">
                <CheckCircle className="w-3.5 h-3.5" />
                {filters.completionStatus}
                <button
                  onClick={() => handleFilterChange('completionStatus', '')}
                  className="ml-1 hover:text-blue-900 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
        </div>
      )}
    </div>
  );
};

export default FlightFilters;
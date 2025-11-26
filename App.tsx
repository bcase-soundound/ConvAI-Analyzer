import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Filter, UploadCloud, FileText, Settings, X, Search, ChevronRight, ChevronDown, Download, RefreshCw, BarChart2 } from 'lucide-react';
import { WORKER_CODE } from './constants';
import { SummaryStats, FilterState, ParsedDataResponse, AnalysisResult } from './types';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import TranscriptAnalysis from './components/TranscriptAnalysis';
import DeeperAnalysis from './components/DeeperAnalysis';

// Initialize Worker from Blob
const createWorker = () => {
  const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
};

const App: React.FC = () => {
  // Application State
  const [worker, setWorker] = useState<Worker | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parseProgress, setParseProgress] = useState<string>('');
  const [error, setError] = useState<string>('');
  
  // Data State
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [customMetrics, setCustomMetrics] = useState<string[]>([]);
  const [filterOptions, setFilterOptions] = useState<Record<string, string[]>>({});
  const [highCardinalityFields, setHighCardinalityFields] = useState<string[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [filteredIndexes, setFilteredIndexes] = useState<number[]>([]);

  // Filter State
  const [filters, setFilters] = useState<FilterState>({});
  const [pagination, setPagination] = useState({ currentPage: 1, rowsPerPage: 100 });
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'ascending' | 'descending' }>({ key: null, direction: 'ascending' });
  
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<'dashboard' | 'analysis' | 'transcript'>('dashboard');
  const [analysisData, setAnalysisData] = useState<any>(null);

  // Setup Worker on Mount
  useEffect(() => {
    const newWorker = createWorker();
    setWorker(newWorker);

    newWorker.onmessage = (e) => {
      const { type, data } = e.data;
      
      switch (type) {
        case 'parse-progress':
          setParseProgress(`Scanned ${Math.round(e.data.loaded / 1024 / 1024)} MB...`);
          break;
        case 'parse-error':
          setIsLoading(false);
          setError(`Failed to parse file: ${e.data.error}`);
          break;
        case 'parse-success':
          setHeaders(e.data.headers);
          setCustomMetrics(e.data.customMetricKeys);
          setFilterOptions(e.data.filterOptions);
          setHighCardinalityFields(e.data.highCardinalityFields);
          // Initial data fetch will be triggered by request-page
          newWorker.postMessage({ 
            type: 'request-page', 
            filters: {}, 
            pagination: { currentPage: 1, rowsPerPage: 100 }, 
            sortConfig: { key: null, direction: 'ascending' } 
          });
          break;
        case 'page-data':
          setTableData(e.data.data);
          setFilteredIndexes(e.data.filteredIndexes);
          setSummaryStats(prev => {
             const filteredSummary = e.data.filteredSummary;
             return {
                 ...filteredSummary,
                 totalRows: e.data.fileTotalRows || 0 // Use the global total sent from worker
             };
          });
          setIsLoading(false);
          break;
        case 'analysis-result':
          setAnalysisData(e.data.data);
          setActiveView('analysis');
          break;
        case 'csv-string-data':
           const blob = new Blob([e.data.csvString], { type: 'text/csv;charset=utf-8;' });
           const link = document.createElement("a");
           link.href = URL.createObjectURL(blob);
           link.download = `filtered_export.csv`;
           document.body.appendChild(link);
           link.click();
           document.body.removeChild(link);
           break;
        case 'transcript-data-result':
           break;
      }
    };

    return () => {
      newWorker.terminate();
    };
  }, []);

  // Handlers
  const handleFileUpload = (uploadedFile: File) => {
    setFile(uploadedFile);
    setIsLoading(true);
    setError('');
    worker?.postMessage({ type: 'parse', file: uploadedFile });
  };

  const handleReset = () => {
    setFile(null);
    setSummaryStats(null);
    setTableData([]);
    setFilters({});
    setActiveView('dashboard');
    worker?.terminate();
    const newWorker = createWorker();
    setWorker(newWorker);
    window.location.reload(); 
  };

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
    worker?.postMessage({ 
      type: 'request-page', 
      filters: newFilters, 
      pagination: { ...pagination, currentPage: 1 }, 
      sortConfig 
    });
  };

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, currentPage: newPage }));
    worker?.postMessage({ 
      type: 'request-page', 
      filters, 
      pagination: { ...pagination, currentPage: newPage }, 
      sortConfig 
    });
  };

  const handleSortChange = (key: string) => {
    const direction = sortConfig.key === key && sortConfig.direction === 'ascending' ? 'descending' : 'ascending';
    setSortConfig({ key, direction });
    worker?.postMessage({ 
      type: 'request-page', 
      filters, 
      pagination, 
      sortConfig: { key, direction } 
    });
  };

  const handleDownloadCsv = () => {
     worker?.postMessage({ type: 'request-csv-string', filteredIndexes });
  };

  const handleDeeperAnalysis = () => {
     const hasFilters = Object.keys(filters).length > 0;
     worker?.postMessage({ 
       type: 'request-analysis', 
       useFilteredData: hasFilters, 
       filteredIndexes 
     });
  };

  // Render Logic
  if (!file || !summaryStats) {
    return (
      <FileUpload 
        onUpload={handleFileUpload} 
        isLoading={isLoading} 
        progress={parseProgress} 
        error={error} 
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100 font-sans">
      {/* Sidebar */}
      <aside className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-300 shadow-lg ${isSidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
        <div className="p-6 flex-shrink-0">
          <h2 className="text-2xl font-bold text-gray-800 mb-2 flex items-center">
             <span className="mr-2 text-blue-600"><Filter size={24} /></span> Filters
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto px-6 pb-6 sidebar-scroll space-y-6">
           <FilterSidebar 
             options={filterOptions} 
             customMetrics={customMetrics} 
             highCardinalityFields={highCardinalityFields}
             filters={filters} 
             onFilterChange={handleFilterChange} 
           />
        </div>

        <div className="p-4 border-t border-gray-200 bg-white space-y-3 flex-shrink-0">
            <div className="p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-2">
                 <h4 className="text-sm font-semibold text-gray-700 mb-2">Advanced Analysis</h4>
                 <button 
                    onClick={handleDeeperAnalysis}
                    className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold transition-colors flex items-center justify-center gap-2"
                >
                    <Search size={16} /> Deeper Analysis
                </button>
                <button 
                    onClick={() => setActiveView('transcript')}
                    className="w-full py-2 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-colors flex items-center justify-center gap-2"
                >
                    <FileText size={16} /> Transcript Analysis
                </button>
            </div>

            <button 
              onClick={handleDownloadCsv}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Download size={16} /> Download Filtered
            </button>
            <button 
              onClick={() => handleFilterChange({})}
              className="w-full py-2 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold transition-colors"
            >
              Clear All Filters
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="p-6 md:p-8 flex-shrink-0">
          <div className="flex justify-between items-center mb-6">
             <div className="flex items-center">
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-md hover:bg-gray-200 mr-4 text-gray-600">
                   {isSidebarOpen ? <X size={24} /> : <Filter size={24} />}
                </button>
                <div>
                  <h1 className="text-3xl font-bold text-gray-800">Conversation Analysis</h1>
                  <div className="flex items-center text-sm text-gray-500 mt-1">
                    <FileText size={16} className="mr-2" /> <span>{file.name}</span>
                  </div>
                </div>
             </div>
             <button onClick={handleReset} className="px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors flex items-center gap-2">
                <UploadCloud size={20} /> Upload New File
             </button>
          </div>
          
          {/* Active Filters Display */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(filters).map(([key, value]) => {
                if (!value) return null;
                if (key === 'dateRange' && (value as any).start) {
                    return <span key={key} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800"><strong>Date:</strong>&nbsp;{(value as any).start} to {(value as any).end}</span>
                }
                if (Array.isArray(value)) {
                    return value.map(v => <span key={`${key}-${v}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><strong>{key}:</strong>&nbsp;{v}</span>)
                }
                if (typeof value === 'string') {
                    return <span key={key} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><strong>{key} contains:</strong>&nbsp;{value}</span>
                }
                return null;
            })}
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto px-6 md:px-8 pb-8 main-content">
           {activeView === 'dashboard' && (
             <Dashboard 
               stats={summaryStats} 
               data={tableData} 
               headers={headers} 
               customMetrics={customMetrics}
               pagination={pagination}
               onPageChange={handlePageChange}
               sortConfig={sortConfig}
               onSortChange={handleSortChange}
               filteredCount={filteredIndexes.length}
             />
           )}
           
           {activeView === 'analysis' && analysisData && (
             <DeeperAnalysis 
               data={analysisData} 
               onClose={() => setActiveView('dashboard')} 
             />
           )}

           {activeView === 'transcript' && (
             <TranscriptAnalysis 
                onClose={() => setActiveView('dashboard')}
                worker={worker}
                filteredIndexes={filteredIndexes}
                headers={headers}
             />
           )}
        </div>
      </main>
    </div>
  );
};

// Sub-component for Filter Sidebar
const FilterSidebar: React.FC<{
  options: Record<string, string[]>;
  customMetrics: string[];
  highCardinalityFields: string[];
  filters: FilterState;
  onFilterChange: (f: FilterState) => void;
}> = ({ options, customMetrics, highCardinalityFields, filters, onFilterChange }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');

  const toggleExpand = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCheckboxChange = (key: string, value: string) => {
    const currentValues = (filters[key] as string[]) || [];
    const newValues = currentValues.includes(value)
      ? currentValues.filter(v => v !== value)
      : [...currentValues, value];
    
    const newFilters = { ...filters, [key]: newValues };
    // Cast to any to delete property, fixing TS2790 strict optionality check
    if (newValues.length === 0) delete (newFilters as any)[key];
    onFilterChange(newFilters);
  };

  const handleDateChange = (type: 'start' | 'end', value: string) => {
    const currentRange = filters.dateRange || {};
    const newRange = { ...currentRange, [type]: value };
    const newFilters = { ...filters, dateRange: newRange };
    // Cast to any to delete property, fixing TS2790 strict optionality check
    if (!newRange.start && !newRange.end) delete (newFilters as any).dateRange;
    onFilterChange(newFilters);
  };

  const handleTextSearch = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value };
    // Cast to any to delete property, fixing TS2790 strict optionality check
    if (!value) delete (newFilters as any)[key];
    onFilterChange(newFilters);
  };

  const standardKeys = Object.keys(options).filter(k => !customMetrics.includes(k) && k !== 'created' && k !== 'finished').sort();
  const customKeys = Object.keys(options).filter(k => customMetrics.includes(k)).sort();

  return (
    <>
      <div className="relative mb-4">
         <input 
            type="search" 
            placeholder="Search metrics..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} 
            className="w-full pl-8 pr-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
         />
         <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
            <Search size={16} className="text-gray-400" />
         </div>
      </div>

      {/* Date Range */}
      <div>
        <h3 className="w-full flex justify-between items-center text-lg font-semibold text-gray-700 mb-2">Date Range</h3>
        <div className="space-y-2 pl-2 border-l-2 border-purple-200 p-2">
           <div>
               <label className="block text-sm font-medium text-gray-600">Start Date</label>
               <input 
                  type="date" 
                  className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900" 
                  value={(filters.dateRange as any)?.start || ''} 
                  onChange={e => handleDateChange('start', e.target.value)} 
               />
           </div>
           <div>
               <label className="block text-sm font-medium text-gray-600">End Date</label>
               <input 
                  type="date" 
                  className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900" 
                  value={(filters.dateRange as any)?.end || ''} 
                  onChange={e => handleDateChange('end', e.target.value)} 
               />
           </div>
        </div>
      </div>

      {/* Standard Metrics */}
      <div>
        <h3 className="w-full flex justify-between items-center text-lg font-semibold text-gray-700 mb-2">Standard Metrics</h3>
        <div className="space-y-2 pl-2 border-l-2 border-blue-200">
          {standardKeys.filter(k => k.toLowerCase().includes(searchTerm.toLowerCase())).map(key => (
            <div key={key}>
              <div 
                 onClick={() => toggleExpand(key)} 
                 className="flex justify-between items-center cursor-pointer p-1 rounded hover:bg-gray-100"
              >
                <label className="block text-sm font-medium text-gray-600 pointer-events-none capitalize">{key}</label>
                <span className="text-gray-500">{expanded[key] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
              </div>
              {expanded[key] && (
                <div className="pl-2 mt-1 space-y-1 max-h-48 overflow-y-auto pr-2">
                  {options[key].map(val => (
                    <label key={val} className="flex items-center space-x-2 cursor-pointer p-1 rounded hover:bg-gray-100">
                      <input 
                        type="checkbox" 
                        checked={(filters[key] as string[])?.includes(val) || false}
                        onChange={() => handleCheckboxChange(key, val)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                      />
                      <span className="text-sm text-gray-700 truncate">{val}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

       {/* Custom Metrics */}
       {customKeys.length > 0 && (
        <div>
          <h3 className="w-full flex justify-between items-center text-lg font-semibold text-gray-700 mb-2">Custom Metrics</h3>
          <div className="space-y-2 pl-2 border-l-2 border-green-200">
            {customKeys.filter(k => k.toLowerCase().includes(searchTerm.toLowerCase())).map(key => (
              <div key={key}>
                <div 
                   onClick={() => toggleExpand(key)} 
                   className="flex justify-between items-center cursor-pointer p-1 rounded hover:bg-gray-100"
                >
                  <label className="block text-sm font-medium text-gray-600 pointer-events-none capitalize">{key}</label>
                  <span className="text-gray-500">{expanded[key] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                </div>
                {expanded[key] && (
                  <div className="pl-2 mt-1 space-y-1 max-h-48 overflow-y-auto pr-2">
                    {options[key].map(val => (
                      <label key={val} className="flex items-center space-x-2 cursor-pointer p-1 rounded hover:bg-gray-100">
                        <input 
                          type="checkbox" 
                          checked={(filters[key] as string[])?.includes(val) || false}
                          onChange={() => handleCheckboxChange(key, val)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                        />
                        <span className="text-sm text-gray-700 truncate">{val}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* High Cardinality (Text Search) */}
      {highCardinalityFields.length > 0 && (
        <div>
          <h3 className="w-full flex justify-between items-center text-lg font-semibold text-gray-700 mb-2">Text Search Filters</h3>
          <p className="text-xs text-gray-500 pl-2 mb-2">For metrics with 200+ unique values.</p>
          <div className="space-y-4 pl-2 border-l-2 border-yellow-200 p-2">
             {highCardinalityFields.map(key => (
               <div key={key}>
                 <label className="block text-sm font-medium text-gray-600 capitalize">{key}</label>
                 <input 
                   type="text" 
                   placeholder="Contains..." 
                   className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                   value={(filters[key] as string) || ''}
                   onChange={(e) => handleTextSearch(key, e.target.value)}
                 />
               </div>
             ))}
          </div>
        </div>
      )}
    </>
  );
};

export default App;
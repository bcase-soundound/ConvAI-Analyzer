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
             // Merge total stats with filtered stats
             const filteredSummary = e.data.filteredSummary;
             return {
                 ...filteredSummary,
                 totalRows: prev ? prev.totalRows : e.data.filteredSummary.totalRows || 0, // Fallback if first load
                 totalContained: prev ? prev.totalContained : e.data.filteredSummary.totalContained || 0
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
           // Handled in transcript component via callback prop if possible, 
           // but simpler to store in global state for now since we are lifting state.
           // However, to avoid passing massive data, we'll let TranscriptAnalysis request it separately 
           // or pass a callback. For now, let's store small chunks or handle via event listener in component.
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
    // Re-init worker to clear its internal state
    worker?.terminate();
    const newWorker = createWorker();
    setWorker(newWorker);
    // Re-attach listeners (simplified by forcing re-mount or effect dependency, but simplest is full reset)
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
     // Check if we have active filters
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
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className={`bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Filter size={20} className="text-blue-600" /> Filters
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
           <FilterSidebar 
             options={filterOptions} 
             customMetrics={customMetrics} 
             highCardinalityFields={highCardinalityFields}
             filters={filters} 
             onFilterChange={handleFilterChange} 
           />
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button 
                onClick={handleDeeperAnalysis}
                className="col-span-2 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
            >
                <BarChart2 size={16} /> Deeper Analysis
            </button>
            <button 
                onClick={() => setActiveView('transcript')}
                className="col-span-2 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors"
            >
                <FileText size={16} /> Transcript Analysis
            </button>
            <button 
              onClick={handleDownloadCsv}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
            >
              <Download size={16} /> Export
            </button>
            <button 
              onClick={() => handleFilterChange({})}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 text-sm font-medium transition-colors"
            >
              <RefreshCw size={16} /> Clear
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
               {isSidebarOpen ? <X size={20} /> : <Filter size={20} />}
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Conversation Analysis</h1>
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <FileText size={12} /> {file.name}
              </p>
            </div>
          </div>
          <button onClick={handleReset} className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors">
            <UploadCloud size={16} /> Upload New
          </button>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto p-6">
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

// Sub-component for Filter Sidebar to keep App.tsx cleaner
const FilterSidebar: React.FC<{
  options: Record<string, string[]>;
  customMetrics: string[];
  highCardinalityFields: string[];
  filters: FilterState;
  onFilterChange: (f: FilterState) => void;
}> = ({ options, customMetrics, highCardinalityFields, filters, onFilterChange }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCheckboxChange = (key: string, value: string) => {
    const currentValues = (filters[key] as string[]) || [];
    const newValues = currentValues.includes(value)
      ? currentValues.filter(v => v !== value)
      : [...currentValues, value];
    
    const newFilters = { ...filters, [key]: newValues };
    if (newValues.length === 0) delete newFilters[key];
    onFilterChange(newFilters);
  };

  const handleDateChange = (type: 'start' | 'end', value: string) => {
    const currentRange = filters.dateRange || {};
    const newRange = { ...currentRange, [type]: value };
    const newFilters = { ...filters, dateRange: newRange };
    if (!newRange.start && !newRange.end) delete newFilters.dateRange;
    onFilterChange(newFilters);
  };

  const handleTextSearch = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value };
    if (!value) delete newFilters[key];
    onFilterChange(newFilters);
  };

  const standardKeys = Object.keys(options).filter(k => !customMetrics.includes(k) && k !== 'created' && k !== 'finished').sort();
  const customKeys = Object.keys(options).filter(k => customMetrics.includes(k)).sort();

  return (
    <div className="space-y-6">
      {/* Date Range */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Date Range</h3>
        <div className="space-y-2 px-2 border-l-2 border-purple-200">
           <input type="date" className="w-full text-sm border-slate-300 rounded-md" value={filters.dateRange?.start || ''} onChange={e => handleDateChange('start', e.target.value)} />
           <input type="date" className="w-full text-sm border-slate-300 rounded-md" value={filters.dateRange?.end || ''} onChange={e => handleDateChange('end', e.target.value)} />
        </div>
      </div>

      {/* Standard Metrics */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Standard Metrics</h3>
        <div className="space-y-1">
          {standardKeys.map(key => (
            <div key={key} className="border-l-2 border-blue-200 pl-2">
              <button onClick={() => toggleExpand(key)} className="flex items-center justify-between w-full py-1 text-sm text-slate-600 hover:text-blue-600">
                <span>{key}</span>
                {expanded[key] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {expanded[key] && (
                <div className="mt-1 pl-1 max-h-40 overflow-y-auto space-y-1">
                  {options[key].map(val => (
                    <label key={val} className="flex items-center gap-2 text-xs text-slate-600 hover:bg-slate-100 p-1 rounded cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={(filters[key] as string[])?.includes(val) || false}
                        onChange={() => handleCheckboxChange(key, val)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="truncate">{val}</span>
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
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Custom Metrics</h3>
          <div className="space-y-1">
            {customKeys.map(key => (
              <div key={key} className="border-l-2 border-green-200 pl-2">
                <button onClick={() => toggleExpand(key)} className="flex items-center justify-between w-full py-1 text-sm text-slate-600 hover:text-green-600">
                  <span>{key}</span>
                  {expanded[key] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {expanded[key] && (
                  <div className="mt-1 pl-1 max-h-40 overflow-y-auto space-y-1">
                    {options[key].map(val => (
                      <label key={val} className="flex items-center gap-2 text-xs text-slate-600 hover:bg-slate-100 p-1 rounded cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={(filters[key] as string[])?.includes(val) || false}
                          onChange={() => handleCheckboxChange(key, val)}
                          className="rounded border-slate-300 text-green-600 focus:ring-green-500"
                        />
                        <span className="truncate">{val}</span>
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
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Text Search</h3>
          <div className="space-y-2 border-l-2 border-yellow-200 pl-2">
             {highCardinalityFields.map(key => (
               <div key={key}>
                 <label className="text-xs text-slate-600 block mb-1 capitalize">{key}</label>
                 <input 
                   type="text" 
                   placeholder="Contains..." 
                   className="w-full text-xs px-2 py-1 border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                   value={(filters[key] as string) || ''}
                   onChange={(e) => handleTextSearch(key, e.target.value)}
                 />
               </div>
             ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
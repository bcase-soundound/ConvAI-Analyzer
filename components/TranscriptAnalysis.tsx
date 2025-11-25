
import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Download, Search, Settings as SettingsIcon } from 'lucide-react';
import { GeminiService, RequestQueue } from '../services/geminiService';
import { DEFAULT_ANALYSIS_PROMPT, DEFAULT_CUSTOM_PROMPT } from '../constants';
import * as XLSX from 'xlsx'; // Assuming global XLSX or imported if using module

interface Props {
  onClose: () => void;
  worker: Worker | null;
  filteredIndexes: number[];
  headers: string[];
}

const TranscriptAnalysis: React.FC<Props> = ({ onClose, worker, filteredIndexes, headers }) => {
  // Config State
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiKey') || '');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [mode, setMode] = useState<'standard' | 'custom'>('standard');
  const [customQuery, setCustomQuery] = useState('');
  const [rowsToAnalyze, setRowsToAnalyze] = useState(20);
  const [limitScope, setLimitScope] = useState(true);
  
  // Data State
  const [rows, setRows] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  
  // Processing State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [statusMsg, setStatusMsg] = useState('');
  
  const [showSettings, setShowSettings] = useState(true);

  // Load rows from worker
  useEffect(() => {
    if (!worker) return;
    const handleMessage = (e: MessageEvent) => {
      if (e.data.type === 'transcript-data-result') {
        setRows(e.data.rows);
      }
    };
    worker.addEventListener('message', handleMessage);
    worker.postMessage({ type: 'request-transcript-data', filteredIndexes });
    
    return () => worker.removeEventListener('message', handleMessage);
  }, [worker, filteredIndexes]);

  const handleStart = async () => {
    if (!apiKey) { alert('API Key required'); return; }
    
    setIsAnalyzing(true);
    setResults([]);
    setShowSettings(false);
    
    const targetRows = limitScope ? rows.slice(0, rowsToAnalyze) : rows;
    setProgress({ current: 0, total: targetRows.length });

    const gemini = new GeminiService(apiKey, model);
    const queue = new RequestQueue(10); // ~10 RPM for Flash
    
    let processed = 0;
    const tempResults: any[] = [];

    // Prompt Template Setup
    let template = mode === 'standard' ? DEFAULT_ANALYSIS_PROMPT : DEFAULT_CUSTOM_PROMPT;
    if (mode === 'custom') template = template.replace('{user_query}', customQuery);

    try {
        const promises = targetRows.map((row, index) => {
            return queue.add(async () => {
                // Find transcript column
                const transcriptCol = Object.keys(row).find(k => k.toLowerCase().includes('transcript')) || 'transcript';
                const transcriptText = row[transcriptCol] || 'No Transcript';

                const prompt = template.replace('{transcript_text}', transcriptText);
                
                try {
                    const responseText = await gemini.generateContent(prompt, true);
                    const jsonStr = responseText.replace(/```json|```/g, '').trim();
                    const insight = JSON.parse(jsonStr);
                    
                    const result = { row, insight, error: null };
                    tempResults.push(result);
                    setResults(prev => [...prev, result]);
                } catch (e: any) {
                    const result = { row, insight: null, error: e.message };
                    tempResults.push(result);
                    setResults(prev => [...prev, result]);
                } finally {
                    processed++;
                    setProgress(prev => ({ ...prev, current: processed }));
                }
            });
        });

        await Promise.all(promises);
        setStatusMsg('Analysis Complete');
    } catch (e: any) {
        setStatusMsg(`Error: ${e.message}`);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const downloadReport = () => {
    const data = results.map(r => {
        const base = { ...r.row };
        if (mode === 'standard') {
            base['AI Intent'] = r.insight?.intent?.name;
            base['AI Summary'] = r.insight?.overall;
        } else {
            base['AI Match'] = r.insight?.match ? 'YES' : 'NO';
            base['AI Reason'] = r.insight?.reasoning;
        }
        return base;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analysis");
    XLSX.writeFile(wb, "Transcript_Analysis.xlsx");
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
            <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <Search className="text-purple-600" /> Transcript Analysis (Gemini)
            </h2>
            <div className="flex gap-2">
                <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-gray-200 rounded text-gray-600">
                    <SettingsIcon size={20} />
                </button>
                <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded text-gray-600">
                    <X size={20} />
                </button>
            </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
            {/* Settings Sidebar */}
            <div className={`bg-gray-50 border-r border-gray-200 p-4 w-80 overflow-y-auto transition-all ${showSettings ? 'ml-0' : '-ml-80'}`}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">API Key</label>
                        <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); localStorage.setItem('geminiKey', e.target.value); }} className="w-full border border-gray-300 rounded p-2 text-sm bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500" placeholder="Gemini API Key" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Model</label>
                        <select value={model} onChange={e => setModel(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500">
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                            <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                        </select>
                    </div>
                    <div className="flex gap-2 p-1 bg-gray-200 rounded">
                        <button onClick={() => setMode('standard')} className={`flex-1 py-1 text-xs font-medium rounded ${mode === 'standard' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}>Standard</button>
                        <button onClick={() => setMode('custom')} className={`flex-1 py-1 text-xs font-medium rounded ${mode === 'custom' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}>Custom Search</button>
                    </div>
                    {mode === 'custom' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Search Criteria</label>
                            <textarea value={customQuery} onChange={e => setCustomQuery(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm h-20 bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500" placeholder="Find users who are angry..." />
                        </div>
                    )}
                    <div>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={limitScope} onChange={e => setLimitScope(e.target.checked)} className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 bg-white" />
                            Limit to first
                            <input type="number" value={rowsToAnalyze} onChange={e => setRowsToAnalyze(Number(e.target.value))} className="w-16 border border-gray-300 rounded p-1 text-xs bg-white text-gray-900 focus:ring-blue-500" disabled={!limitScope} />
                            conversations
                        </label>
                    </div>
                    <button onClick={handleStart} disabled={isAnalyzing || rows.length === 0} className="w-full bg-purple-600 text-white py-2 rounded font-bold flex items-center justify-center gap-2 hover:bg-purple-700 disabled:bg-gray-400 transition-colors">
                        {isAnalyzing ? 'Analyzing...' : <><Play size={16} /> Start</>}
                    </button>
                </div>
            </div>

            {/* Results Area */}
            <div className="flex-1 flex flex-col p-4 overflow-hidden">
                {/* Progress Bar */}
                {progress.total > 0 && (
                    <div className="mb-4">
                        <div className="flex justify-between text-sm mb-1 text-gray-700">
                            <span>Progress: {progress.current} / {progress.total}</span>
                            <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-purple-600 h-2 rounded-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="flex-1 overflow-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Transcript</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">AI Analysis</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {results.map((r, i) => (
                                <tr key={i}>
                                    <td className="px-4 py-2 text-xs font-mono align-top text-blue-600">{r.row['conversation id'] || r.row['id'] || 'N/A'}</td>
                                    <td className="px-4 py-2 text-xs text-gray-500 align-top w-1/3 truncate max-w-xs">{r.row['transcript']?.substring(0, 100)}...</td>
                                    <td className="px-4 py-2 text-sm text-gray-800 align-top">
                                        {r.error ? <span className="text-red-500">{r.error}</span> : 
                                         mode === 'standard' ? (
                                             <div>
                                                 <div className="font-bold">{r.insight?.intent?.name}</div>
                                                 <div className="text-xs">{r.insight?.overall}</div>
                                             </div>
                                         ) : (
                                             <div>
                                                 <div className={`font-bold ${r.insight?.match ? 'text-green-600' : 'text-gray-400'}`}>
                                                     {r.insight?.match ? 'MATCH' : 'NO MATCH'}
                                                 </div>
                                                 <div className="text-xs">{r.insight?.reasoning}</div>
                                             </div>
                                         )
                                        }
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                {results.length > 0 && !isAnalyzing && (
                    <div className="mt-4 flex justify-end">
                        <button onClick={downloadReport} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors">
                            <Download size={16} /> Download Report
                        </button>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default TranscriptAnalysis;

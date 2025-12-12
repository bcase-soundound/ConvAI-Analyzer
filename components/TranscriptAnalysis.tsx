import React, { useState, useEffect } from 'react';
import { X, Play, Download, Search, Settings as SettingsIcon, Filter, Zap, Shield, ShieldCheck, Plus, Trash2 } from 'lucide-react';
import { GeminiService, RequestQueue } from '../services/geminiService';
import { DEFAULT_ANALYSIS_PROMPT, DEFAULT_CUSTOM_PROMPT, DEFAULT_SUMMARY_PROMPT, TA_MODEL_INFO, PII_PATTERNS, INTERMEDIATE_BATCH_PROMPT } from '../constants';
import * as XLSX from 'xlsx';

interface Props {
  onClose: () => void;
  worker: Worker | null;
  filteredIndexes: number[];
  headers: string[];
}

interface CustomPiiPattern {
    id: string;
    name: string;
    regex: string;
    replacement: string;
}

interface PiiConfig {
    enabled: boolean;
    activeTypes: string[];
    customPatterns: CustomPiiPattern[];
}

// Utility to safely parse JSON from LLM output
const safeJsonParse = (text: string) => {
    try {
        // 1. Try direct parse
        return JSON.parse(text);
    } catch (e) {
        // 2. Cleanup Markdown
        const clean = text.replace(/```json|```/g, '').trim();
        try {
            return JSON.parse(clean);
        } catch (e2) {
            // 3. Find first { and last }
            const start = clean.indexOf('{');
            const end = clean.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                try {
                    return JSON.parse(clean.substring(start, end + 1));
                } catch (e3) {
                    return null;
                }
            }
            return null;
        }
    }
};

const TranscriptAnalysis: React.FC<Props> = ({ onClose, worker, filteredIndexes, headers }) => {
  // --- STATE ---
  // Configuration
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiKey') || '');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [rpm, setRpm] = useState<number>(TA_MODEL_INFO['gemini-2.5-flash']?.rpm || 10);
  const [mode, setMode] = useState<'standard' | 'custom'>('standard');
  const [limitScope, setLimitScope] = useState(true);
  const [rowsToAnalyzeCount, setRowsToAnalyzeCount] = useState(20);
  
  // PII Redaction State
  const [piiConfig, setPiiConfig] = useState<PiiConfig>(() => {
      const saved = localStorage.getItem('ta_piiConfig');
      return saved ? JSON.parse(saved) : {
          enabled: false,
          activeTypes: Object.keys(PII_PATTERNS),
          customPatterns: []
      };
  });
  
  // Custom Query
  const [customQuery, setCustomQuery] = useState(localStorage.getItem('ta_customQuery') || '');

  // Prompt Configuration
  const [analysisPrompt, setAnalysisPrompt] = useState(localStorage.getItem('ta_analysisPrompt') || DEFAULT_ANALYSIS_PROMPT);
  const [summaryPrompt, setSummaryPrompt] = useState(localStorage.getItem('ta_summaryPrompt') || DEFAULT_SUMMARY_PROMPT);
  const [variableMapping, setVariableMapping] = useState<Record<string, string>>(JSON.parse(localStorage.getItem('ta_varMapping') || '{}'));

  // UI State
  const [settingsVisible, setSettingsVisible] = useState(true);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [activePromptTab, setActivePromptTab] = useState<'analysis' | 'summary'>('analysis');
  const [viewingTranscript, setViewingTranscript] = useState<any | null>(null);

  // Data & Processing
  const [rows, setRows] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [summaryProgress, setSummaryProgress] = useState({ current: 0, total: 0 });
  const [summaryStatus, setSummaryStatus] = useState<string>(''); // To show batch progress
  const [estimate, setEstimate] = useState('');

  // --- EFFECTS ---

  // Load Data
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

  // Update Estimate
  useEffect(() => {
    // Basic calculation: Total items / RPM = Minutes
    // We add a small buffer for network latency overhead per batch
    const count = limitScope ? Math.min(rowsToAnalyzeCount, rows.length) : rows.length;
    if (count <= 0 || rpm <= 0) {
        setEstimate('0s');
        return;
    }
    
    // Logic: If RPM is 60, we do 1 per second. 
    // Total time (seconds) = Count * (60 / RPM)
    const seconds = Math.ceil(count * (60 / rpm));
    
    setEstimate(seconds < 60 ? `~${seconds} seconds` : `~${Math.floor(seconds/60)} min ${seconds%60} sec`);
  }, [rpm, limitScope, rowsToAnalyzeCount, rows.length]);

  // Persist Settings
  useEffect(() => localStorage.setItem('geminiKey', apiKey), [apiKey]);
  useEffect(() => localStorage.setItem('ta_customQuery', customQuery), [customQuery]);
  useEffect(() => localStorage.setItem('ta_analysisPrompt', analysisPrompt), [analysisPrompt]);
  useEffect(() => localStorage.setItem('ta_summaryPrompt', summaryPrompt), [summaryPrompt]);
  useEffect(() => localStorage.setItem('ta_varMapping', JSON.stringify(variableMapping)), [variableMapping]);
  useEffect(() => localStorage.setItem('ta_piiConfig', JSON.stringify(piiConfig)), [piiConfig]);

  // --- LOGIC ---

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newModel = e.target.value;
      setModel(newModel);
      // Reset RPM to model default when model changes
      const defaultRpm = TA_MODEL_INFO[newModel]?.rpm || 10;
      setRpm(defaultRpm);
  };

  // Redaction Logic
  const redactContent = (text: string): string => {
      if (!piiConfig.enabled || !text) return text;
      let redacted = text;

      // 1. Standard Patterns
      piiConfig.activeTypes.forEach(type => {
          const pattern = PII_PATTERNS[type as keyof typeof PII_PATTERNS];
          if (pattern) {
              const regex = new RegExp(pattern.regex, 'gi');
              redacted = redacted.replace(regex, pattern.replace);
          }
      });

      // 2. Custom Patterns
      piiConfig.customPatterns.forEach(p => {
          if (!p.regex) return;
          try {
              const regex = new RegExp(p.regex, 'gi');
              redacted = redacted.replace(regex, p.replacement || '[REDACTED]');
          } catch (e) {
              console.warn(`Invalid regex for custom PII pattern "${p.name}"`);
          }
      });

      return redacted;
  };

  const handleStart = async () => {
    if (!apiKey) { alert('API Key required'); return; }
    if (rows.length === 0) return;

    setIsAnalyzing(true);
    setResults([]);
    setSummary(null);
    setSettingsVisible(false);
    setSummaryStatus('');
    setSummaryProgress({ current: 0, total: 0 });

    const targetRows = limitScope ? rows.slice(0, rowsToAnalyzeCount) : rows;
    setProgress({ current: 0, total: targetRows.length });

    const gemini = new GeminiService(apiKey, model);
    // Use user-defined RPM
    const queue = new RequestQueue(rpm);

    const tempResults: any[] = [];
    let processed = 0;

    // Prepare Template & Mappings
    let template = mode === 'standard' ? analysisPrompt : DEFAULT_CUSTOM_PROMPT;
    if (mode === 'custom') {
        template = template.replace('{user_query}', customQuery);
    }

    try {
        const promises = targetRows.map(row => {
            return queue.add(async () => {
                // Variable Injection
                let prompt = template;
                const vars = [...template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m => m[1]);
                
                // Track legend for prompt injection if needed (simplified for React version)
                if (vars.includes('existing_legend')) {
                    prompt = prompt.replace('{existing_legend}', '(Dynamic legend updates skipped for parallel processing)');
                }

                vars.forEach(v => {
                    if (v === 'existing_legend') return;
                    // Check mapping or default fallbacks
                    let colName = variableMapping[v];
                    if (!colName) {
                        // Fallbacks
                        if (v === 'transcript_text') colName = headers.find(h => h.toLowerCase().includes('transcript')) || '';
                    }
                    
                    let val = colName && row[colName] ? String(row[colName]) : `[MISSING: ${v}]`;
                    
                    // APPLY REDACTION BEFORE INJECTION
                    if (piiConfig.enabled) {
                        val = redactContent(val);
                    }

                    prompt = prompt.replace(new RegExp(`\\{${v}\\}`, 'g'), val);
                });

                let insight = null;
                let error = null;

                try {
                    const text = await gemini.generateContent(prompt, true);
                    const parsed = safeJsonParse(text);
                    if (parsed) {
                        insight = parsed;
                    } else {
                        error = "Invalid JSON response";
                    }
                } catch (e: any) {
                    error = e.message;
                }

                const result = { row, insight, error };
                tempResults.push(result);
                setResults(prev => [...prev, result]);
                
                processed++;
                setProgress(prev => ({ ...prev, current: processed }));
            });
        });

        await Promise.all(promises);

        if (mode === 'standard') {
            // Pass the queue to generateSummary so it can respect rate limits during batch processing
            await generateSummary(tempResults, gemini, queue);
        }

    } catch (e: any) {
        alert(`Analysis Error: ${e.message}`);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const generateSummary = async (results: any[], gemini: GeminiService, queue: RequestQueue) => {
    setIsSummarizing(true);
    setSummaryStatus('Preparing summary data...');
    
    const validResults = results.filter(r => r.insight && !r.error);
    if (validResults.length === 0) { setIsSummarizing(false); return; }

    const BATCH_SIZE = 25; // Reduce batch size to prevent token overflow on large inputs
    let finalInputForSummary = '';
    
    // Reset queue for summary phase (optional, but ensures clean slate)
    // queue.clear(); 

    try {
        if (validResults.length <= BATCH_SIZE) {
            // Small enough to do in one go
            finalInputForSummary = validResults.map(r => JSON.stringify(r.insight)).join('\n\n');
        } else {
            // --- MAP-REDUCE STRATEGY ---
            const batches = [];
            for (let i = 0; i < validResults.length; i += BATCH_SIZE) {
                batches.push(validResults.slice(i, i + BATCH_SIZE));
            }

            setSummaryProgress({ current: 0, total: batches.length });
            setSummaryStatus(`Summarizing in ${batches.length} batches...`);
            
            let completedBatches = 0;

            const batchPromises = batches.map((batch, index) => {
                return queue.add(async () => {
                    const batchInsights = batch.map(r => JSON.stringify(r.insight)).join('\n');
                    const batchPrompt = INTERMEDIATE_BATCH_PROMPT
                        .replace('{count}', batch.length.toString())
                        .replace('{batch_insights}', batchInsights);
                    
                    try {
                        const text = await gemini.generateContent(batchPrompt, true);
                        completedBatches++;
                        setSummaryProgress(prev => ({ ...prev, current: completedBatches }));
                        return text; 
                    } catch (e) {
                        console.error(`Batch ${index} summary failed`, e);
                        completedBatches++;
                        setSummaryProgress(prev => ({ ...prev, current: completedBatches }));
                        return null;
                    }
                });
            });

            const batchResults = await Promise.all(batchPromises);
            const successfulBatches = batchResults.filter(r => r !== null && safeJsonParse(r)); // Ensure valid JSON
            finalInputForSummary = successfulBatches.join('\n\n');
        }

        setSummaryStatus('Generating final executive summary...');
        setSummaryProgress({ current: 0, total: 0 }); // Hide batch progress

        // Final Aggregation
        const prompt = summaryPrompt
            .replace('{insight_count}', validResults.length.toString())
            .replace('{all_insights}', finalInputForSummary);

        const text = await gemini.generateContent(prompt, true);
        const summaryData = safeJsonParse(text);
        
        if (summaryData) {
            setSummary(formatSummaryHtml(summaryData));
        } else {
             throw new Error("Final summary response was not valid JSON");
        }

    } catch (e: any) {
        console.error(e);
        setSummary(`<p class="text-red-500 bg-red-50 p-3 rounded">Failed to generate summary: ${e.message}. <br/><br/>Try reducing the 'Rows to Analyze' count or switch to a higher tier model.</p>`);
    } finally {
        setIsSummarizing(false);
        setSummaryStatus('');
    }
  };

  const formatSummaryHtml = (data: any) => {
    let html = '';
    const section = (title: string, items: any[], key: string, detail: string) => {
        if (!items || items.length === 0) return '';
        return `<div class="mb-4"><h4 class="font-bold text-gray-700 mb-2">${title}</h4><ul class="list-disc pl-5 space-y-1 text-sm text-gray-600">` +
        items.map(i => `<li><span class="font-semibold">(${i.count}) ${i[key]}:</span> ${i[detail]}</li>`).join('') +
        `</ul></div>`;
    };
    
    html += section('Top User Intents', data.top_intents, 'intent', 'details');
    html += section('Common Successes', data.common_successes, 'success', 'details');
    html += section('Top Failures', data.top_failures, 'failure', 'details');
    if (data.overall_performance) {
        html += `<div><h4 class="font-bold text-gray-700">Overall Performance</h4><p class="text-sm text-gray-600">${data.overall_performance}</p></div>`;
    }
    return html;
  };

  const downloadReport = () => {
    const dataForSheet = results.map(r => {
        const row = { ...r.row }; // Original Metadata
        if (mode === 'standard') {
            row['AI Intent'] = r.insight?.intent?.name || r.error;
            row['AI Successes'] = r.insight?.successes?.map((s:any) => s.name).join(', ');
            row['AI Failures'] = r.insight?.failures?.map((f:any) => f.name).join(', ');
            row['AI Summary'] = r.insight?.overall;
        } else {
            row['AI Match'] = r.insight?.match ? 'YES' : 'NO';
            row['AI Reason'] = r.insight?.reasoning;
            row['AI Evidence'] = r.insight?.evidence;
        }
        return row;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataForSheet);
    XLSX.utils.book_append_sheet(wb, ws, "Analysis");

    // Add Legend if standard
    if (mode === 'standard') {
        const legendData: any[] = [];
        results.forEach(r => {
            if(!r.insight) return;
            if(r.insight.intent) legendData.push({ Category: 'Intent', Name: r.insight.intent.name, Description: r.insight.intent.description });
            r.insight.successes?.forEach((s:any) => legendData.push({ Category: 'Success', Name: s.name, Description: s.description }));
            r.insight.failures?.forEach((f:any) => legendData.push({ Category: 'Failure', Name: f.name, Description: f.description }));
        });
        // Dedupe
        const uniqueLegend = Array.from(new Set(legendData.map(i => JSON.stringify(i)))).map(s => JSON.parse(s));
        const wsLegend = XLSX.utils.json_to_sheet(uniqueLegend);
        XLSX.utils.book_append_sheet(wb, wsLegend, "Legend");
    }

    XLSX.writeFile(wb, "Transcript_Analysis_Report.xlsx");
  };

  // --- RENDER HELPERS ---

  const renderInsight = (r: any) => {
      if (r.error) return <span className="text-red-500 font-medium">Error: {r.error}</span>;
      if (!r.insight) return <span className="text-gray-400">No Data</span>;

      if (mode === 'standard') {
          return (
              <div className="space-y-2 text-sm">
                  <div>
                      <span className="font-bold text-gray-800">Intent:</span> {r.insight.intent?.name || 'N/A'}
                      <p className="text-xs text-gray-500">{r.insight.intent?.description}</p>
                  </div>
                  {(r.insight.successes?.length > 0) && (
                      <div>
                          <span className="font-bold text-green-700">Successes:</span>
                          <ul className="list-disc pl-4 text-xs text-gray-600">
                              {r.insight.successes.map((s:any, i:number) => (
                                  <li key={i}><strong>{s.name}:</strong> {s.description}</li>
                              ))}
                          </ul>
                      </div>
                  )}
                  {(r.insight.failures?.length > 0) && (
                      <div>
                          <span className="font-bold text-red-700">Failures:</span>
                          <ul className="list-disc pl-4 text-xs text-gray-600">
                              {r.insight.failures.map((f:any, i:number) => (
                                  <li key={i}><strong>{f.name}:</strong> {f.description}</li>
                              ))}
                          </ul>
                      </div>
                  )}
                  <div className="pt-1 border-t border-gray-100">
                      <span className="font-bold text-gray-800">Overall:</span> {r.insight.overall}
                  </div>
              </div>
          );
      } else {
          return (
              <div className={`p-3 border rounded-lg ${r.insight.match ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className={`font-bold mb-1 ${r.insight.match ? 'text-green-800' : 'text-gray-500'}`}>
                      {r.insight.match ? 'MATCH' : 'NO MATCH'}
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{r.insight.reasoning}</p>
                  {r.insight.evidence && (
                      <div className="text-xs text-gray-500 italic border-t border-gray-200 pt-1">"{r.insight.evidence}"</div>
                  )}
              </div>
          );
      }
  };

  const addCustomPii = () => {
      setPiiConfig(prev => ({
          ...prev,
          customPatterns: [...prev.customPatterns, { id: Date.now().toString(), name: 'New Pattern', regex: '', replacement: '[REDACTED]' }]
      }));
  };

  const updateCustomPii = (id: string, field: keyof CustomPiiPattern, value: string) => {
      setPiiConfig(prev => ({
          ...prev,
          customPatterns: prev.customPatterns.map(p => p.id === id ? { ...p, [field]: value } : p)
      }));
  };

  const removeCustomPii = (id: string) => {
      setPiiConfig(prev => ({
          ...prev,
          customPatterns: prev.customPatterns.filter(p => p.id !== id)
      }));
  };

  return (
    <div className="bg-white h-full flex flex-col overflow-hidden relative">
      {/* Header */}
      <div className="p-4 border-b flex justify-between items-center bg-white flex-shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-800">Transcript Analysis</h2>
            <button 
                onClick={() => setSettingsVisible(!settingsVisible)}
                className="px-3 py-1.5 text-sm bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2 shadow-sm transition-all"
            >
                <Filter size={14} />
                {settingsVisible ? 'Hide Settings' : 'Show Settings'}
            </button>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
            <X size={24} />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT PANEL: SETTINGS */}
        <div className={`${settingsVisible ? 'w-1/3 min-w-[350px]' : 'w-0 opacity-0'} bg-gray-50 border-r border-gray-200 overflow-y-auto transition-all duration-300 flex-shrink-0`}>
            <div className="p-6 space-y-6">
                
                {/* 1. API Settings */}
                <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">1. Settings</h3>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Gemini API Key</label>
                            <input 
                                type="password" 
                                value={apiKey} 
                                onChange={e => setApiKey(e.target.value)} 
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500" 
                                placeholder="Enter your key..."
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Model</label>
                                <select 
                                    value={model} 
                                    onChange={handleModelChange} 
                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    {Object.entries(TA_MODEL_INFO).map(([key, info]) => (
                                        <option key={key} value={key}>{info.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-span-2">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase">Rate Limit (RPM)</label>
                                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                        {Math.ceil(60000 / rpm)}ms delay
                                    </span>
                                </div>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Zap size={14} className="text-yellow-500" />
                                    </div>
                                    <input 
                                        type="number" 
                                        value={rpm} 
                                        onChange={e => setRpm(Math.max(1, Number(e.target.value)))} 
                                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-500 mt-1">Adjust based on your API tier limits. Higher RPM enables parallel processing.</p>
                            </div>
                        </div>
                        <button onClick={() => { setApiKey(''); setModel('gemini-2.5-flash'); setRpm(10); }} className="text-xs text-blue-600 hover:underline">Clear Settings</button>
                    </div>
                </div>

                {/* 2. Mode */}
                <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <h3 className="font-semibold text-gray-800 mb-3">2. Analysis Mode</h3>
                    <div className="flex p-1 bg-gray-100 rounded-lg mb-4">
                        <button 
                            onClick={() => setMode('standard')} 
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'standard' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Standard
                        </button>
                        <button 
                            onClick={() => setMode('custom')} 
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'custom' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Custom Search
                        </button>
                    </div>

                    {mode === 'standard' ? (
                        <div className="space-y-3">
                            <p className="text-xs text-gray-500 leading-relaxed">Analyze conversations for Intent, Successes, Failures, and Overall Summary.</p>
                            <button 
                                onClick={() => setShowPromptModal(true)}
                                className="w-full py-2 px-3 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors"
                            >
                                <SettingsIcon size={14} /> Configure Prompts & Variables
                            </button>
                        </div>
                    ) : (
                        <div>
                            <p className="text-xs text-gray-500 mb-2">Find specific patterns (e.g., "Find frustrated users").</p>
                            <textarea 
                                value={customQuery}
                                onChange={e => setCustomQuery(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-md text-sm bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500 min-h-[80px]"
                                placeholder="e.g., Show me conversations where the user asked about VPN..."
                            />
                        </div>
                    )}
                </div>

                 {/* 3. PII Redaction */}
                 <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-gray-800 flex items-center gap-2">3. Privacy & Redaction</h3>
                        <button 
                            onClick={() => setPiiConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${piiConfig.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${piiConfig.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className={`space-y-3 transition-all ${piiConfig.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                        <p className="text-xs text-gray-500">Redact sensitive info locally before sending to AI.</p>
                        
                        {/* Standard Types */}
                        <div className="space-y-2">
                             {Object.entries(PII_PATTERNS).map(([key, info]) => (
                                 <label key={key} className="flex items-center space-x-2 cursor-pointer">
                                     <input 
                                        type="checkbox" 
                                        checked={piiConfig.activeTypes.includes(key)}
                                        onChange={() => {
                                            setPiiConfig(prev => {
                                                const newTypes = prev.activeTypes.includes(key) 
                                                    ? prev.activeTypes.filter(t => t !== key)
                                                    : [...prev.activeTypes, key];
                                                return { ...prev, activeTypes: newTypes };
                                            });
                                        }}
                                        className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-gray-300"
                                     />
                                     <span className="text-sm text-gray-700">{info.label}</span>
                                 </label>
                             ))}
                        </div>

                        {/* Custom Regex */}
                        <div className="pt-2 border-t border-gray-100">
                             <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-gray-500 uppercase">Custom Patterns (Regex)</span>
                                <button onClick={addCustomPii} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"><Plus size={12}/> Add</button>
                             </div>
                             
                             <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                 {piiConfig.customPatterns.map(p => (
                                     <div key={p.id} className="p-2 bg-gray-50 rounded border border-gray-200 space-y-2">
                                         <div className="flex justify-between items-center">
                                             <input 
                                                type="text" 
                                                value={p.name}
                                                onChange={e => updateCustomPii(p.id, 'name', e.target.value)}
                                                className="bg-transparent text-xs font-semibold text-gray-700 focus:outline-none w-2/3"
                                                placeholder="Pattern Name"
                                             />
                                             <button onClick={() => removeCustomPii(p.id)} className="text-red-500 hover:text-red-700"><Trash2 size={12} /></button>
                                         </div>
                                         <input 
                                            type="text" 
                                            value={p.regex}
                                            onChange={e => updateCustomPii(p.id, 'regex', e.target.value)}
                                            className="w-full text-xs p-1 border border-gray-300 rounded font-mono"
                                            placeholder="Regex (e.g. \b\d{5}\b)"
                                         />
                                          <input 
                                            type="text" 
                                            value={p.replacement}
                                            onChange={e => updateCustomPii(p.id, 'replacement', e.target.value)}
                                            className="w-full text-xs p-1 border border-gray-300 rounded text-gray-500"
                                            placeholder="Replacement"
                                         />
                                     </div>
                                 ))}
                                 {piiConfig.customPatterns.length === 0 && (
                                     <p className="text-xs text-gray-400 italic">No custom patterns defined.</p>
                                 )}
                             </div>
                        </div>
                    </div>
                 </div>

                {/* 4. Scope */}
                <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <h3 className="font-semibold text-gray-800 mb-3">4. Select Scope</h3>
                    <div className="space-y-2">
                        <label className={`flex items-center p-3 border rounded-md cursor-pointer transition-colors ${!limitScope ? 'bg-blue-50 border-blue-200' : 'border-gray-200 hover:bg-gray-50'}`}>
                            <input type="radio" name="scope" checked={!limitScope} onChange={() => setLimitScope(false)} className="text-blue-600 focus:ring-blue-500" />
                            <span className="ml-2 text-sm text-gray-700">Analyze All ({rows.length})</span>
                        </label>
                        <label className={`flex items-center p-3 border rounded-md cursor-pointer transition-colors ${limitScope ? 'bg-blue-50 border-blue-200' : 'border-gray-200 hover:bg-gray-50'}`}>
                            <input type="radio" name="scope" checked={limitScope} onChange={() => setLimitScope(true)} className="text-blue-600 focus:ring-blue-500" />
                            <div className="ml-2 flex items-center gap-2">
                                <span className="text-sm text-gray-700">Analyze First</span>
                                <input 
                                    type="number" 
                                    value={rowsToAnalyzeCount} 
                                    onChange={e => setRowsToAnalyzeCount(Number(e.target.value))} 
                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900 focus:ring-blue-500"
                                    disabled={!limitScope}
                                />
                            </div>
                        </label>
                    </div>
                </div>

                {/* 5. Start */}
                <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <h3 className="font-semibold text-gray-800 mb-2">5. Start Analysis</h3>
                    <div className="mb-4 text-xs text-gray-500">
                        <p><strong>Est. Time:</strong> {estimate}</p>
                        <p>Targeting {rpm} requests per minute.</p>
                        {piiConfig.enabled && (
                            <p className="text-green-600 font-semibold flex items-center gap-1 mt-1"><ShieldCheck size={12}/> Redaction Enabled</p>
                        )}
                        {isSummarizing && summaryStatus && (
                            <p className="text-blue-600 font-semibold mt-1 animate-pulse">{summaryStatus}</p>
                        )}
                    </div>
                    <button 
                        onClick={handleStart} 
                        disabled={isAnalyzing || isSummarizing || rows.length === 0 || !apiKey}
                        className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold shadow-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                    >
                        {isAnalyzing || isSummarizing ? (
                            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> {isSummarizing ? 'Summarizing...' : 'Analyzing...'}</>
                        ) : (
                            <><Play size={18} /> Start Analysis</>
                        )}
                    </button>
                </div>
            </div>
        </div>

        {/* RIGHT PANEL: RESULTS */}
        <div className="flex-1 flex flex-col h-full bg-white overflow-hidden relative">
            
            {/* Progress Bar (Analyzing) */}
            {(isAnalyzing || progress.current > 0) && (
                <div className="px-6 pt-6 pb-2">
                    <div className="flex justify-between text-sm mb-1 font-medium text-gray-700">
                        <span>Analysis Progress: {progress.current} / {progress.total}</span>
                        <span>{Math.round((progress.current / Math.max(progress.total, 1)) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div 
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
                            style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                        ></div>
                    </div>
                </div>
            )}

             {/* Progress Bar (Summarizing) */}
             {isSummarizing && summaryProgress.total > 0 && (
                <div className="px-6 pt-2 pb-2">
                    <div className="flex justify-between text-sm mb-1 font-medium text-purple-700">
                        <span>Summarization Batches: {summaryProgress.current} / {summaryProgress.total}</span>
                        <span>{Math.round((summaryProgress.current / summaryProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-purple-50 rounded-full h-2.5 overflow-hidden">
                        <div 
                            className="bg-purple-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
                            style={{ width: `${(summaryProgress.current / summaryProgress.total) * 100}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {/* Summary Box (Standard Mode Only) */}
            {mode === 'standard' && summary && (
                <div className="mx-6 mt-4 p-6 bg-gray-50 border border-gray-200 rounded-lg shadow-inner max-h-60 overflow-y-auto">
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-bold text-gray-800">Executive Summary</h3>
                        <button onClick={downloadReport} className="text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 transition-colors flex items-center gap-2 shadow-sm">
                            <Download size={14} /> Download Report
                        </button>
                    </div>
                    <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: summary }}></div>
                </div>
            )}
            
            {/* Custom Mode Download Button */}
            {mode === 'custom' && results.length > 0 && !isAnalyzing && (
                 <div className="mx-6 mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-blue-900 flex items-center gap-2"><Search size={18}/> Custom Search Results</h3>
                        <p className="text-sm text-blue-700">Found {results.filter(r => r.insight?.match).length} matches.</p>
                    </div>
                    <button onClick={downloadReport} className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm font-medium">
                        <Download size={16} /> Download Results
                    </button>
                 </div>
            )}

            {/* Main Table */}
            <div className="flex-1 overflow-auto p-6">
                <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-1/3">Transcript Snippet</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    {mode === 'standard' ? 'AI Generated Insights' : `Matches: "${customQuery}"`}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {results.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-12 text-center text-gray-400">
                                        No analysis results yet. Configure settings and click Start.
                                    </td>
                                </tr>
                            ) : (
                                results.map((r, i) => {
                                    const tCol = headers.find(h => h.toLowerCase().includes('transcript')) || '';
                                    const snippet = r.row[tCol] ? String(r.row[tCol]).substring(0, 200) + '...' : 'N/A';
                                    const id = r.row['conversation id'] || r.row['id'] || 'N/A';
                                    
                                    return (
                                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 align-top">
                                                <button 
                                                    onClick={() => setViewingTranscript(r.row)}
                                                    className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left"
                                                >
                                                    {id}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 align-top text-xs text-gray-500 leading-relaxed font-mono">
                                                {snippet}
                                            </td>
                                            <td className="px-6 py-4 align-top">
                                                {renderInsight(r)}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </div>

      {/* MODAL: PROMPT CONFIG */}
      {showPromptModal && (
          <div className="fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                      <div>
                          <h3 className="text-lg font-bold text-gray-800">Prompt Configuration</h3>
                          <p className="text-xs text-gray-500">Customize templates and map variables to CSV columns.</p>
                      </div>
                      <button onClick={() => setShowPromptModal(false)} className="p-2 hover:bg-gray-200 rounded-full text-gray-500"><X size={20} /></button>
                  </div>
                  
                  <div className="flex border-b">
                      <button 
                        onClick={() => setActivePromptTab('analysis')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activePromptTab === 'analysis' ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                      >
                          Analysis Prompt
                      </button>
                      <button 
                        onClick={() => setActivePromptTab('summary')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activePromptTab === 'summary' ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                      >
                          Summary Prompt
                      </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                      <div className="flex flex-col h-full space-y-4">
                          <label className="text-sm font-bold text-gray-700">Template</label>
                          <textarea 
                             className="w-full flex-1 p-4 border border-gray-300 rounded-lg font-mono text-sm bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500 min-h-[300px]"
                             value={activePromptTab === 'analysis' ? analysisPrompt : summaryPrompt}
                             onChange={e => activePromptTab === 'analysis' ? setAnalysisPrompt(e.target.value) : setSummaryPrompt(e.target.value)}
                          />
                          
                          {/* Variable Mapper (Only for Analysis) */}
                          {activePromptTab === 'analysis' && (
                              <div className="bg-white p-4 rounded-lg border border-gray-200">
                                  <h4 className="text-sm font-bold text-gray-800 mb-2 border-b pb-2">Detected Variables</h4>
                                  <div className="space-y-2">
                                      {[...analysisPrompt.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m => m[1])
                                        .filter((v, i, a) => a.indexOf(v) === i && v !== 'existing_legend')
                                        .map(v => (
                                          <div key={v} className="flex items-center gap-4 text-sm">
                                              <span className="font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded w-32 text-right">{`{${v}}`}</span>
                                              <span className="text-gray-400">maps to</span>
                                              <select 
                                                 className="flex-1 border border-gray-300 rounded p-1.5 bg-white text-gray-900"
                                                 value={variableMapping[v] || ''}
                                                 onChange={e => setVariableMapping(prev => ({ ...prev, [v]: e.target.value }))}
                                              >
                                                  <option value="">-- Auto / Default --</option>
                                                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                              </select>
                                          </div>
                                      ))}
                                      {![...analysisPrompt.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].length && (
                                          <p className="text-xs text-gray-400 italic">No variables detected in template (e.g. &#123;transcript_text&#125;).</p>
                                      )}
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>
                  
                  <div className="p-4 border-t bg-white flex justify-end gap-3">
                      <button 
                        onClick={() => {
                            if(confirm('Reset to defaults?')) {
                                setAnalysisPrompt(DEFAULT_ANALYSIS_PROMPT);
                                setSummaryPrompt(DEFAULT_SUMMARY_PROMPT);
                                setVariableMapping({});
                            }
                        }}
                        className="px-4 py-2 text-red-600 text-sm font-medium hover:bg-red-50 rounded"
                      >
                          Reset Defaults
                      </button>
                      <button 
                        onClick={() => setShowPromptModal(false)}
                        className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 shadow-sm"
                      >
                          Done
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL: TRANSCRIPT VIEWER */}
      {viewingTranscript && (
          <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-[60] flex items-center justify-center p-4">
               <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
                   <div className="p-4 border-b bg-gray-50 flex justify-between items-center rounded-t-xl">
                       <div>
                           <h3 className="font-bold text-gray-800">Conversation Detail</h3>
                           <p className="text-xs text-gray-500 font-mono">{viewingTranscript['conversation id'] || 'ID N/A'}</p>
                       </div>
                       <button onClick={() => setViewingTranscript(null)} className="p-2 hover:bg-gray-200 rounded-full text-gray-500"><X size={20}/></button>
                   </div>
                   <div className="flex-1 overflow-y-auto p-6 bg-white space-y-4">
                       {/* Metadata Grid */}
                       <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100 text-xs">
                           {Object.entries(viewingTranscript).filter(([k]) => !k.toLowerCase().includes('transcript')).slice(0, 9).map(([k, v]) => (
                               <div key={k}>
                                   <span className="block font-bold text-blue-800 uppercase opacity-70 mb-0.5">{k}</span>
                                   <span className="text-gray-800 break-words">{String(v)}</span>
                               </div>
                           ))}
                       </div>
                       
                       {/* Chat Log */}
                       <div className="space-y-3">
                           {(() => {
                               const tCol = headers.find(h => h.toLowerCase().includes('transcript')) || '';
                               const text = viewingTranscript[tCol] || '';
                               if (!text) return <p className="text-gray-400 italic text-center">No transcript text found.</p>;
                               
                               // Simple Split Logic (assuming "||" or newlines)
                               const turns = text.includes('||') ? text.split('||') : text.split('\n');
                               
                               return turns.map((turn:string, idx:number) => {
                                   if(!turn.trim()) return null;
                                   const isAgent = /amelia|agent|system|bot|virtual/i.test(turn.split(':')[0] || '');
                                   return (
                                       <div key={idx} className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
                                           <div className={`max-w-[85%] p-3 rounded-lg text-sm leading-relaxed shadow-sm ${isAgent ? 'bg-gray-100 text-gray-800 rounded-tl-none' : 'bg-blue-600 text-white rounded-tr-none'}`}>
                                               {turn}
                                           </div>
                                       </div>
                                   );
                               });
                           })()}
                       </div>
                   </div>
               </div>
          </div>
      )}

    </div>
  );
};

export default TranscriptAnalysis;
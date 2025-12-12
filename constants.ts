
export const WORKER_CODE = `
self.importScripts('https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js');

let rawDataStore = [];
let filterIndexes = {};
let aggregators = { totalContained: 0, totalHandleTimeSeconds: 0, validHandleTimeCount: 0, totalRows: 0 };
let headers = [];
let customMetricKeys = new Set();
let filterOptions = {};
let highCardinalityFields = [];
const standardHeaders = new Set(['conversation id', 'domain', 'created', 'ended', 'finished', 'status', 'channel', 'primary agent email', 'primary agent handle time', 'primary agent answer speed', 'pickup sla violation', 'escalated', 'escalation queue', 'escalation reason', 'abandoned', 'amelia handled', 'amelia abandoned', 'agent handled', 'agent abandoned', 'escalate abandoned', 'total handle time', 'executed bpns', 'user name', 'user email', 'user external uid', 'disconnect wait time', 'after conversation time', 'after conversation violation', 'resolution codes', 'custom metrics', 'transcript']);

function parseDate(dateString) {
    if (!dateString) return null;
    const match = dateString.match(/(\\d{4})-(\\d{2})-(\\d{2})[T ](\\d{2}):(\\d{2})/);
    if (!match) return null;
    const date = new Date(Date.UTC(match[1], match[2] - 1, match[3], match[4], match[5]));
    return isNaN(date) ? null : date;
}

function parseHandleTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const parts = timeStr.split(':');
    if (parts.length !== 3) return null;
    const [hours, minutes, seconds] = parts.map(Number);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
    return hours * 3600 + minutes * 60 + seconds;
}

function applyFilters(filters) {
    const totalRows = aggregators.totalRows;
    let matchingRowIndexes = new Set(Array.from({ length: totalRows }, (_, i) => i));

    for (const key in filters) {
        if (matchingRowIndexes.size === 0) break;
        const filterValue = filters[key];
        let newMatchingIndexes = new Set();

        if (key === 'dateRange') {
            const startDate = filterValue.start ? new Date(filterValue.start + 'T00:00:00Z') : null;
            const endDate = filterValue.end ? new Date(filterValue.end + 'T23:59:59Z') : null;
            if (!startDate && !endDate) continue;

            matchingRowIndexes.forEach(index => {
                const row = rawDataStore[index];
                const rowDate = parseDate(row.created);
                if (!rowDate) return;
                let passes = true;
                if (startDate && rowDate < startDate) passes = false;
                if (endDate && rowDate > endDate) passes = false;
                if (passes) newMatchingIndexes.add(index);
            });
        } else if (Array.isArray(filterValue) && filterValue.length > 0) {
            filterValue.forEach(val => {
                const indexedRows = filterIndexes[key]?.[val] || [];
                indexedRows.forEach(index => newMatchingIndexes.add(index));
            });
        } else if (typeof filterValue === 'string' && filterValue.length > 0) {
            const lowerCaseFilter = filterValue.toLowerCase();
            matchingRowIndexes.forEach(index => {
                const rowValue = String(rawDataStore[index][key.toLowerCase()] ?? '').toLowerCase();
                if (rowValue.includes(lowerCaseFilter)) newMatchingIndexes.add(index);
            });
        }
        matchingRowIndexes = new Set([...matchingRowIndexes].filter(i => newMatchingIndexes.has(i)));
    }
    return Array.from(matchingRowIndexes);
}

function calculateSummary(rowIndexes) {
    const summary = { peakConcurrency: 0, avgConcurrency: 0, timeRange: 'N/A' };
    if (rowIndexes.length === 0) return summary;

    const events = [];
    let totalHandleTimeMinutes = 0;
    let firstEventTime = Infinity;
    let lastEventTime = -Infinity;

    rowIndexes.forEach(index => {
        const row = rawDataStore[index];
        const start = parseDate(row.created);
        const end = parseDate(row.finished);
        if (start && end) {
            const startTime = start.getTime();
            const endTime = end.getTime();
            events.push({ time: startTime, type: 'start' });
            events.push({ time: endTime, type: 'end' });
            totalHandleTimeMinutes += (endTime - startTime) / (1000 * 60);
            if(startTime < firstEventTime) firstEventTime = startTime;
            if(endTime > lastEventTime) lastEventTime = endTime;
        }
    });

    if (events.length === 0) return summary;
    events.sort((a, b) => a.time - b.time);
    const totalDurationMinutes = (lastEventTime - firstEventTime) / (1000 * 60);
    if (totalDurationMinutes > 0) summary.avgConcurrency = totalHandleTimeMinutes / totalDurationMinutes;

    let maxConcurrency = 0, currentConcurrency = 0;
    for (const event of events) {
        if (event.type === 'start') {
            currentConcurrency++;
            if (currentConcurrency > maxConcurrency) maxConcurrency = currentConcurrency;
        } else {
            currentConcurrency--;
        }
    }
    summary.peakConcurrency = maxConcurrency;
    summary.timeRange = new Date(firstEventTime).toLocaleDateString() + ' - ' + new Date(lastEventTime).toLocaleDateString();
    return summary;
}

self.onmessage = function(e) {
    const { type, file, pagination, sortConfig, filters, filteredIndexes } = e.data;

    if (type === 'parse') {
        let rowIndex = 0;
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            worker: true,
            beforeFirstChunk: (chunk) => {
                const firstLine = chunk.substr(0, chunk.indexOf('\\n'));
                headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            },
            step: (results) => {
                const row = results.data;
                let processedRow = {};
                for (const key in row) {
                    processedRow[key.trim().toLowerCase()] = row[key];
                }
                const customMetricsRaw = processedRow['custom metrics'] || '';
                if (customMetricsRaw) {
                    customMetricsRaw.split('||').forEach(metric => {
                        const [key, value] = metric.split('=');
                        if (key) {
                            let trimmedKey = key.trim();
                            let lowerTrimmedKey = trimmedKey.toLowerCase();
                            if (standardHeaders.has(lowerTrimmedKey)) {
                                trimmedKey = trimmedKey + '_Custom';
                                lowerTrimmedKey = trimmedKey.toLowerCase();
                            }
                            processedRow[lowerTrimmedKey] = value ? value.trim() : null;
                            customMetricKeys.add(trimmedKey);
                        }
                    });
                }
                rawDataStore.push(processedRow);
                aggregators.totalRows++;
                if (processedRow['amelia handled'] === 'true') aggregators.totalContained++;
                const handleTimeSeconds = parseHandleTime(processedRow['total handle time']);
                if (handleTimeSeconds !== null) {
                    aggregators.totalHandleTimeSeconds += handleTimeSeconds;
                    aggregators.validHandleTimeCount++;
                }

                const allKeysForIndexing = [...new Set([...headers, ...Array.from(customMetricKeys)])];
                for (const header of allKeysForIndexing) {
                    const cleanHeader = header.trim();
                    const lowerHeader = cleanHeader.toLowerCase();
                    const value = processedRow[lowerHeader];
                    if (value != null && value !== '') {
                        if (!filterIndexes[cleanHeader]) filterIndexes[cleanHeader] = {};
                        if (!filterIndexes[cleanHeader][value]) filterIndexes[cleanHeader][value] = [];
                        filterIndexes[cleanHeader][value].push(rowIndex);
                    }
                }
                rowIndex++;
                self.postMessage({ type: 'parse-progress', loaded: results.meta.cursor });
            },
            complete: () => {
                const finalHeaders = [...new Set([...headers, ...Array.from(customMetricKeys)])];
                for (const header in filterIndexes) {
                    const uniqueValues = Object.keys(filterIndexes[header]);
                    if (header.toLowerCase() === 'transcript') {
                        highCardinalityFields.push(header);
                        continue;
                    }
                    if (uniqueValues.length > 0 && uniqueValues.length <= 200) {
                        filterOptions[header] = uniqueValues.sort();
                    } else if (uniqueValues.length > 200) {
                        highCardinalityFields.push(header);
                    }
                }
                const allRowIndexes = Array.from({ length: rawDataStore.length }, (_, i) => i);
                const summaryStats = calculateSummary(allRowIndexes);
                const avgSeconds = aggregators.validHandleTimeCount > 0 ? aggregators.totalHandleTimeSeconds / aggregators.validHandleTimeCount : 0;
                summaryStats.avgHandleTime = Math.floor(avgSeconds / 60).toString().padStart(2, '0') + ':' + Math.floor(avgSeconds % 60).toString().padStart(2, '0');
                
                self.postMessage({
                    type: 'parse-success',
                    headers: finalHeaders,
                    customMetricKeys: Array.from(customMetricKeys),
                    filterOptions: filterOptions,
                    highCardinalityFields: highCardinalityFields,
                    summaryStats: { ...summaryStats, totalRows: aggregators.totalRows, totalContained: aggregators.totalContained }
                });
            }
        });
    } else if (type === 'request-page') {
        const matchingIndexes = applyFilters(filters);
        let sortedIndexes = [...matchingIndexes];
        if (sortConfig && sortConfig.key) {
            const lowerCaseKey = sortConfig.key.toLowerCase();
            sortedIndexes.sort((a, b) => {
                const valA = rawDataStore[a][lowerCaseKey] || '';
                const valB = rawDataStore[b][lowerCaseKey] || '';
                const numA = parseFloat(valA), numB = parseFloat(valB);
                let compareA = valA, compareB = valB;
                if (!isNaN(numA) && !isNaN(numB) && valA && valB) { compareA = numA; compareB = numB; }
                if (compareA < compareB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (compareA > compareB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        const { currentPage, rowsPerPage } = pagination;
        const pageIndexes = sortedIndexes.slice((currentPage - 1) * rowsPerPage, (currentPage - 1) * rowsPerPage + rowsPerPage);
        const finalHeaders = [...new Set([...headers, ...Array.from(customMetricKeys)])];
        const pageData = pageIndexes.map(index => {
            const rawRow = rawDataStore[index];
            let casedRow = {};
            finalHeaders.forEach(header => { casedRow[header] = rawRow[header.toLowerCase()]; });
            return casedRow;
        });
        
        // Calculate filtered stats
        let filteredContained = 0;
        let filteredHandleTimeSum = 0;
        let filteredHandleTimeCount = 0;
        matchingIndexes.forEach(index => {
            const row = rawDataStore[index];
            if (row['amelia handled'] === 'true') filteredContained++;
            const ht = parseHandleTime(row['total handle time']);
            if (ht !== null) {
                filteredHandleTimeSum += ht;
                filteredHandleTimeCount++;
            }
        });
        const avgSeconds = filteredHandleTimeCount > 0 ? filteredHandleTimeSum / filteredHandleTimeCount : 0;
        const avgHandleTime = Math.floor(avgSeconds / 60).toString().padStart(2, '0') + ':' + Math.floor(avgSeconds % 60).toString().padStart(2, '0');

        const filteredSummary = calculateSummary(matchingIndexes);
        filteredSummary.totalContained = filteredContained;
        filteredSummary.avgHandleTime = avgHandleTime;

        self.postMessage({
            type: 'page-data',
            data: pageData,
            totalFilteredRows: matchingIndexes.length,
            filteredSummary: filteredSummary,
            filteredIndexes: matchingIndexes,
            fileTotalRows: aggregators.totalRows // Send global total
        });
    } else if (type === 'request-csv-string') {
        const finalHeaders = [...new Set([...headers, ...Array.from(customMetricKeys)])];
        const dataToExport = filteredIndexes.map(index => {
             const rawRow = rawDataStore[index];
             let casedRow = {};
             finalHeaders.forEach(header => { casedRow[header] = rawRow[header.toLowerCase()]; });
             return casedRow;
        });
        const csv = Papa.unparse({ fields: finalHeaders, data: dataToExport });
        self.postMessage({ type: 'csv-string-data', csvString: csv });
    } else if (type === 'request-analysis') {
         const matchingIndexes = e.data.useFilteredData ? filteredIndexes : Array.from({ length: rawDataStore.length }, (_, i) => i);
         
         const dailyAggregation = {}, handleTimeAggregation = {}, containmentAggregation = {};
         const dailyEvents = {};
         let totalContainedInFiltered = 0;

         matchingIndexes.forEach(index => {
            const row = rawDataStore[index];
            const start = parseDate(row.created);
            const end = parseDate(row.finished);
            if(start && end) {
                const dateString = start.toISOString().slice(0, 10);
                const handleTime = parseHandleTime(row['total handle time']);
                const key = (row.domain || 'Unknown') + '|' + (row.channel || 'Unknown') + '|' + dateString;
                
                if (!dailyAggregation[key]) dailyAggregation[key] = { domain: row.domain, channel: row.channel, date: dateString, count: 0 };
                dailyAggregation[key].count++;

                if(handleTime !== null) {
                    if(!handleTimeAggregation[dateString]) handleTimeAggregation[dateString] = { total: 0, count: 0 };
                    handleTimeAggregation[dateString].total += handleTime;
                    handleTimeAggregation[dateString].count++;
                }

                if(!containmentAggregation[dateString]) containmentAggregation[dateString] = { contained: 0, total: 0 };
                containmentAggregation[dateString].total++;
                if(row['amelia handled'] === 'true') {
                    containmentAggregation[dateString].contained++;
                    totalContainedInFiltered++;
                }
                
                if(!dailyEvents[dateString]) dailyEvents[dateString] = [];
                dailyEvents[dateString].push({ time: start.getTime(), type: 'start' });
                dailyEvents[dateString].push({ time: end.getTime(), type: 'end' });
            }
         });

         // Concurrency Trend Data Calculation
         const concurrencyTrendData = Object.keys(dailyEvents).map(date => {
             const events = dailyEvents[date].sort((a,b) => a.time - b.time);
             let max = 0, current = 0;
             let weightedSum = 0;
             let dayDuration = 0;
             
             if(events.length > 1) {
                 dayDuration = (events[events.length-1].time - events[0].time) / (1000 * 60); // minutes
                 for(let i=0; i < events.length; i++) {
                     const e = events[i];
                     // Add duration from previous event to this one for weighted avg
                     if (i > 0) {
                        const duration = (e.time - events[i-1].time) / (1000 * 60);
                        weightedSum += current * duration;
                     }

                     if(e.type === 'start') {
                         current++;
                         if(current > max) max = current;
                     } else {
                         current--;
                     }
                 }
             }
             return { date, max, avg: dayDuration > 0 ? weightedSum / dayDuration : 0 };
         }).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
         
         const volumeData = Object.values(dailyAggregation);
         const handleTimeData = Object.entries(handleTimeAggregation).map(([date, d]) => ({ date, avgMinutes: (d.total/d.count)/60 })).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
         const containmentTrendData = Object.entries(containmentAggregation).map(([date, d]) => ({ date, rate: d.total > 0 ? (d.contained/d.total)*100 : 0 })).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

         let totalMaxConcurrency = 0;
         concurrencyTrendData.forEach(d => { if(d.max > totalMaxConcurrency) totalMaxConcurrency = d.max; });

         self.postMessage({
             type: 'analysis-result',
             data: {
                 volumeData,
                 handleTimeData,
                 containmentTrendData,
                 concurrencyTrendData,
                 summary: {
                     filteredPeakConcurrency: totalMaxConcurrency,
                     filteredConversations: matchingIndexes.length,
                     overallContainmentRate: matchingIndexes.length > 0 ? ((totalContainedInFiltered/matchingIndexes.length)*100).toFixed(1) : 0
                 }
             }
         });
    } else if (type === 'request-transcript-data') {
         const finalHeaders = [...new Set([...headers, ...Array.from(customMetricKeys)])];
         const rows = filteredIndexes.map(index => {
             const rawRow = rawDataStore[index];
             let casedRow = {};
             finalHeaders.forEach(header => { casedRow[header] = rawRow[header.toLowerCase()]; });
             return casedRow;
         });
         self.postMessage({ type: 'transcript-data-result', rows: rows });
    }
};
`;

export const TA_MODEL_INFO: Record<string, { name: string; rpm: number }> = {
    'gemini-2.5-pro': { name: 'Gemini 2.5 Pro', rpm: 2 },
    'gemini-2.5-flash': { name: 'Gemini 2.5 Flash', rpm: 10 },
    'gemini-2.5-flash-preview': { name: 'Gemini 2.5 Flash Preview', rpm: 10 },
    'gemini-2.5-flash-lite': { name: 'Gemini 2.5 Flash Lite', rpm: 15 },
    'gemini-2.5-flash-lite-preview': { name: 'Gemini 2.5 Flash Lite Preview', rpm: 15 },
    'gemini-2.0-flash': { name: 'Gemini 2.0 Flash', rpm: 15 },
    'gemini-2.0-flash-lite': { name: 'Gemini 2.0 Flash Lite', rpm: 30 }
};

export const PII_PATTERNS = {
    EMAIL: { 
        label: 'Email Addresses', 
        regex: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b", 
        replace: '[EMAIL_REDACTED]' 
    },
    PHONE: { 
        label: 'Phone Numbers', 
        regex: "\\b(\\+?1?[-.]?\\s?(\\(?\\d{3}\\)?[-.]?\\s?)?\\d{3}[-.]?\\s?\\d{4})\\b", 
        replace: '[PHONE_REDACTED]' 
    },
    SSN: {
        label: 'SSN / ID Numbers',
        regex: "\\b(?!000|666|9\\d{2})\\d{3}[- ](?!00)\\d{2}[- ](?!0000)\\d{4}\\b",
        replace: '[SSN_REDACTED]'
    },
    IPV4: {
        label: 'IPv4 Addresses',
        regex: "\\b((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b",
        replace: '[IP_REDACTED]'
    },
    CREDIT_CARD: {
        label: 'Credit Card Numbers',
        regex: "\\b(?:\\d{4}[- ]?){3}\\d{4}\\b",
        replace: '[CC_REDACTED]'
    }
};

export const DEFAULT_ANALYSIS_PROMPT = `You are an expert analyst. Analyze this transcript:
---
{transcript_text}
---
Respond ONLY with valid JSON:
{
  "intent": { "name": "SHORT_NAME", "description": "Goal" },
  "successes": [{ "name": "NAME", "description": "Desc" }],
  "failures": [{ "name": "NAME", "description": "Desc" }],
  "overall": "Summary"
}`;

export const DEFAULT_CUSTOM_PROMPT = `You are an expert analyst.
User Criteria: "{user_query}"
Transcript:
---
{transcript_text}
---
Respond ONLY with valid JSON:
{
  "match": true,
  "reasoning": "Why",
  "evidence": "Quote"
}`;

export const INTERMEDIATE_BATCH_PROMPT = `You are a senior analyst helper.
Analyze the following batch of {count} conversation insights.
Consolidate them into a single JSON object.
Aggregate the 'top_intents' (with counts), 'common_successes', and 'top_failures' found in this batch.
Do NOT write an 'overall_performance' summary yet, just aggregate the data points.

Respond ONLY with valid JSON:
{
  "top_intents": [ { "intent": "Name", "count": 0, "details": "Merged details" } ],
  "common_successes": [ { "success": "Name", "count": 0, "details": "Merged details" } ],
  "top_failures": [ { "failure": "Name", "count": 0, "details": "Merged details" } ]
}

---
Batch Insights:
---
{batch_insights}`;

export const DEFAULT_SUMMARY_PROMPT = `You are a senior analyst. Please review the following {insight_count} individual transcript analyses (or batched summaries) and provide a high-level executive summary of common themes.

Respond ONLY with a valid JSON object in the following format:
{
  "top_intents": [
    { "intent": "Example: User needed a password reset", "count": 15, "details": "A brief explanation of this intent category." },
    { "intent": "Example: User had a VPN issue", "count": 10, "details": "..." }
  ],
  "common_successes": [
    { "success": "Example: AI correctly identified issue", "count": 20, "details": "..." },
    { "success": "Example: AI provided clear instructions", "count": 8, "details": "..." }
  ],
  "top_failures": [
    { "failure": "Example: AI misunderstood user's request", "count": 12, "details": "..." },
    { "failure": "Example: AI got stuck in a loop", "count": 5, "details": "..." }
  ],
  "overall_performance": "A one or two-sentence conclusion on the AI's effectiveness based on the data."
}

---
Here are the {insight_count} analyses:
---

{all_insights}
`;

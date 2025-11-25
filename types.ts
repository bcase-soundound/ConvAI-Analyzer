export interface SummaryStats {
    timeRange: string;
    totalRows: number;
    peakConcurrency: number;
    avgConcurrency: number;
    totalContained: number;
    avgHandleTime: string;
}

export interface FilterState {
    dateRange?: { start?: string; end?: string };
    [key: string]: string[] | string | { start?: string; end?: string } | undefined;
}

export interface Pagination {
    currentPage: number;
    rowsPerPage: number;
}

export interface ParsedDataResponse {
    headers: string[];
    customMetricKeys: string[];
    filterOptions: Record<string, string[]>;
    highCardinalityFields: string[];
    summaryStats: SummaryStats;
}

export interface AnalysisResult {
    originalRow: any;
    insightObject: any;
    error: string | null;
}
import React from 'react';
import { SummaryStats } from '../types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';

interface Props {
  stats: SummaryStats;
  data: any[];
  headers: string[];
  customMetrics: string[];
  pagination: { currentPage: number; rowsPerPage: number };
  onPageChange: (page: number) => void;
  sortConfig: { key: string | null; direction: string };
  onSortChange: (key: string) => void;
  filteredCount: number;
}

const Dashboard: React.FC<Props> = ({ 
  stats, data, headers, customMetrics, 
  pagination, onPageChange, sortConfig, onSortChange, filteredCount 
}) => {
  const displayHeaders = headers.filter(h => h.toLowerCase() !== 'custom metrics');
  
  const pieData = [
    { name: 'Filtered', value: filteredCount },
    { name: 'Other', value: stats.totalRows - filteredCount },
  ];
  const COLORS = ['#3b82f6', '#e5e7eb'];

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-shrink-0">
        
        {/* Summary Panel - Takes 2 cols */}
        <div className="lg:col-span-2">
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Time Range" value={stats.timeRange} hint="The date and time span covered." />
              <StatCard title="Total Conversations" value={stats.totalRows.toLocaleString()} hint="Total rows in CSV." />
              <StatCard title="Filtered Conversations" value={filteredCount.toLocaleString()} hint="Rows matching active filters." />
              <StatCard title="Avg. Handle Time" value={stats.avgHandleTime} hint="Avg duration (Finished - Created)." />
              <StatCard title="Peak Concurrency" value={stats.peakConcurrency.toLocaleString()} hint="Max active conversations at same second." />
              <StatCard title="Avg. Concurrency" value={stats.avgConcurrency.toFixed(2)} hint="Weighted average of active conversations." />
              <StatCard title="Total Contained" value={stats.totalContained.toLocaleString()} hint="Conversations marked 'Amelia Handled' = true." />
              {/* Spacer or extra metric could go here to complete 8 grid cells, or leave 7 */}
           </div>
        </div>

        {/* Main Chart - Takes 1 col */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 lg:col-span-1 flex flex-col h-full min-h-[300px]">
            <h3 className="text-center font-semibold text-gray-700">Filtered vs. Total</h3>
            <div className="flex-grow flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                        <Pie 
                          data={pieData} 
                          innerRadius={60} 
                          outerRadius={80} 
                          dataKey="value" 
                          startAngle={90} 
                          endAngle={-270}
                          stroke="none"
                        >
                            {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                     <span className="text-3xl font-bold text-blue-600">
                         {stats.totalRows > 0 ? ((filteredCount / stats.totalRows) * 100).toFixed(1) : 0}%
                     </span>
                     <p className="text-sm text-gray-500">Filtered</p>
                </div>
            </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="mt-6 bg-white rounded-xl shadow-md flex-grow flex flex-col overflow-hidden border border-gray-200 min-h-[500px]">
           <div className="overflow-auto flex-1">
               <table className="min-w-full divide-y divide-gray-200">
                   <thead className="bg-gray-50 sticky top-0 z-10">
                       <tr>
                           {displayHeaders.map(h => (
                               <th key={h} onClick={() => onSortChange(h)} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer whitespace-nowrap">
                                   <div className="flex items-center gap-1">
                                       {h}
                                       {sortConfig.key === h && (
                                           sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'
                                       )}
                                   </div>
                               </th>
                           ))}
                           {customMetrics.map(h => (
                               <th key={h} onClick={() => onSortChange(h)} className="px-6 py-3 text-left text-xs font-medium text-green-600 bg-green-50 uppercase tracking-wider cursor-pointer whitespace-nowrap">
                                    <div className="flex items-center gap-1">
                                       {h}
                                       {sortConfig.key === h && (
                                           sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'
                                       )}
                                   </div>
                               </th>
                           ))}
                       </tr>
                   </thead>
                   <tbody className="bg-white divide-y divide-gray-200">
                       {data.length > 0 ? data.map((row, i) => (
                           <tr key={i}>
                               {displayHeaders.map(h => (
                                   <td key={h} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{String(row[h] ?? '')}</td>
                               ))}
                               {customMetrics.map(h => (
                                   <td key={h} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 bg-green-50">{String(row[h] ?? '')}</td>
                               ))}
                           </tr>
                       )) : (
                           <tr><td colSpan={displayHeaders.length + customMetrics.length} className="text-center py-10 text-gray-500">No conversations match the current filters.</td></tr>
                       )}
                   </tbody>
               </table>
           </div>
           
           {/* Pagination */}
           <div className="flex-shrink-0 p-2 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600 bg-white">
               <div>
                   Showing {(pagination.currentPage - 1) * pagination.rowsPerPage + 1} to {Math.min(pagination.currentPage * pagination.rowsPerPage, filteredCount)} of {filteredCount.toLocaleString()} results
               </div>
               <div className="flex items-center gap-2">
                   <button 
                       disabled={pagination.currentPage === 1}
                       onClick={() => onPageChange(pagination.currentPage - 1)}
                       className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                       Previous
                   </button>
                   <span>Page {pagination.currentPage} of {Math.max(1, Math.ceil(filteredCount / pagination.rowsPerPage))}</span>
                   <button 
                       disabled={pagination.currentPage >= Math.ceil(filteredCount / pagination.rowsPerPage)}
                       onClick={() => onPageChange(pagination.currentPage + 1)}
                       className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                       Next
                   </button>
               </div>
           </div>
      </div>
    </>
  );
};

const StatCard: React.FC<{ title: string; value: string; hint?: string }> = ({ title, value, hint }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 relative group">
        <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium text-gray-500">{title}</h3>
            {hint && (
                <div className="relative group cursor-help">
                     {/* Simple Info Icon */}
                     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 hover:text-blue-500"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                     <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none text-center leading-tight">
                        {hint}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-800"></div>
                     </div>
                </div>
            )}
        </div>
        <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
    </div>
);

export default Dashboard;
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
  const COLORS = ['#3b82f6', '#e2e8f0'];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Conversations" value={stats.totalRows.toLocaleString()} />
        <StatCard title="Filtered Count" value={filteredCount.toLocaleString()} highlight />
        <StatCard title="Avg Handle Time" value={stats.avgHandleTime} />
        <StatCard title="Contained" value={stats.totalContained.toLocaleString()} />
        <StatCard title="Peak Concurrency" value={stats.peakConcurrency.toLocaleString()} />
        <StatCard title="Avg Concurrency" value={stats.avgConcurrency.toFixed(2)} />
        <StatCard title="Time Range" value={stats.timeRange} colSpan={2} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Main Chart */}
         <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-1 flex flex-col items-center justify-center">
            <h3 className="text-slate-700 font-semibold mb-4">Filtered vs Total</h3>
            <div className="h-64 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={pieData} innerRadius={60} outerRadius={80} dataKey="value" startAngle={90} endAngle={-270}>
                            {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                     <div className="text-center pb-8">
                         <span className="text-2xl font-bold text-blue-600">
                             {stats.totalRows > 0 ? ((filteredCount / stats.totalRows) * 100).toFixed(1) : 0}%
                         </span>
                     </div>
                </div>
            </div>
         </div>

         {/* Data Table */}
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 lg:col-span-2 flex flex-col overflow-hidden h-[400px]">
             <div className="overflow-auto flex-1">
                 <table className="min-w-full divide-y divide-slate-200">
                     <thead className="bg-slate-50 sticky top-0">
                         <tr>
                             {displayHeaders.map(h => (
                                 <th key={h} onClick={() => onSortChange(h)} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 whitespace-nowrap">
                                     <div className="flex items-center gap-1">
                                         {h}
                                         {sortConfig.key === h && (
                                             sortConfig.direction === 'ascending' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>
                                         )}
                                     </div>
                                 </th>
                             ))}
                             {customMetrics.map(h => (
                                 <th key={h} onClick={() => onSortChange(h)} className="px-6 py-3 text-left text-xs font-medium text-green-700 bg-green-50 uppercase tracking-wider cursor-pointer hover:bg-green-100 whitespace-nowrap">
                                      <div className="flex items-center gap-1">
                                         {h}
                                         {sortConfig.key === h && (
                                             sortConfig.direction === 'ascending' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>
                                         )}
                                     </div>
                                 </th>
                             ))}
                         </tr>
                     </thead>
                     <tbody className="bg-white divide-y divide-slate-200">
                         {data.length > 0 ? data.map((row, i) => (
                             <tr key={i} className="hover:bg-slate-50">
                                 {displayHeaders.map(h => (
                                     <td key={h} className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{String(row[h] ?? '')}</td>
                                 ))}
                                 {customMetrics.map(h => (
                                     <td key={h} className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 bg-green-50/50">{String(row[h] ?? '')}</td>
                                 ))}
                             </tr>
                         )) : (
                             <tr><td colSpan={displayHeaders.length + customMetrics.length} className="p-8 text-center text-slate-500">No data found</td></tr>
                         )}
                     </tbody>
                 </table>
             </div>
             
             {/* Pagination */}
             <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between">
                 <span className="text-sm text-slate-600">
                     Page {pagination.currentPage} of {Math.ceil(filteredCount / pagination.rowsPerPage)}
                 </span>
                 <div className="flex gap-2">
                     <button 
                         disabled={pagination.currentPage === 1}
                         onClick={() => onPageChange(pagination.currentPage - 1)}
                         className="p-1 border rounded hover:bg-slate-100 disabled:opacity-50"
                     >
                         <ChevronLeft size={20} />
                     </button>
                     <button 
                         disabled={pagination.currentPage >= Math.ceil(filteredCount / pagination.rowsPerPage)}
                         onClick={() => onPageChange(pagination.currentPage + 1)}
                         className="p-1 border rounded hover:bg-slate-100 disabled:opacity-50"
                     >
                         <ChevronRight size={20} />
                     </button>
                 </div>
             </div>
         </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string; highlight?: boolean; colSpan?: number }> = ({ title, value, highlight, colSpan }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border border-slate-200 ${colSpan ? `lg:col-span-${colSpan}` : ''}`}>
        <h3 className="text-sm font-medium text-slate-500 mb-1">{title}</h3>
        <p className={`text-2xl font-bold ${highlight ? 'text-blue-600' : 'text-slate-800'}`}>{value}</p>
    </div>
);

export default Dashboard;
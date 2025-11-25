import React from 'react';
import { X, TrendingUp } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Props {
    data: any;
    onClose: () => void;
}

const DeeperAnalysis: React.FC<Props> = ({ data, onClose }) => {
    // Color palette
    const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

    return (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                    <TrendingUp className="text-indigo-600" /> Deeper Analysis
                </h2>
                <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded">
                    <X size={20} />
                </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-8">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-50 p-4 rounded-lg text-center">
                        <h4 className="text-slate-500 text-sm">Filtered Conversations</h4>
                        <p className="text-2xl font-bold text-slate-800">{data.summary.filteredConversations.toLocaleString()}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-lg text-center">
                        <h4 className="text-slate-500 text-sm">Peak Concurrency</h4>
                        <p className="text-2xl font-bold text-indigo-600">{data.summary.filteredPeakConcurrency}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-lg text-center">
                        <h4 className="text-slate-500 text-sm">Containment Rate</h4>
                        <p className="text-2xl font-bold text-green-600">{data.summary.overallContainmentRate}%</p>
                    </div>
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Concurrency */}
                    <div className="border p-4 rounded-lg h-80">
                        <h3 className="text-center font-semibold mb-2">Concurrency Trend</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.concurrencyTrendData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="max" stroke="#ef4444" name="Max" dot={false} />
                                <Line type="monotone" dataKey="avg" stroke="#f97316" name="Avg" dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                     {/* Containment */}
                     <div className="border p-4 rounded-lg h-80">
                        <h3 className="text-center font-semibold mb-2">Containment Trend (%)</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.containmentTrendData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis domain={[0, 100]} />
                                <Tooltip />
                                <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Handle Time */}
                    <div className="border p-4 rounded-lg h-80">
                        <h3 className="text-center font-semibold mb-2">Avg Handle Time (Mins)</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.handleTimeData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Line type="monotone" dataKey="avgMinutes" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                     {/* Volume (Simplified) */}
                     <div className="border p-4 rounded-lg h-80">
                        <h3 className="text-center font-semibold mb-2">Volume Distribution (Raw)</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.volumeData.slice(0, 50)}> {/* Limit for performance in demo */}
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="count" fill="#3b82f6" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DeeperAnalysis;
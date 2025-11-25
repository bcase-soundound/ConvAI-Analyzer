import React, { useRef } from 'react';
import { UploadCloud, FileText, AlertCircle } from 'lucide-react';

interface Props {
  onUpload: (file: File) => void;
  isLoading: boolean;
  progress: string;
  error: string;
}

const FileUpload: React.FC<Props> = ({ onUpload, isLoading, progress, error }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) onUpload(e.dataTransfer.files[0]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) onUpload(e.target.files[0]);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mb-4"></div>
        <p className="text-lg font-semibold text-slate-700">Processing File...</p>
        <p className="text-sm text-slate-500 mt-2">{progress}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div 
        className="w-full max-w-lg p-12 border-2 border-dashed border-slate-300 rounded-xl bg-white hover:bg-slate-50 transition-colors cursor-pointer text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <UploadCloud className="text-blue-600" size={32} />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">Drag & Drop CSV File</h3>
        <p className="text-slate-500 mb-6">or click to browse</p>
        <button className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
          Browse Files
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleChange} />
        <p className="text-xs text-slate-400 mt-4">Only *.csv files supported</p>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 max-w-lg w-full border border-red-200">
          <AlertCircle size={20} />
          {error}
        </div>
      )}
      
      <div className="mt-10 text-center max-w-md">
         <h1 className="text-2xl font-bold text-slate-800 mb-2">Conversation Analyzer</h1>
         <p className="text-slate-600">Upload your conversation logs to gain insights into intent, sentiment, and operational metrics.</p>
      </div>
    </div>
  );
};

export default FileUpload;
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
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
        <p className="text-lg font-semibold text-gray-700">Processing your file...</p>
        <p className="text-sm text-gray-500 mt-2">{progress}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
      <div 
        className="w-full max-w-lg p-10 border-2 border-dashed border-gray-300 rounded-xl bg-white hover:bg-gray-100 transition-colors cursor-pointer"
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50'); }}
        onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50'); }}
        onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50'); handleDrop(e); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="flex flex-col items-center justify-center space-y-4 pointer-events-none">
            <div className="bg-blue-100 p-4 rounded-full">
               <UploadCloud className="text-blue-600" size={40} />
            </div>
            <p className="text-lg font-semibold text-gray-700">Drag & drop your CSV file here</p>
            <p className="text-sm text-gray-500">or</p>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors pointer-events-auto">
              Browse files
            </button>
            <p className="text-xs text-gray-400 mt-2">Only *.csv files are accepted</p>
        </div>
        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleChange} />
      </div>

      {error && (
        <p className="text-red-500 mt-4">{error}</p>
      )}
      
      <div className="mt-8 text-left max-w-lg w-full">
         <h3 className="text-xl font-bold text-gray-800 mb-2">Welcome to the Conversation Analyzer</h3>
         <p className="text-gray-600">This tool helps you process and analyze conversation reports. Simply upload your CSV file to get started.</p>
      </div>
    </div>
  );
};

export default FileUpload;
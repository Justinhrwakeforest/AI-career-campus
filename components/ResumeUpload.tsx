
import React, { useState } from 'react';
import { ResumeInput } from '../types';

interface Props {
  onSubmit: (input: ResumeInput) => void;
}

const getMimeType = (file: File): string => {
  if (file.type && file.type !== 'application/octet-stream') {
    return file.type;
  }
  
  const extension = file.name.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'txt': return 'text/plain';
    default: return file.type || 'application/pdf'; // Default to PDF if unknown, often works better than octet-stream
  }
};

const ResumeUpload: React.FC<Props> = ({ onSubmit }) => {
  const [text, setText] = useState('');
  const [fileInput, setFileInput] = useState<{ data: string; mimeType: string; fileName: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = async (file: File) => {
    if (!file) return;

    const mimeType = getMimeType(file);
    const reader = new FileReader();
    
    if (mimeType === 'text/plain') {
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setText(content);
        setFileInput(null);
      };
      reader.readAsText(file);
    } else {
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (!result) return;
        const base64 = result.split(',')[1];
        setFileInput({
          data: base64,
          mimeType: mimeType,
          fileName: file.name
        });
        setText(''); // Clear text if a file is selected
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleSubmit = () => {
    if (fileInput) {
      onSubmit({ type: 'file', ...fileInput });
    } else if (text.trim()) {
      onSubmit({ type: 'text', content: text });
    }
  };

  const isSubmitDisabled = !text.trim() && !fileInput;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">Prepare for Success</h2>
        <p className="text-slate-600 text-lg">
          Upload your resume (PDF, Image, Text) or paste its content to start.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">Option 1: Paste Resume Text</label>
          <textarea
            className={`w-full h-64 p-4 border rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none text-slate-700 ${
              fileInput ? 'opacity-50 pointer-events-none' : 'border-slate-200'
            }`}
            placeholder="Experience, Skills, Projects..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {fileInput && (
            <p className="text-xs text-blue-600 font-medium">Clear selected file to use text input</p>
          )}
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">Option 2: Upload Document</label>
          <div 
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            className={`w-full h-64 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 transition-all relative ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50'
            } ${text.trim() ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {fileInput ? (
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mb-4 text-white mx-auto shadow-lg shadow-blue-100">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </div>
                <p className="text-slate-900 font-bold truncate max-w-[200px] mb-1">{fileInput.fileName}</p>
                <p className="text-slate-500 text-xs mb-4 uppercase tracking-tighter">{fileInput.mimeType}</p>
                <button 
                  onClick={(e) => { e.stopPropagation(); setFileInput(null); }}
                  className="text-red-500 text-sm font-semibold hover:underline"
                >
                  Remove File
                </button>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 text-blue-600">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <p className="text-slate-600 text-center font-medium">PDF, PNG, JPG, or TXT</p>
                <p className="text-slate-400 text-xs mt-1">Drag and drop or browse</p>
                <input 
                  type="file" 
                  accept=".txt,.pdf,.png,.jpg,.jpeg" 
                  className="hidden" 
                  id="file-upload" 
                  onChange={handleFileChange}
                />
                <button 
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="mt-6 px-6 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium shadow-sm"
                >
                  Browse Files
                </button>
              </>
            )}
          </div>
          {text.trim() && (
            <p className="text-xs text-blue-600 font-medium">Clear text input to upload a file</p>
          )}
        </div>
      </div>

      <div className="mt-12 flex justify-center">
        <button
          disabled={isSubmitDisabled}
          onClick={handleSubmit}
          className={`px-12 py-4 rounded-full text-white font-bold text-lg shadow-lg transform transition-all active:scale-95 ${
            !isSubmitDisabled 
              ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200 cursor-pointer' 
              : 'bg-slate-300 cursor-not-allowed'
          }`}
        >
          Start My Interview
        </button>
      </div>
    </div>
  );
};

export default ResumeUpload;

import React, { useState, useEffect } from 'react';
import { AppStage, ResumeData, InterviewMessage, ResumeInput } from './types';
import { analyzeResume } from './services/geminiService';
import ResumeUpload from './components/ResumeUpload';
import InterviewLiveSession from './components/InterviewLiveSession';
import FeedbackView from './components/FeedbackView';

const App: React.FC = () => {
  const [stage, setStage] = useState<AppStage>(AppStage.UPLOAD);
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);

  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
        // Fallback for non-selector environments
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  const handleOpenKeySelector = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true); // Assume success per guidelines
    }
  };

  const handleResumeSubmit = async (input: ResumeInput) => {
    try {
      setStage(AppStage.ANALYZING);
      const analyzed = await analyzeResume(input);
      setResumeData(analyzed);
      setStage(AppStage.INTERVIEW);
    } catch (err: any) {
      console.error(err);
      setError("Failed to analyze resume. Please try again with a clear document or text.");
      setStage(AppStage.UPLOAD);
    }
  };

  const handleInterviewComplete = (finalMessages: InterviewMessage[]) => {
    setMessages(finalMessages);
    setStage(AppStage.FEEDBACK);
  };

  const reset = () => {
    setStage(AppStage.UPLOAD);
    setResumeData(null);
    setMessages([]);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
        <header className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
              C
            </div>
            <h1 className="text-xl font-bold text-slate-800">CareerCompass <span className="text-blue-600">AI</span></h1>
          </div>
          {stage !== AppStage.UPLOAD && (
            <button 
              onClick={reset}
              className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              Start Over
            </button>
          )}
        </header>

        <main className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          {!hasApiKey && stage === AppStage.INTERVIEW ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">API Key Required</h2>
              <p className="text-slate-600 max-w-md mb-6">
                The Live Interview feature requires a valid Gemini API key from a paid GCP project.
              </p>
              <div className="flex flex-col space-y-3">
                <button 
                  onClick={handleOpenKeySelector}
                  className="px-8 py-3 bg-blue-600 text-white rounded-full font-bold shadow-lg hover:bg-blue-700 transition-all active:scale-95"
                >
                  Select API Key
                </button>
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm hover:underline">
                  View Billing Documentation
                </a>
              </div>
            </div>
          ) : (
            <>
              {stage === AppStage.UPLOAD && (
                <ResumeUpload onSubmit={handleResumeSubmit} />
              )}

              {stage === AppStage.ANALYZING && (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-6"></div>
                  <h2 className="text-2xl font-semibold text-slate-800 mb-2">Analyzing your profile...</h2>
                  <p className="text-slate-500 text-center max-w-md">
                    Gemini is parsing your resume to build a tailored interview experience.
                  </p>
                </div>
              )}

              {stage === AppStage.INTERVIEW && resumeData && (
                <InterviewLiveSession 
                  resumeData={resumeData} 
                  onComplete={handleInterviewComplete}
                />
              )}

              {stage === AppStage.FEEDBACK && (
                <FeedbackView messages={messages} resumeData={resumeData!} onReset={reset} />
              )}
            </>
          )}
        </main>
      </div>
      
      <footer className="mt-8 text-slate-400 text-sm">
        Powered by Gemini 2.5 Flash Native Audio
      </footer>
    </div>
  );
};

export default App;

import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { InterviewMessage, ResumeData } from '../types';

interface Competency {
  name: string;
  score: number;
  description: string;
}

interface Assessment {
  strengths: string[];
  improvements: string[];
  score: number;
  overallFeedback: string;
  competencies: Competency[];
}

interface Props {
  messages: InterviewMessage[];
  resumeData: ResumeData;
  onReset: () => void;
}

const FeedbackView: React.FC<Props> = ({ messages, resumeData, onReset }) => {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getFeedback = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
        const chatHistory = messages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Analyze this interview transcript and provide a constructive performance review based on the candidate's resume summary: "${resumeData.summary}". 
          
          Interview Transcript:
          ${chatHistory}
          
          Provide a detailed assessment including an overall score (0-100) and specific scores for these competencies:
          1. Technical Proficiency: How well they demonstrated the skills from their resume.
          2. Communication: Clarity, professional tone, and responsiveness.
          3. Resume Alignment: How consistent their answers were with the provided background.
          4. Problem Solving: Their approach to technical or situational questions.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
                score: { type: Type.NUMBER },
                overallFeedback: { type: Type.STRING },
                competencies: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      score: { type: Type.NUMBER },
                      description: { type: Type.STRING }
                    },
                    required: ["name", "score", "description"]
                  }
                }
              },
              required: ["strengths", "improvements", "score", "overallFeedback", "competencies"]
            }
          }
        });

        const data = JSON.parse(response.text || '{}');
        setAssessment(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (messages.length > 0) {
      getFeedback();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 bg-blue-600 rounded-3xl animate-bounce mb-8 flex items-center justify-center shadow-2xl shadow-blue-200">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-10 h-10">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.456-2.455l.259-1.036.259 1.036a3.375 3.375 0 0 0 2.455 2.456l1.036.259-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Analyzing Your Session</h2>
        <p className="text-slate-500 max-w-sm">
          CareerCompass AI is calculating your competencies and generating a detailed growth map...
        </p>
      </div>
    );
  }

  if (!assessment && !loading) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">No data available</h2>
        <button onClick={onReset} className="px-6 py-2 bg-blue-600 text-white rounded-xl">Start Over</button>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-700 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6">
        <div>
          <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Interview Scorecard</h2>
          <p className="text-slate-500 text-lg mt-1 font-medium">Detailed breakdown of your professional alignment.</p>
        </div>
        <div className="flex items-center space-x-3 bg-gradient-to-br from-blue-600 to-blue-700 p-8 rounded-[2.5rem] shadow-2xl shadow-blue-200 text-white">
          <div className="text-6xl font-black">{assessment?.score}</div>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-widest opacity-70">Overall</span>
            <span className="text-sm font-semibold">/ 100</span>
          </div>
        </div>
      </div>

      {/* Competencies Section */}
      <div className="mb-12">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mb-6">Competency Breakdown</h3>
        <div className="grid gap-6">
          {assessment?.competencies.map((comp, idx) => (
            <div key={idx} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex flex-col">
                  <span className="text-lg font-bold text-slate-800">{comp.name}</span>
                  <span className="text-sm text-slate-500 leading-snug">{comp.description}</span>
                </div>
                <div className="text-2xl font-black text-blue-600 ml-4">{comp.score}%</div>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-1000 ease-out rounded-full shadow-[0_0_10px_rgba(37,99,235,0.3)]"
                  style={{ width: `${comp.score}%`, transitionDelay: `${idx * 150}ms` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8 mb-10">
        <div className="bg-emerald-50/50 p-8 rounded-[2.5rem] border border-emerald-100 transition-all hover:scale-[1.02]">
          <h3 className="text-xl font-bold text-emerald-900 mb-6 flex items-center">
            <div className="bg-emerald-100 p-2 rounded-xl mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-emerald-600">
                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm4.28 10.22a.75.75 0 0 0 0-1.06l-3-3a.75.75 0 1 0-1.06 1.06L13.94 11H8.25a.75.75 0 0 0 0 1.5h5.69l-1.72 1.72a.75.75 0 1 0 1.06 1.06l3-3Z" clipRule="evenodd" />
              </svg>
            </div>
            Key Strengths
          </h3>
          <ul className="space-y-4">
            {assessment?.strengths.map((s, i) => (
              <li key={i} className="flex items-start group">
                <span className="mr-3 mt-1.5 w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0 group-hover:scale-150 transition-transform"></span>
                <span className="text-emerald-800 text-sm font-semibold leading-relaxed">{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-amber-50/50 p-8 rounded-[2.5rem] border border-amber-100 transition-all hover:scale-[1.02]">
          <h3 className="text-xl font-bold text-amber-900 mb-6 flex items-center">
            <div className="bg-amber-100 p-2 rounded-xl mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-amber-600">
                <path d="M11.644 1.59a.75.75 0 0 1 .712 0l9.75 5.25a.75.75 0 0 1 0 1.32l-9.75 5.25a.75.75 0 0 1-.712 0l-9.75-5.25a.75.75 0 0 1 0-1.32l9.75-5.25Z" />
                <path d="m3.265 10.602 7.667 4.128a1.25 1.25 0 0 0 1.136 0l7.667-4.128 1.451.781a.75.75 0 0 1 0 1.32l-9.75 5.25a.75.75 0 0 1-.712 0l-9.75-5.25a.75.75 0 0 1 0-1.32l1.451-.781Z" />
              </svg>
            </div>
            Growth Areas
          </h3>
          <ul className="space-y-4">
            {assessment?.improvements.map((im, i) => (
              <li key={i} className="flex items-start group">
                <span className="mr-3 mt-1.5 w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0 group-hover:scale-150 transition-transform"></span>
                <span className="text-amber-800 text-sm font-semibold leading-relaxed">{im}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-slate-900 p-10 rounded-[2.5rem] mb-12 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
          <svg className="w-24 h-24 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14.017 21L14.017 18C14.017 16.8954 13.1216 16 12.017 16H8.017C6.91243 16 6.017 16.8954 6.017 18V21M14.017 21H18.017C19.1216 21 20.017 20.1046 20.017 19V10L12.017 3L4.017 10V19C4.017 20.1046 4.91243 21 6.017 21H14.017Z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-blue-400 uppercase tracking-[0.2em] mb-4">Strategic Advice</h3>
        <p className="text-slate-200 text-lg leading-relaxed font-medium">
          "{assessment?.overallFeedback}"
        </p>
      </div>

      <div className="flex flex-col items-center justify-center space-y-6">
        <button 
          onClick={onReset}
          className="px-12 py-5 bg-blue-600 text-white font-bold text-lg rounded-[2rem] hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 hover:shadow-blue-200 active:scale-95"
        >
          Retake Interview with New Document
        </button>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">Powered by CareerCompass AI Analysis Engine</p>
      </div>
    </div>
  );
};

export default FeedbackView;

import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ResumeData, InterviewMessage } from '../types';
import { decode, encode, decodeAudioData, createBlob } from '../utils/audioHelpers';

interface Props {
  resumeData: ResumeData;
  onComplete: (history: InterviewMessage[]) => void;
}

interface TextScheduleEntry {
  text: string;
  startTime: number;
}

const InterviewLiveSession: React.FC<Props> = ({ resumeData, onComplete }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReady, setIsReady] = useState(false); 
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<InterviewMessage[]>([]);
  const [liveModelText, setLiveModelText] = useState('');
  const [liveUserText, setLiveUserText] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeSourcesCountRef = useRef(0);

  const pendingModelTextRef = useRef('');
  const textScheduleRef = useRef<TextScheduleEntry[]>([]);
  const currentModelTurnRef = useRef('');
  const currentUserTurnRef = useRef('');
  const historyToCommitRef = useRef<{ user?: string; ai?: string } | null>(null);

  // Silence Nudge logic
  const lastActivityRef = useRef<number>(Date.now());
  const silenceTimerRef = useRef<number | null>(null);

  // Auto-scroll logic - ensuring the latest messages are always visible
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [transcription, liveUserText, liveModelText]);

  // Sync text with audio playback
  useEffect(() => {
    let animationFrameId: number;
    const syncLoop = () => {
      if (audioContextOutRef.current && textScheduleRef.current.length > 0) {
        const now = audioContextOutRef.current.currentTime;
        let textToAppend = '';
        while (textScheduleRef.current.length > 0 && textScheduleRef.current[0].startTime <= now) {
          const entry = textScheduleRef.current.shift();
          if (entry) textToAppend += entry.text;
        }
        if (textToAppend) {
          currentModelTurnRef.current += textToAppend;
          setLiveModelText(currentModelTurnRef.current);
        }
      }
      animationFrameId = requestAnimationFrame(syncLoop);
    };
    animationFrameId = requestAnimationFrame(syncLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Silence Monitor: If user is silent for > 12s, the AI will provide a professional nudge
  useEffect(() => {
    if (isActive) {
      silenceTimerRef.current = window.setInterval(() => {
        const now = Date.now();
        const idleTime = now - lastActivityRef.current;
        
        // If 12 seconds of silence, and AI isn't speaking/thinking
        if (idleTime > 12000 && !isAiSpeaking && !isAiThinking && isActive) {
          lastActivityRef.current = now; 
          sessionPromiseRef.current?.then(session => {
            session.sendRealtimeInput({
              text: "[The candidate has been silent for 12 seconds. Offer a professional, encouraging nudge. Perhaps ask if they'd like you to rephrase the question or if they need another moment to think. Keep it natural.]"
            });
          });
        }
      }, 2000);
    }
    return () => {
      if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
    };
  }, [isActive, isAiSpeaking, isAiThinking]);

  const handleOpenKeySelector = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      startSession(); 
    }
  };

  const startSession = async () => {
    try {
      setSessionError(null);
      setIsConnecting(true);
      setIsReady(true);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

      if (!window.AudioContext && !(window as any).webkitAudioContext) {
        throw new Error("Your browser does not support the Web Audio API.");
      }

      audioContextInRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextOutRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      if (audioContextInRef.current.state === 'suspended') await audioContextInRef.current.resume();
      if (audioContextOutRef.current.state === 'suspended') await audioContextOutRef.current.resume();

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      } catch (micErr: any) {
        throw new Error("Could not access microphone. Please ensure permissions are granted.");
      }

      const systemInstruction = `
        You are 'CareerCompass AI', a distinguished Senior Engineering Director and Technical Lead. 
        Your goal is to conduct a professional, high-caliber technical interview.
        
        TONE & STYLE:
        - Be professional, authoritative, yet deeply natural and empathetic.
        - Avoid robotic delivery. Use professional conversational bridges like "I appreciate that explanation," "Let's pivot slightly to your experience with...", or "That's a nuanced perspective."
        - Use a natural professional cadence. Pause appropriately. 
        - Sound like a mentor who is evaluating a peer.

        STARTUP PROTOCOL:
        1. YOU MUST INITIATE THE CONVERSATION IMMEDIATELY.
        2. Opening Greeting: "Good day. I'm the CareerCompass AI Lead. It's a pleasure to speak with you today. I've had a chance to review your profile and I'm looking forward to our discussion. To begin, how are you doing today?"

        INTERVIEW CONTENT:
        - Candidate Skills: ${resumeData.skills.join(', ')}
        - Level: ${resumeData.experienceLevel}
        - Background: ${resumeData.summary}

        INTERACTION GUIDELINES:
        - Ask one nuanced question at a time.
        - Listen carefully to the candidate's response. Acknowledge their points professionally before moving to the next topic.
        - If the candidate is quiet, offer professional support or rephrase.
        - Conclude with: "Thank you for the insightful conversation. This concludes our session. Interview complete."
      `;

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            // 'Kore' is chosen for a clear, professional, and authoritative tone suitable for an Engineering Director.
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnecting(false);
            setIsActive(true);
            setSessionError(null);
            lastActivityRef.current = Date.now();
            
            setTimeout(() => {
              if (audioContextInRef.current && streamRef.current) {
                const source = audioContextInRef.current.createMediaStreamSource(streamRef.current);
                scriptProcessorRef.current = audioContextInRef.current.createScriptProcessor(2048, 1, 1);
                
                scriptProcessorRef.current.onaudioprocess = (e) => {
                  const inputData = e.inputBuffer.getChannelData(0);
                  const pcmBlob = createBlob(inputData);
                  
                  let hasEnergy = false;
                  for (let i = 0; i < inputData.length; i++) {
                    if (Math.abs(inputData[i]) > 0.04) {
                      hasEnergy = true;
                      break;
                    }
                  }
                  if (hasEnergy) lastActivityRef.current = Date.now();

                  sessionPromiseRef.current?.then(session => {
                    session.sendRealtimeInput({ media: pcmBlob });
                  });
                };

                source.connect(scriptProcessorRef.current);
                scriptProcessorRef.current.connect(audioContextInRef.current.destination);
              }
            }, 600);
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent;
            if (!serverContent) return;

            if (serverContent.outputTranscription) {
              pendingModelTextRef.current += serverContent.outputTranscription.text;
              setIsAiThinking(false);
              lastActivityRef.current = Date.now();
            } else if (serverContent.inputTranscription) {
              currentUserTurnRef.current += serverContent.inputTranscription.text;
              setLiveUserText(currentUserTurnRef.current);
              setIsAiThinking(true);
              lastActivityRef.current = Date.now();
            }

            const base64Audio = serverContent.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextOutRef.current) {
              const ctx = audioContextOutRef.current;
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const startTime = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const textChunk = pendingModelTextRef.current;
              pendingModelTextRef.current = ''; 

              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              setIsAiSpeaking(true);
              activeSourcesCountRef.current++;

              textScheduleRef.current.push({ text: textChunk, startTime });

              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                activeSourcesCountRef.current--;
                if (activeSourcesCountRef.current === 0) {
                  setIsAiSpeaking(false);
                  lastActivityRef.current = Date.now();
                  if (historyToCommitRef.current) {
                    const h = historyToCommitRef.current;
                    setTranscription(prev => {
                      const updated = [...prev];
                      if (h.user) updated.push({ role: 'user', text: h.user, timestamp: Date.now() });
                      if (h.ai) updated.push({ role: 'ai', text: h.ai, timestamp: Date.now() });
                      return updated;
                    });
                    historyToCommitRef.current = null;
                    setLiveModelText('');
                    setLiveUserText('');
                    currentModelTurnRef.current = '';
                    currentUserTurnRef.current = '';
                  }
                }
              });

              source.start(startTime);
              nextStartTimeRef.current = startTime + audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (serverContent.turnComplete) {
              const finalAiText = currentModelTurnRef.current + pendingModelTextRef.current;
              if (activeSourcesCountRef.current > 0) {
                historyToCommitRef.current = { user: currentUserTurnRef.current, ai: finalAiText };
              } else {
                setTranscription(prev => {
                  const updated = [...prev];
                  if (currentUserTurnRef.current) updated.push({ role: 'user', text: currentUserTurnRef.current, timestamp: Date.now() });
                  if (finalAiText) updated.push({ role: 'ai', text: finalAiText, timestamp: Date.now() });
                  return updated;
                });
                setLiveModelText('');
                setLiveUserText('');
                currentModelTurnRef.current = '';
                currentUserTurnRef.current = '';
              }
              lastActivityRef.current = Date.now();
            }

            if (serverContent.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              activeSourcesCountRef.current = 0;
              setIsAiSpeaking(false);
              pendingModelTextRef.current = '';
              textScheduleRef.current = [];
              currentModelTurnRef.current = '';
              setLiveModelText('');
              historyToCommitRef.current = null;
              lastActivityRef.current = Date.now();
            }
          },
          onerror: (e: any) => {
            console.error('Live API Error:', e);
            const msg = e.message || String(e);
            if (msg.includes("Requested entity was not found")) {
              setSessionError("Invalid API key. Ensure you use a key from a paid project.");
            } else {
              setSessionError("A connection error occurred. Please refresh or check your API key.");
            }
            setIsConnecting(false);
            setIsActive(false);
          },
          onclose: () => setIsActive(false),
        },
      });
    } catch (err: any) {
      setSessionError(err.message || "An unexpected error occurred.");
      setIsConnecting(false);
    }
  };

  const endSession = async () => {
    sessionPromiseRef.current?.then(session => session.close());
    streamRef.current?.getTracks().forEach(track => track.stop());
    setIsActive(false);
    onComplete(transcription);
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (audioContextInRef.current?.state !== 'closed') audioContextInRef.current?.close();
      if (audioContextOutRef.current?.state !== 'closed') audioContextOutRef.current?.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800 flex items-center">
            <span className="bg-blue-600 w-2 h-6 rounded-full mr-3 shadow-[0_0_15px_rgba(37,99,235,0.4)]"></span>
            Technical Interview Session
          </h3>
          <p className="text-sm text-slate-500 font-medium">Professional Session with CareerCompass Lead</p>
        </div>
        <div className="flex items-center space-x-3">
          {isActive && (
            <div className="flex items-center px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-[0.15em] border border-blue-100 animate-pulse">
              <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
              Encrypted Live
            </div>
          )}
          <button 
            onClick={endSession}
            className="px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-sm font-semibold transition-all active:scale-95 shadow-md shadow-slate-200/50"
          >
            End Interview
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-[450px] flex flex-col">
        {!isReady ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mb-2 pulse-animation shadow-inner border border-blue-100">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
              </svg>
            </div>
            <div className="max-w-md">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Technical Boarding</h2>
              <p className="text-slate-600 leading-relaxed">
                You are about to enter a live technical discussion. Our Engineering Lead will introduce themselves and guide the conversation.
              </p>
            </div>
            <button 
              onClick={startSession}
              className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-2xl hover:bg-blue-700 transition-all hover:shadow-blue-200 active:scale-95"
            >
              Initialize & Enter Session
            </button>
          </div>
        ) : sessionError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <div className="max-w-md">
              <h4 className="text-xl font-bold text-slate-800 mb-2">Session Interrupted</h4>
              <p className="text-slate-600 mb-6">{sessionError}</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button 
                  onClick={handleOpenKeySelector}
                  className="px-6 py-2 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 transition-all shadow-sm"
                >
                  Configure Key
                </button>
                <button 
                  onClick={startSession}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-sm"
                >
                  Reconnect
                </button>
              </div>
            </div>
          </div>
        ) : isConnecting ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs animate-pulse">Syncing AI Lead...</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="flex flex-col items-center justify-center p-10 bg-slate-50 rounded-[3.5rem] mb-8 relative overflow-hidden shadow-inner border border-slate-100 transition-all duration-700">
               <div className={`absolute -inset-10 bg-blue-500 blur-[130px] transition-opacity duration-1000 ${isAiSpeaking ? 'opacity-25' : 'opacity-0'}`}></div>
               <div className={`absolute -inset-10 bg-indigo-500 blur-[130px] transition-opacity duration-1000 ${isAiThinking ? 'opacity-25' : 'opacity-0'}`}></div>
               
               <div className="relative z-10 flex flex-col items-center">
                  <div className={`w-36 h-36 rounded-full flex items-center justify-center transition-all duration-700 relative z-20 ${
                    isAiSpeaking ? 'bg-gradient-to-br from-blue-600 to-blue-800 scale-110 shadow-[0_0_60px_rgba(37,99,235,0.4)]' : 
                    isAiThinking ? 'bg-gradient-to-br from-indigo-600 to-indigo-800 scale-105 shadow-[0_0_50px_rgba(79,70,229,0.3)]' : 
                    'bg-white shadow-xl border-4 border-white'
                  }`}>
                    {(isAiSpeaking || isAiThinking) && (
                      <div className={`absolute -inset-6 rounded-full border-2 border-white/20 animate-ping`}></div>
                    )}
                    
                    <div className={`transition-all duration-500 p-8 rounded-full ${isAiSpeaking || isAiThinking ? 'text-white' : 'text-slate-200'}`}>
                      {isAiSpeaking ? (
                        <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                      ) : isAiThinking ? (
                        <svg className="w-14 h-14 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                      ) : (
                        <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3-3z" /></svg>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-8 text-center">
                    <p className={`text-sm font-black uppercase tracking-[0.3em] transition-colors duration-500 ${isAiSpeaking ? 'text-blue-600' : isAiThinking ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {isAiSpeaking ? "AI Sharing Feedback" : isAiThinking ? "AI Reflecting" : "Awaiting Input"}
                    </p>
                  </div>
               </div>
            </div>

            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto max-h-[320px] space-y-4 px-2 custom-scrollbar scroll-smooth pb-6"
            >
              {transcription.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-3 duration-300`}>
                  <div className={`max-w-[80%] px-6 py-4 rounded-3xl text-[13px] leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              
              {liveUserText && (
                <div className="flex justify-end animate-in fade-in">
                  <div className="max-w-[80%] px-6 py-4 rounded-3xl text-[13px] bg-blue-50 text-blue-700 rounded-tr-none border border-blue-100 italic">
                    {liveUserText}...
                  </div>
                </div>
              )}
              
              {liveModelText && (
                <div className="flex justify-start animate-in fade-in">
                  <div className="max-w-[80%] px-6 py-4 rounded-3xl text-[13px] bg-slate-100 text-slate-700 rounded-tl-none border border-slate-200">
                    {liveModelText}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .animate-spin-slow { animation: spin 5s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
};

export default InterviewLiveSession;
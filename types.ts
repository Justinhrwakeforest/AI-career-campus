
export interface ResumeData {
  skills: string[];
  summary: string;
  experienceLevel: string;
  rawText: string;
}

export interface InterviewMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export enum AppStage {
  UPLOAD = 'UPLOAD',
  ANALYZING = 'ANALYZING',
  INTERVIEW = 'INTERVIEW',
  FEEDBACK = 'FEEDBACK'
}

export type ResumeInput = 
  | { type: 'text'; content: string }
  | { type: 'file'; data: string; mimeType: string; fileName: string };

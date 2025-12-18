
import { GoogleGenAI, Type } from "@google/genai";
import { ResumeData, ResumeInput } from "../types";

export const analyzeResume = async (input: ResumeInput): Promise<ResumeData> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  let contentPart: any;
  if (input.type === 'text') {
    contentPart = { text: `Analyze this resume and extract key professional details: ${input.content}` };
  } else {
    contentPart = [
      {
        inlineData: {
          data: input.data,
          mimeType: input.mimeType
        }
      },
      { text: "Analyze the attached resume file and extract key professional details in JSON format." }
    ];
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: Array.isArray(contentPart) ? { parts: contentPart } : contentPart,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          skills: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of technical and soft skills."
          },
          summary: {
            type: Type.STRING,
            description: "A one-sentence professional summary."
          },
          experienceLevel: {
            type: Type.STRING,
            description: "Entry, Mid-level, Senior, or Executive."
          }
        },
        required: ["skills", "summary", "experienceLevel"]
      }
    }
  });

  const data = JSON.parse(response.text || '{}');
  return { 
    ...data, 
    rawText: input.type === 'text' ? input.content : `File: ${input.fileName}` 
  };
};

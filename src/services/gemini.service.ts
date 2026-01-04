import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';

// Simple type for the grounding chunk we care about
export interface GroundingChunk {
  web: {
    uri: string;
    title: string;
  };
}

export interface LandmarkInfo {
  name: string;
  history: string;
  sources: GroundingChunk[];
}


@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // IMPORTANT: The API key is sourced from environment variables.
    // Do not expose it in the client-side code.
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error('API_KEY environment variable not set');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async identifyLandmark(imageDataBase64: string): Promise<string> {
    const imagePart = {
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageDataBase64,
      },
    };

    const textPart = {
      text: "What is the name of the landmark in this image? If it is not a famous landmark, respond with the word 'Unknown'. Be concise and respond with only the name.",
    };

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
      });
      return response.text.trim();
    } catch (error) {
      console.error('Error in identifyLandmark:', error);
      throw new Error('Failed to identify landmark.');
    }
  }

  async fetchLandmarkHistory(landmarkName: string): Promise<Omit<LandmarkInfo, 'name'>> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Tell me a brief, engaging history of ${landmarkName} suitable for a short audio tour clip. Keep it under 150 words.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const history = response.text;
      const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

      return { history, sources };
    } catch (error) {
      console.error('Error in fetchLandmarkHistory:', error);
      throw new Error('Failed to fetch landmark history.');
    }
  }
}

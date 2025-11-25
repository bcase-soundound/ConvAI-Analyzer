import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  private ai: GoogleGenAI;
  private modelId: string;

  constructor(apiKey: string, modelId: string = 'gemini-2.5-flash') {
    this.ai = new GoogleGenAI({ apiKey });
    this.modelId = modelId;
  }

  async generateContent(prompt: string, isJson: boolean = false): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: this.modelId,
        contents: [
            {
                role: 'user',
                parts: [{ text: prompt }]
            }
        ],
        config: isJson ? { responseMimeType: "application/json" } : undefined
      });
      
      return response.text || '';
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  }
}

// Queue for Rate Limiting
export class RequestQueue {
    private queue: Array<() => Promise<any>> = [];
    private isProcessing = false;
    private delay: number;

    constructor(rpm: number) {
        // Safe buffer: 60000ms / RPM + 500ms
        this.delay = (60000 / rpm) + 500;
    }

    add<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await fn();
                    resolve(result);
                } catch (e) {
                    reject(e);
                }
            });
            if (!this.isProcessing) this.process();
        });
    }

    private async process() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }
        this.isProcessing = true;
        const fn = this.queue.shift();
        if (fn) {
            const start = Date.now();
            await fn();
            const elapsed = Date.now() - start;
            const wait = Math.max(0, this.delay - elapsed);
            setTimeout(() => this.process(), wait);
        }
    }
    
    clear() {
        this.queue = [];
        this.isProcessing = false;
    }
}
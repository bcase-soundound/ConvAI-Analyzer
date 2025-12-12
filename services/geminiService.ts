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

// Optimized Queue for High-Throughput Rate Limiting
export class RequestQueue {
    private queue: Array<() => Promise<any>> = [];
    private activeCount = 0;
    private maxConcurrency: number;
    private minDelay: number;
    private lastRequestTime = 0;

    constructor(rpm: number) {
        // Calculate the minimum spacing between requests to honor the rate limit.
        this.minDelay = 60000 / rpm;
        
        // Dynamic Optimization:
        // If RPM is low (< 20), serial execution (concurrency 1) is fine.
        // If RPM is high, we need parallel execution because network latency (waiting for response)
        // becomes the bottleneck.
        // We cap concurrency at 6 to respect standard browser per-domain limits.
        this.maxConcurrency = Math.min(6, Math.ceil(rpm / 10) + 1);
    }

    add<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await fn();
                    resolve(result);
                } catch (e) {
                    reject(e);
                } finally {
                    this.activeCount--;
                    // Trigger processing of the next item in queue
                    this.process();
                }
            });
            // Trigger processing immediately when added
            this.process();
        });
    }

    private process() {
        if (this.queue.length === 0) return;

        // Calculate time since the last request started
        const now = Date.now();
        const timeSinceLast = now - this.lastRequestTime;
        const wait = Math.max(0, this.minDelay - timeSinceLast);

        // CONDITIONS TO EXECUTE:
        // 1. We have open slots (active requests < maxConcurrency)
        // 2. We have satisfied the rate limit delay (wait === 0)
        
        if (this.activeCount < this.maxConcurrency && wait === 0) {
            const fn = this.queue.shift();
            if (fn) {
                this.activeCount++;
                this.lastRequestTime = Date.now();
                fn();
                // Attempt to process another one immediately (e.g., if we have multiple slots open)
                this.process();
            }
        } else if (this.activeCount < this.maxConcurrency) {
            // We have slots available, but are throttled by Rate Limit.
            // Schedule the next check exactly when the wait is over.
            setTimeout(() => this.process(), wait);
        }
        // If no slots available (activeCount >= maxConcurrency), do nothing.
        // The 'finally' block of the running requests will trigger process() again.
    }
    
    clear() {
        this.queue = [];
        this.activeCount = 0;
    }
}
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Crucial: Ensures assets load correctly on GitHub Pages subdirectories
  build: {
    outDir: 'dist',
    rollupOptions: {
        output: {
            manualChunks: {
                vendor: ['react', 'react-dom', 'recharts', 'xlsx'],
                icons: ['lucide-react']
            }
        }
    }
  }
});
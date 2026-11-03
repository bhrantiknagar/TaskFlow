import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const configuredApiBase = (env.VITE_API_BASE_URL || '').trim();
  let apiBaseUrl = '';

  if (configuredApiBase) {
    const parsedApiBase = new URL(configuredApiBase);
    if (!['http:', 'https:'].includes(parsedApiBase.protocol) || parsedApiBase.username || parsedApiBase.password || parsedApiBase.pathname !== '/' || parsedApiBase.search || parsedApiBase.hash) {
      throw new Error('VITE_API_BASE_URL must be an HTTP(S) origin without credentials, path, query, or hash.');
    }
    apiBaseUrl = parsedApiBase.origin;
  }
 
  return {
    plugins: [
      react(),
      {
        name: 'taskflow-api-base-url',
        transformIndexHtml(html) {
          const configScript = `<script>window.__TASKFLOW_API_BASE__ = ${JSON.stringify(apiBaseUrl)};</script>`;
          return html.replace('</head>', `${configScript}\n</head>`);
        }
      }
    ],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true
    }
  };
});

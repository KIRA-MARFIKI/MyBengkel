import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseTarget = (
    env.VITE_SUPABASE_URL || 'https://gnnfykbnblhwlwwtzqry.supabase.co'
  )
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.supabase\.com$/i, '.supabase.co');
  const supabaseAnonKey = (
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/supabase-api': {
          target: supabaseTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/supabase-api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              if (!supabaseAnonKey) return;
              // Always make sure the gateway receives an API key
              if (!req.headers['apikey']) {
                proxyReq.setHeader('apikey', supabaseAnonKey);
              }
              // Fallback Authorization only when the browser did not send one
              // (a logged-in user's JWT must never be overwritten)
              if (!req.headers['authorization']) {
                proxyReq.setHeader('Authorization', `Bearer ${supabaseAnonKey}`);
              }
            });
          },
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('xlsx') || id.includes('jspdf')) {
                return 'vendor-export';
              }
              if (id.includes('gsap') || id.includes('@gsap') || id.includes('aos')) {
                return 'vendor-motion';
              }
              if (id.includes('@supabase')) {
                return 'vendor-supabase';
              }
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
                return 'vendor-react';
              }
            }
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  };
});



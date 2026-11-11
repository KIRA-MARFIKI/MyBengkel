import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AOS from 'aos';
import 'aos/dist/aos.css';
import './lib/gsap';
import App from './App';
import './index.css';
import { AuthProvider } from './lib/mockAuth';
import { ErrorBoundary } from './components/ErrorBoundary';

AOS.init({
  once: true,
  duration: 600,
  easing: "ease-out-cubic",
  offset: 80,
  disable: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);


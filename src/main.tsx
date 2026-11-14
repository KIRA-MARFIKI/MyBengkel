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

// Prevent third-party browser extension crash (e.g. AB Download Manager Shortcut-*.js)
// when browser autofill fires key events where e.key is undefined
const silenceInvalidKeyEvents = (e: KeyboardEvent) => {
  if (typeof e.key !== 'string') {
    try {
      Object.defineProperty(e, 'key', { value: '', configurable: true });
    } catch {
      // ignore
    }
    e.stopImmediatePropagation();
  }
};
window.addEventListener('keydown', silenceInvalidKeyEvents, true);
window.addEventListener('keyup', silenceInvalidKeyEvents, true);

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
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);


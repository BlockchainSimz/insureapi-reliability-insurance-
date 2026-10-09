import React, { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  declare props: Readonly<{ children: ReactNode }>;
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[InsureAPI] UI render failed', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: '100vh', padding: '24px', background: '#f5f4f0', color: '#141414', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800 }}>InsureAPI could not start</h1>
          <p style={{ marginTop: '12px' }}>The interface encountered an error. Refresh the page once. If it continues, share the error below with support.</p>
          <pre style={{ marginTop: '16px', padding: '12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: '#fff', border: '1px solid #ccc' }}>{this.state.error.message}</pre>
        </main>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) rootElement.dataset.appMounted = 'true';

if (!rootElement) {
  document.body.innerHTML = '<main style="padding:24px;font:16px system-ui;color:#141414">InsureAPI could not start: page root is missing.</main>';
} else {
  try {
    createRoot(rootElement).render(
      <StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </StrictMode>,
    );
  } catch (error) {
    console.error('[InsureAPI] UI bootstrap failed', error);
    rootElement.innerHTML = '<main style="min-height:100vh;padding:24px;background:#f5f4f0;color:#141414;font:16px system-ui"><h1>InsureAPI could not start</h1><p>The interface failed while starting. Refresh once and share this message with support.</p></main>';
  }
}

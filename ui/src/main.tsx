import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { Crashed } from './components/Crashed';
import { queryClient } from './lib/queryClient';
import { installLoginRedirect } from './lib/loginRedirect';
import { unlockOnGesture } from './lib/sounds';
import './index.css';

installLoginRedirect();
unlockOnGesture();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Crashed whole>
        <App />
      </Crashed>
    </QueryClientProvider>
  </StrictMode>,
);

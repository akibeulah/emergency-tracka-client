import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { AuthProvider } from './components/auth';
import { ToastProvider } from './components/ui';
import './theme/mockup-base.css';
import './theme/mockup-console.css';
import './theme/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
);

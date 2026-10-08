import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { FeedbackProvider } from './ui/feedback';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15000, retry: (count, error) => (error as { status?: number }).status === 0 && count < 2, refetchOnWindowFocus: true } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider><App /></FeedbackProvider>
    </QueryClientProvider>
  </StrictMode>,
);

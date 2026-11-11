import { createRoot } from 'react-dom/client';
import {
  setApiKey,
  setAuthTokenGetter,
  setBaseUrl,
} from '@workspace/api-client-react';

import App from './App';
import { ErrorBoundary } from './components/error-boundary';
import { getApiBaseUrl } from './lib/api-url';
import { getSupabase } from './lib/supabase-client';

import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('SIGMO root element was not found.');
}

try {
  setBaseUrl(getApiBaseUrl() || null);
  // The browser key has no authorization role. Generated-client calls use
  // the same current Supabase session as the V2 transport.
  setApiKey(null);
  setAuthTokenGetter(async () => {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  });
} catch (error) {
  console.error(
    'SIGMO API client initialization failed.',
    error,
  );
}

createRoot(rootElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

import { StrictMode } from 'react'
import { IconContext } from 'react-icons'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { installAdminFetchInterceptor } from './lib/adminFetch'

installAdminFetchInterceptor()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 2,
      staleTime: 5 * 60 * 1000,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <IconContext.Provider value={{ className: 'workspace-icon', attr: { 'aria-hidden': true, focusable: false } }}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
    </IconContext.Provider>
  </StrictMode>,
)

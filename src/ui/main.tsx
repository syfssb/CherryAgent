import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/config'
import App from './App'
import { AppInitializer } from './components/auth/AppInitializer'
import { ErrorBoundary } from './components/ErrorBoundary'
import { setupGlobalErrorHandlers } from './utils/error-reporter'

// 尽早设置全局错误处理器，捕获 React 之外的错误
setupGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary showDetails={import.meta.env.DEV}>
      <AppInitializer>
        <App />
      </AppInitializer>
    </ErrorBoundary>
  </StrictMode>
)

import SafeBootErrorBoundary from "@/components/dev/SafeBootErrorBoundary";
import {installGlobalExperienceMonitoring} from "@/components/systemHealth/clientExperienceMonitor";
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

const stopExperienceMonitoring = installGlobalExperienceMonitoring();
if (import.meta.hot) import.meta.hot.dispose(stopExperienceMonitoring);

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <SafeBootErrorBoundary><App /></SafeBootErrorBoundary>
  // </React.StrictMode>,
)

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}




/**
 * Dynamic Backend URL Resolution
 * 
 * Determines API and WebSocket paths depending on the host environment:
 * 1. Local Vite Dev Server (port !== 8000): Points to http://localhost:8000
 * 2. Local Unified Build (served via FastAPI on port 8000): Uses relative paths
 * 3. Render/Cloud Deployment: Uses relative paths (inherits standard HTTPS/WSS protocols)
 */
const getBackendUrls = () => {
  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const backendPort = "8000";
  
  let apiBase = "";
  let wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  let wsHost = window.location.host;

  if (isDev && window.location.port !== backendPort) {
    // Vite Dev Server running locally on port 5173 (or similar) but backend on port 8000
    apiBase = `http://${window.location.hostname}:${backendPort}`;
    wsHost = `${window.location.hostname}:${backendPort}`;
  }

  return {
    apiBase,
    wsUrl: `${wsProtocol}//${wsHost}`
  };
};

export const { apiBase, wsUrl } = getBackendUrls();

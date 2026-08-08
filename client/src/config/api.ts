/**
 * Centralized API Configuration
 *
 * This file provides a single source of truth for API base URLs
 * across all client modules. The URL is determined by the build environment.
 *
 * Development: Uses Vite proxy (localhost:3000 -> localhost:3001)
 * Production: Dynamically uses the current hostname for API access
 */

// Dynamic API URL based on current hostname
const getDynamicApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // If no explicit URL configured, use the current hostname
  // This allows accessing the POS from any machine on the network
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const port = window.location.port;
  
  // If accessing from port 3000 (dev server), use port 3001 for API
  // If accessing from other ports, use the same port for API
  const apiPort = port === '3000' ? '3001' : port;
  
  return `${protocol}//${hostname}:${apiPort}`;
};

export const API_BASE_URL = getDynamicApiUrl();

export const WS_BASE_URL = import.meta.env.VITE_WS_URL ||
  (import.meta.env.VITE_API_URL?.replace('http://', 'ws://').replace('https://', 'wss://') ||
   API_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://'));

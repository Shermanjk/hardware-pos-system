/**
 * Centralized API Configuration
 *
 * This file provides a single source of truth for API base URLs
 * across all client modules. The URL is determined by the build environment.
 *
 * Development: Uses Vite proxy (localhost:3000 -> localhost:3001)
 * Production: Direct connection to configured API URL
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const WS_BASE_URL = import.meta.env.VITE_WS_URL ||
  (import.meta.env.VITE_API_URL?.replace('http://', 'ws://').replace('https://', 'wss://') || 'ws://localhost:3001');

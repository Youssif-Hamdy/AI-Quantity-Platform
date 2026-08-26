import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from './api';
import type { DrawingStatusSocketPayload } from '../types';

export const useDrawingSocket = (
  onStatusChange?: (data: DrawingStatusSocketPayload) => void
) => {
  useEffect(() => {
    if (!onStatusChange) return;

    // Vercel serverless backends do not support persistent Socket.io servers (returns 404).
    // Skip WebSocket connection on vercel.app URLs to avoid browser console noise.
    if (API_BASE_URL.includes('vercel.app')) {
      return;
    }

    const socket = io(API_BASE_URL, {
      transports: ['websocket'],
      autoConnect: true,
      reconnectionAttempts: 1,
      timeout: 2000,
    });

    socket.on('connect_error', () => {
      // Gracefully suppress WebSocket connection errors on serverless backends (Vercel)
      socket.disconnect();
    });

    socket.on('drawing_status_update', (data: DrawingStatusSocketPayload) => {
      console.log('⚡ Received WebSocket drawing_status_update:', data);
      onStatusChange(data);
    });

    return () => {
      socket.disconnect();
    };
  }, [onStatusChange]);
};


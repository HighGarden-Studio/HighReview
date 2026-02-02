import { useState, useCallback } from 'react';
import type { LogEntry } from '../components/AIReviewLogModal';

export function useAIReviewLogger() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((
    level: LogEntry['level'],
    category: LogEntry['category'],
    message: string,
    details?: any
  ) => {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      details,
    };

    setLogs(prev => [...prev, entry]);

    // Also log to console with appropriate method
    const consolePrefix = `[${category.toUpperCase()}]`;
    switch (level) {
      case 'error':
        console.error(consolePrefix, message, details);
        break;
      case 'warning':
        console.warn(consolePrefix, message, details);
        break;
      case 'success':
        console.log('✓', consolePrefix, message, details);
        break;
      case 'info':
      default:
        console.log(consolePrefix, message, details);
        break;
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Convenience methods
  const info = useCallback((category: LogEntry['category'], message: string, details?: any) => {
    addLog('info', category, message, details);
  }, [addLog]);

  const success = useCallback((category: LogEntry['category'], message: string, details?: any) => {
    addLog('success', category, message, details);
  }, [addLog]);

  const warning = useCallback((category: LogEntry['category'], message: string, details?: any) => {
    addLog('warning', category, message, details);
  }, [addLog]);

  const error = useCallback((category: LogEntry['category'], message: string, details?: any) => {
    addLog('error', category, message, details);
  }, [addLog]);

  return {
    logs,
    addLog,
    clearLogs,
    info,
    success,
    warning,
    error,
  };
}

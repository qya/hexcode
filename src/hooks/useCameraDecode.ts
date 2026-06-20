import { useCallback, useRef, useState } from 'react';
import type { DecodeResult } from '../core/types';

export interface DecodeLogEntry {
  id: number;
  time: string;
  level: 'info' | 'success' | 'error';
  message: string;
}

export function useCameraDecode() {
  const workerRef = useRef<Worker | null>(null);
  const logIdRef = useRef(0);
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [logs, setLogs] = useState<DecodeLogEntry[]>([]);

  const appendLog = useCallback((level: DecodeLogEntry['level'], message: string) => {
    const now = new Date();
    setLogs((entries) => [
      {
        id: ++logIdRef.current,
        time: now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        level,
        message
      },
      ...entries
    ].slice(0, 12));
  }, []);

  const decodeFile = useCallback(async (file: File) => {
    const startedAt = performance.now();
    setError(null);
    setResult(null);
    setIsDecoding(true);
    appendLog(
      'info',
      `Queued ${file.name || 'image'} (${file.type || 'unknown type'}, ${Math.max(1, Math.round(file.size / 1024))} KB)`
    );
    workerRef.current?.terminate();
    appendLog('info', 'Started decoder worker');
    workerRef.current = new Worker(new URL('../workers/decodeWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current.onmessage = (event: MessageEvent<any>) => {
      if (event.data && event.data.kind === 'log') {
        appendLog(event.data.level, event.data.message);
        return;
      }
      const elapsed = Math.round(performance.now() - startedAt);
      setIsDecoding(false);
      if ('error' in event.data) {
        setError(event.data.error);
        setResult(null);
        appendLog('error', `Decode failed after ${elapsed} ms: ${event.data.error}`);
      } else {
        setResult(event.data);
        setError(null);
        appendLog('success', `Decoded v${event.data.formatVersion} payload via ${event.data.decoder ?? 'decoder'} in ${elapsed} ms`);
      }
    };
    workerRef.current.onerror = () => {
      setIsDecoding(false);
      setError('Decoder worker failed unexpectedly');
      setResult(null);
      appendLog('error', 'Decoder worker failed unexpectedly');
    };
    workerRef.current.postMessage({
      kind: 'file',
      buffer: await file.arrayBuffer(),
      mimeType: file.type,
      fileName: file.name
    });
    appendLog('info', 'Posted raster buffer to worker');
  }, [appendLog]);

  return { decodeFile, result, error, isDecoding, logs };
}

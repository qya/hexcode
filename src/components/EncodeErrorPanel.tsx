import { AlertTriangle } from 'lucide-react';
import type { EncodeError } from '../core/encoder';

interface Props {
  error: EncodeError;
  compact?: boolean;
}

export function EncodeErrorPanel({ error, compact = false }: Props) {
  return (
    <div
      role="alert"
      style={{
        width: '100%',
        maxWidth: compact ? '100%' : 420,
        background: 'color-mix(in srgb, var(--danger, #ef4444) 8%, var(--surface-2))',
        border: '1px solid color-mix(in srgb, var(--danger, #ef4444) 28%, var(--border-subtle))',
        borderRadius: 'var(--radius-md)',
        padding: compact ? 'var(--space-lg)' : 'var(--space-2xl)',
        textAlign: compact ? 'left' : 'center'
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: compact ? 'row' : 'column',
          alignItems: compact ? 'flex-start' : 'center',
          gap: 'var(--space-md)'
        }}
      >
        <AlertTriangle
          size={compact ? 20 : 28}
          color="var(--danger, #ef4444)"
          style={{ flexShrink: 0, marginTop: compact ? 2 : 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: compact ? 13 : 15,
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em'
            }}
          >
            {error.code === 'CAPACITY_EXCEEDED' ? 'Payload too large' : 'Encoding failed'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {error.message}
          </p>
          <p
            style={{
              margin: 'var(--space-sm) 0 0',
              fontSize: 12,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)'
            }}
          >
            {error.payloadBytes} bytes in · ~{error.maxPayloadBytesEstimate} bytes max · {error.maxCapacityBits} bits
            capacity
          </p>
          {!compact && (
            <ul
              style={{
                margin: 'var(--space-lg) 0 0',
                paddingLeft: '1.1rem',
                textAlign: 'left',
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.6
              }}
            >
              {error.suggestions.slice(0, 4).map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

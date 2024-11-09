import { useState } from 'react';
import { api, ApiError } from '../api/client.js';
import type { VerifyResult } from '../types/index.js';

interface VerificationBadgeProps {
  drawId: number;
  seed: number;
}

export function VerificationBadge({ drawId, seed }: VerificationBadgeProps) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<VerifyResult>(`/api/draws/${drawId}/verify`);
      setResult(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Impossible de vérifier le tirage');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={handleVerify}
        disabled={loading}
        className="btn btn-secondary btn-sm"
        aria-label={`Vérifier le déterminisme du tirage avec la graine ${seed}`}
      >
        {loading ? 'Vérification...' : 'Vérifier ce tirage'}
      </button>

      {result && (
        <span
          className={`badge ${result.verified ? 'badge-dark' : ''}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.25rem 0.5rem'
          }}
          role="status"
          aria-live="polite"
        >
          {result.verified ? (
            <>
              <strong>[OK]</strong> 100% Déterministe (Score: {result.score})
            </>
          ) : (
            <>
              <strong>[Échec]</strong> Décalage détecté (Score: {result.score} vs {result.recalculatedScore})
            </>
          )}
        </span>
      )}

      {error && (
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

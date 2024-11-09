import { describe, it, expect } from 'vitest';
import { ApiError } from './client.js';

describe('ApiError', () => {
  it('correctly constructs from RFC 7807 problem details', () => {
    const error = new ApiError({
      type: 'https://httpstatuses.com/422',
      title: 'Unprocessable Entity',
      status: 422,
      detail: 'Impossible de satisfaire les contraintes',
      invalidParams: [{ name: 'constraints', reason: 'Cycle detected' }]
    });

    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(422);
    expect(error.title).toBe('Unprocessable Entity');
    expect(error.detail).toBe('Impossible de satisfaire les contraintes');
    expect(error.invalidParams).toHaveLength(1);
    expect(error.invalidParams?.[0].reason).toBe('Cycle detected');
  });
});

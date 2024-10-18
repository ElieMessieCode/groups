import { describe, it, expect } from 'vitest';
import { StudentSchema, ConstraintSchema, DrawModeSchema } from '../src/types.js';

describe('Domain Schemas', () => {
  it('validates a valid student', () => {
    const valid = StudentSchema.safeParse({ id: 1, fullName: 'Alan Turing', tag: 'A' });
    expect(valid.success).toBe(true);
  });

  it('enforces studentA < studentB on constraints', () => {
    const valid = ConstraintSchema.safeParse({ studentA: 1, studentB: 2, kind: 'apart' });
    expect(valid.success).toBe(true);

    const invalid = ConstraintSchema.safeParse({ studentA: 5, studentB: 2, kind: 'together' });
    expect(invalid.success).toBe(false);
  });

  it('validates draw modes', () => {
    expect(DrawModeSchema.safeParse('group_count').success).toBe(true);
    expect(DrawModeSchema.safeParse('group_size').success).toBe(true);
    expect(DrawModeSchema.safeParse('invalid_mode').success).toBe(false);
  });
});

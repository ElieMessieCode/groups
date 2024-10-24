import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  partitionStudents,
  UnsatisfiableError,
  type Student,
  type Constraint,
  type HistoricalDraw,
  type DrawInput
} from '../src/index.js';

const studentArbitrary = (n: number) =>
  fc.constant(
    Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      fullName: `Student ${i + 1}`,
      tag: i % 2 === 0 ? 'Tag1' : 'Tag2'
    }))
  );

describe('Property-Based Testing (PBT)', () => {
  it('Integrity: every student appears exactly once across all groups', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 50 }).chain(n =>
          fc.record({
            roster: studentArbitrary(n),
            param: fc.integer({ min: 2, max: Math.min(n, 8) }),
            mode: fc.constantFrom<'group_count', 'group_size'>('group_count', 'group_size'),
            seed: fc.integer({ min: 0, max: 0xffffffff })
          })
        ),
        ({ roster, param, mode, seed }) => {
          const input: DrawInput = {
            roster,
            mode,
            param,
            constraints: [],
            history: [],
            options: { candidates: 10, avoidRepeats: true, balanceByTag: false, historyLimit: 5 },
            seed
          };

          const result = partitionStudents(input);
          const allMemberIds = result.groups.flatMap(g => g.members.map(s => s.id));
          const expectedIds = roster.map(s => s.id).sort((a, b) => a - b);

          expect([...allMemberIds].sort((a, b) => a - b)).toEqual(expectedIds);
          expect(new Set(allMemberIds).size).toBe(roster.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Cardinality: group sizes differ by at most 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 50 }).chain(n =>
          fc.record({
            roster: studentArbitrary(n),
            param: fc.integer({ min: 2, max: Math.min(n, 8) }),
            mode: fc.constantFrom<'group_count', 'group_size'>('group_count', 'group_size'),
            seed: fc.integer({ min: 0, max: 0xffffffff })
          })
        ),
        ({ roster, param, mode, seed }) => {
          const input: DrawInput = {
            roster,
            mode,
            param,
            constraints: [],
            history: [],
            options: { candidates: 10, avoidRepeats: true, balanceByTag: false, historyLimit: 5 },
            seed
          };

          const result = partitionStudents(input);
          const sizes = result.groups.map(g => g.members.length);
          const minSize = Math.min(...sizes);
          const maxSize = Math.max(...sizes);

          expect(maxSize - minSize).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Determinism: fixed seed and inputs produce strictly identical results', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 30 }).chain(n =>
          fc.record({
            roster: studentArbitrary(n),
            param: fc.integer({ min: 2, max: Math.min(n, 6) }),
            mode: fc.constantFrom<'group_count', 'group_size'>('group_count', 'group_size'),
            seed: fc.integer({ min: 0, max: 0xffffffff })
          })
        ),
        ({ roster, param, mode, seed }) => {
          const input: DrawInput = {
            roster,
            mode,
            param,
            constraints: [],
            history: [],
            options: { candidates: 20, avoidRepeats: true, balanceByTag: false, historyLimit: 5 },
            seed
          };

          const result1 = partitionStudents(input);
          const result2 = partitionStudents(input);

          expect(result1).toEqual(result2);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Constraint satisfaction: 100% of together and apart constraints are respected when satisfiable', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 30 }).chain(n =>
          fc.record({
            roster: studentArbitrary(n),
            param: fc.integer({ min: 3, max: 5 }),
            seed: fc.integer({ min: 0, max: 0xffffffff })
          })
        ),
        ({ roster, param, seed }) => {
          const constraints: Constraint[] = [
            { studentA: 1, studentB: 2, kind: 'together' },
            { studentA: 3, studentB: 4, kind: 'apart' }
          ];

          const input: DrawInput = {
            roster,
            mode: 'group_count',
            param,
            constraints,
            history: [],
            options: { candidates: 100, avoidRepeats: true, balanceByTag: false, historyLimit: 5 },
            seed
          };

          try {
            const result = partitionStudents(input);
            const studentGroup = new Map<number, number>();
            result.groups.forEach((g, idx) => {
              g.members.forEach(s => studentGroup.set(s.id, idx));
            });

            expect(studentGroup.get(1)).toBe(studentGroup.get(2));
            expect(studentGroup.get(3)).not.toBe(studentGroup.get(4));
          } catch (e) {
            expect(e).toBeInstanceOf(UnsatisfiableError);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Unsatisfiability detection: impossible constraints reliably throw UnsatisfiableError', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 6, max: 20 }).chain(n =>
          fc.record({
            roster: studentArbitrary(n),
            seed: fc.integer({ min: 0, max: 0xffffffff })
          })
        ),
        ({ roster, seed }) => {
          const contradictoryConstraints: Constraint[] = [
            { studentA: 1, studentB: 2, kind: 'together' },
            { studentA: 1, studentB: 2, kind: 'apart' }
          ];

          const input: DrawInput = {
            roster,
            mode: 'group_count',
            param: 2,
            constraints: contradictoryConstraints,
            history: [],
            options: { candidates: 10, avoidRepeats: true, balanceByTag: false, historyLimit: 5 },
            seed
          };

          expect(() => partitionStudents(input)).toThrow(UnsatisfiableError);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Scoring: multi-candidate optimization produces score <= single naive candidate on >= 95% of runs', () => {
    let betterOrEqualCount = 0;
    const totalRuns = 50;

    for (let i = 0; i < totalRuns; i++) {
      const roster: Student[] = Array.from({ length: 16 }, (_, idx) => ({
        id: idx + 1,
        fullName: `S${idx + 1}`
      }));

      const history: HistoricalDraw[] = [
        {
          drawId: 1,
          weight: 2,
          groups: [
            { studentIds: [1, 2, 3, 4] },
            { studentIds: [5, 6, 7, 8] },
            { studentIds: [9, 10, 11, 12] },
            { studentIds: [13, 14, 15, 16] }
          ]
        },
        {
          drawId: 2,
          weight: 1,
          groups: [
            { studentIds: [1, 5, 9, 13] },
            { studentIds: [2, 6, 10, 14] }
          ]
        }
      ];

      const seed = 1000 + i;

      const naiveResult = partitionStudents({
        roster,
        mode: 'group_count',
        param: 4,
        constraints: [],
        history,
        options: { candidates: 1, avoidRepeats: true, balanceByTag: false, historyLimit: 5 },
        seed
      });

      const optimizedResult = partitionStudents({
        roster,
        mode: 'group_count',
        param: 4,
        constraints: [],
        history,
        options: { candidates: 50, avoidRepeats: true, balanceByTag: false, historyLimit: 5 },
        seed
      });

      if (optimizedResult.score <= naiveResult.score) {
        betterOrEqualCount++;
      }
    }

    const successRate = betterOrEqualCount / totalRuns;
    expect(successRate).toBeGreaterThanOrEqual(0.95);
  });
});

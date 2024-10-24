import { describe, it, expect } from 'vitest';
import {
  hash32,
  mulberry32,
  UnionFind,
  shuffle,
  calculateGroupCapacities,
  distributeBlocksSerpentine,
  buildPairKey,
  buildHistoricalPairPenaltyMap,
  calculatePartitionScore,
  validateApartConstraints,
  validateTogetherConstraints,
  partitionStudents,
  verifyDraw,
  UnsatisfiableError,
  type Student,
  type Constraint,
  type HistoricalDraw,
  type DrawInput
} from '../src/index.js';

describe('PRNG', () => {
  it('produces deterministic 32-bit hashes', () => {
    const h1 = hash32(12345, 0);
    const h2 = hash32(12345, 0);
    const h3 = hash32(12345, 1);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(h1).toBeLessThanOrEqual(0xffffffff);
  });

  it('generates float numbers in [0, 1[', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('is strictly deterministic given the same seed', () => {
    const rng1 = mulberry32(987654);
    const rng2 = mulberry32(987654);
    const seq1 = Array.from({ length: 50 }, () => rng1());
    const seq2 = Array.from({ length: 50 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });
});

describe('UnionFind', () => {
  it('manages disjoint sets with path compression and rank', () => {
    const uf = new UnionFind([1, 2, 3, 4, 5]);
    expect(uf.connected(1, 2)).toBe(false);

    expect(uf.union(1, 2)).toBe(true);
    expect(uf.connected(1, 2)).toBe(true);
    expect(uf.union(1, 2)).toBe(false);

    uf.union(2, 3);
    expect(uf.connected(1, 3)).toBe(true);
    expect(uf.connected(1, 4)).toBe(false);

    const components = uf.getComponents();
    expect(components.get(uf.find(1))?.sort()).toEqual([1, 2, 3]);
  });
});

describe('Shuffle', () => {
  it('creates a deterministic permutation without mutating original array', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const rng = mulberry32(1337);
    const shuffled = shuffle(original, rng);

    expect(shuffled).toHaveLength(original.length);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('Balancer', () => {
  it('calculates group capacities for group_count mode', () => {
    const cap1 = calculateGroupCapacities(23, 'group_count', 4);
    expect(cap1).toEqual([6, 6, 6, 5]);
    expect(cap1.reduce((a, b) => a + b, 0)).toBe(23);

    const cap2 = calculateGroupCapacities(10, 'group_count', 2);
    expect(cap2).toEqual([5, 5]);
  });

  it('calculates group capacities for group_size mode', () => {
    const cap1 = calculateGroupCapacities(23, 'group_size', 6);
    expect(cap1).toEqual([6, 6, 6, 5]);
    expect(cap1.reduce((a, b) => a + b, 0)).toBe(23);

    const cap2 = calculateGroupCapacities(10, 'group_size', 3);
    expect(cap2).toEqual([3, 3, 2, 2]);
    expect(cap2.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('distributes blocks with serpentine balancing', () => {
    const blocks = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      students: [{ id: i + 1, fullName: `S${i + 1}` }]
    }));
    const capacities = [3, 3, 2, 2];
    const distributed = distributeBlocksSerpentine(blocks, capacities);

    expect(distributed).not.toBeNull();
    expect(distributed!.map(g => g.length)).toEqual(capacities);
  });
});

describe('Scorer and Constraints', () => {
  it('builds historical pair penalty map and scores partitions', () => {
    const history: HistoricalDraw[] = [
      {
        drawId: 1,
        weight: 1.0,
        groups: [{ studentIds: [1, 2, 3] }, { studentIds: [4, 5] }]
      },
      {
        drawId: 2,
        weight: 2.0,
        groups: [{ studentIds: [1, 2] }]
      }
    ];

    const penaltyMap = buildHistoricalPairPenaltyMap(history, 5);
    expect(penaltyMap.get(buildPairKey(1, 2))).toBe(3.0);
    expect(penaltyMap.get(buildPairKey(1, 3))).toBe(1.0);
    expect(penaltyMap.get(buildPairKey(4, 5))).toBe(1.0);

    const partition = [
      [{ id: 1, fullName: 'S1' }, { id: 2, fullName: 'S2' }],
      [{ id: 3, fullName: 'S3' }, { id: 4, fullName: 'S4' }, { id: 5, fullName: 'S5' }]
    ];

    const score = calculatePartitionScore(partition, penaltyMap, true);
    expect(score).toBe(4.0);
  });

  it('validates apart constraints', () => {
    const groups: Student[][] = [
      [{ id: 1, fullName: 'S1' }, { id: 2, fullName: 'S2' }],
      [{ id: 3, fullName: 'S3' }, { id: 4, fullName: 'S4' }]
    ];

    const c1: Constraint = { studentA: 1, studentB: 2, kind: 'apart' };
    const c2: Constraint = { studentA: 1, studentB: 3, kind: 'apart' };

    expect(validateApartConstraints(groups, [c1]).valid).toBe(false);
    expect(validateApartConstraints(groups, [c2]).valid).toBe(true);
  });

  it('validates together constraints', () => {
    const groups: Student[][] = [
      [{ id: 1, fullName: 'S1' }, { id: 2, fullName: 'S2' }],
      [{ id: 3, fullName: 'S3' }, { id: 4, fullName: 'S4' }]
    ];

    const c1: Constraint = { studentA: 1, studentB: 2, kind: 'together' };
    const c2: Constraint = { studentA: 1, studentB: 3, kind: 'together' };

    expect(validateTogetherConstraints(groups, [c1]).valid).toBe(true);
    expect(validateTogetherConstraints(groups, [c2]).valid).toBe(false);
  });
});

describe('Partition Algorithm', () => {
  const roster: Student[] = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    fullName: `Student ${i + 1}`,
    tag: i % 2 === 0 ? 'GroupA' : 'GroupB'
  }));

  it('partitions students with cardinality balance and deterministic replay', () => {
    const input: DrawInput = {
      roster,
      mode: 'group_count',
      param: 3,
      constraints: [],
      history: [],
      options: { candidates: 100, avoidRepeats: true, balanceByTag: false, historyLimit: 5 },
      seed: 42
    };

    const res1 = partitionStudents(input);
    const res2 = partitionStudents(input);

    expect(res1.groups).toHaveLength(3);
    expect(res1.groups.map(g => g.members.length)).toEqual([4, 4, 4]);
    expect(res1).toEqual(res2);
    expect(res1.rosterSnapshot).toEqual(roster.map(s => s.id));
  });

  it('respects together and apart constraints', () => {
    const constraints: Constraint[] = [
      { studentA: 1, studentB: 2, kind: 'together' },
      { studentA: 3, studentB: 4, kind: 'together' },
      { studentA: 1, studentB: 3, kind: 'apart' }
    ];

    const input: DrawInput = {
      roster,
      mode: 'group_count',
      param: 3,
      constraints,
      history: [],
      options: { candidates: 200, avoidRepeats: true, balanceByTag: false, historyLimit: 5 },
      seed: 123
    };

    const res = partitionStudents(input);

    const groupOf1 = res.groups.find(g => g.members.some(s => s.id === 1));
    const groupOf2 = res.groups.find(g => g.members.some(s => s.id === 2));
    const groupOf3 = res.groups.find(g => g.members.some(s => s.id === 3));
    const groupOf4 = res.groups.find(g => g.members.some(s => s.id === 4));

    expect(groupOf1).toBe(groupOf2);
    expect(groupOf3).toBe(groupOf4);
    expect(groupOf1).not.toBe(groupOf3);
  });

  it('balances tags across groups when balanceByTag is true', () => {
    const input: DrawInput = {
      roster,
      mode: 'group_count',
      param: 3,
      constraints: [],
      history: [],
      options: { candidates: 50, avoidRepeats: true, balanceByTag: true, historyLimit: 5 },
      seed: 99
    };

    const res = partitionStudents(input);
    for (const group of res.groups) {
      const countA = group.members.filter(s => s.tag === 'GroupA').length;
      const countB = group.members.filter(s => s.tag === 'GroupB').length;
      expect(countA).toBe(2);
      expect(countB).toBe(2);
    }
  });

  it('throws typed UnsatisfiableError on direct contradictory constraints', () => {
    const constraints: Constraint[] = [
      { studentA: 1, studentB: 2, kind: 'together' },
      { studentA: 1, studentB: 2, kind: 'apart' }
    ];

    const input: DrawInput = {
      roster,
      mode: 'group_count',
      param: 3,
      constraints,
      history: [],
      options: { candidates: 100, avoidRepeats: true, balanceByTag: false, historyLimit: 5 },
      seed: 1
    };

    expect(() => partitionStudents(input)).toThrow(UnsatisfiableError);
  });

  it('throws typed UnsatisfiableError when together group exceeds max group capacity', () => {
    const constraints: Constraint[] = [
      { studentA: 1, studentB: 2, kind: 'together' },
      { studentA: 2, studentB: 3, kind: 'together' },
      { studentA: 3, studentB: 4, kind: 'together' },
      { studentA: 4, studentB: 5, kind: 'together' },
      { studentA: 5, studentB: 6, kind: 'together' }
    ];

    const input: DrawInput = {
      roster,
      mode: 'group_count',
      param: 4, // 12 / 4 = 3 students max per group, but together block has 6
      constraints,
      history: [],
      options: { candidates: 50, avoidRepeats: true, balanceByTag: false, historyLimit: 5 },
      seed: 1
    };

    expect(() => partitionStudents(input)).toThrow(UnsatisfiableError);
  });

  it('throws typed UnsatisfiableError when apart constraint with 1 group', () => {
    const constraints: Constraint[] = [
      { studentA: 1, studentB: 2, kind: 'apart' }
    ];

    const input: DrawInput = {
      roster,
      mode: 'group_count',
      param: 1,
      constraints,
      history: [],
      options: { candidates: 50, avoidRepeats: true, balanceByTag: false, historyLimit: 5 },
      seed: 1
    };

    expect(() => partitionStudents(input)).toThrow(UnsatisfiableError);
  });
});

describe('VerifyDraw', () => {
  it('returns true for a valid draw result and false on tamper', () => {
    const roster: Student[] = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      fullName: `Student ${i + 1}`
    }));

    const options = { candidates: 100, avoidRepeats: true, balanceByTag: false, historyLimit: 5 };
    const constraints: Constraint[] = [{ studentA: 1, studentB: 2, kind: 'together' }];
    const history: HistoricalDraw[] = [];
    const seed = 777;

    const result = partitionStudents({
      roster,
      mode: 'group_count',
      param: 2,
      constraints,
      history,
      options,
      seed
    });

    const verified = verifyDraw({
      seed,
      rosterSnapshot: result.rosterSnapshot,
      options,
      mode: 'group_count',
      param: 2,
      constraints,
      history,
      expectedResult: result
    });

    expect(verified).toBe(true);

    const tamperedResult = {
      ...result,
      score: result.score + 10
    };

    const tamperedVerified = verifyDraw({
      seed,
      rosterSnapshot: result.rosterSnapshot,
      options,
      mode: 'group_count',
      param: 2,
      constraints,
      history,
      expectedResult: tamperedResult
    });

    expect(tamperedVerified).toBe(false);
  });
});

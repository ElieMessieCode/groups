import {
  DrawInputSchema,
  UnsatisfiableError,
  type DrawInput,
  type DrawResult,
  type GeneratedGroup,
  type Student
} from './types.js';
import { hash32, mulberry32 } from './prng.js';
import { UnionFind } from './unionFind.js';
import { shuffle } from './shuffle.js';
import {
  calculateGroupCapacities,
  distributeBlocksSerpentine,
  type StudentBlock
} from './balancer.js';
import {
  buildHistoricalPairPenaltyMap,
  calculatePartitionScore,
  validateAllConstraints
} from './scorer.js';

export function partitionStudents(rawInput: DrawInput): DrawResult {
  const input = DrawInputSchema.parse(rawInput);
  const seed = input.seed ?? 0;
  const rosterSnapshot = input.roster.map(s => s.id);
  const capacities = calculateGroupCapacities(input.roster.length, input.mode, input.param);

  if (capacities.length === 0) {
    throw new UnsatisfiableError('Invalid group capacity configuration');
  }

  const studentMap = new Map<number, Student>(input.roster.map(s => [s.id, s]));

  for (const constraint of input.constraints) {
    if (!studentMap.has(constraint.studentA) || !studentMap.has(constraint.studentB)) {
      throw new UnsatisfiableError('Constraint references student not present in roster', constraint);
    }
  }

  const uf = new UnionFind(rosterSnapshot);
  for (const constraint of input.constraints) {
    if (constraint.kind === 'together') {
      uf.union(constraint.studentA, constraint.studentB);
    }
  }

  for (const constraint of input.constraints) {
    if (constraint.kind === 'apart') {
      if (uf.connected(constraint.studentA, constraint.studentB)) {
        throw new UnsatisfiableError(
          'Contradictory constraints: students must be both together and apart',
          constraint
        );
      }
    }
  }

  const maxCapacity = Math.max(...capacities);
  const components = uf.getComponents();
  for (const [root, members] of components.entries()) {
    if (members.length > maxCapacity) {
      const conflict = input.constraints.find(
        c => c.kind === 'together' && uf.find(c.studentA) === root
      );
      throw new UnsatisfiableError(
        'Together constraint component size exceeds maximum group capacity',
        conflict
      );
    }
  }

  if (capacities.length === 1) {
    const apartConflict = input.constraints.find(c => c.kind === 'apart');
    if (apartConflict) {
      throw new UnsatisfiableError(
        'Cannot satisfy apart constraint with only 1 group',
        apartConflict
      );
    }
  }

  const blocks: StudentBlock[] = [];
  for (const comp of components.values()) {
    const students = comp.map(id => studentMap.get(id)!);
    const firstTag = students[0]?.tag;
    const allSameTag = students.every(s => s.tag === firstTag);
    const blockTag = allSameTag ? firstTag : null;
    blocks.push({
      id: comp[0]!,
      students,
      tag: blockTag
    });
  }

  const penaltyMap = buildHistoricalPairPenaltyMap(
    input.history,
    input.options.historyLimit ?? 5
  );
  const avoidRepeats = input.options.avoidRepeats ?? true;
  const balanceByTag = input.options.balanceByTag ?? false;
  const totalCandidates = input.options.candidates ?? 200;

  let bestResult: { groups: Student[][]; score: number; candidateIndex: number } | null = null;
  let firstViolatedConstraint = input.constraints.find(c => c.kind === 'apart');

  for (let k = 0; k < totalCandidates; k++) {
    const candidateSeed = hash32(seed, k);
    const rng = mulberry32(candidateSeed);

    let candidateBlocks: StudentBlock[];
    if (balanceByTag) {
      const tagMap = new Map<string, StudentBlock[]>();
      for (const block of blocks) {
        const key = block.tag ?? '__NO_TAG__';
        const list = tagMap.get(key);
        if (list) {
          list.push(block);
        } else {
          tagMap.set(key, [block]);
        }
      }

      const sortedTags = Array.from(tagMap.keys()).sort();
      const shuffledLists = sortedTags.map(tag => shuffle(tagMap.get(tag)!, rng));
      candidateBlocks = [];

      let hasMore = true;
      let round = 0;
      while (hasMore) {
        hasMore = false;
        for (const list of shuffledLists) {
          if (round < list.length) {
            candidateBlocks.push(list[round]!);
            hasMore = true;
          }
        }
        round++;
      }
    } else {
      candidateBlocks = shuffle(blocks, rng);
    }

    const assignedGroups = distributeBlocksSerpentine(candidateBlocks, capacities);
    if (!assignedGroups) {
      continue;
    }

    const validation = validateAllConstraints(assignedGroups, input.constraints);
    if (!validation.valid) {
      if (!firstViolatedConstraint) {
        firstViolatedConstraint = validation.violation;
      }
      continue;
    }

    const score = calculatePartitionScore(assignedGroups, penaltyMap, avoidRepeats);

    if (bestResult === null || score < bestResult.score) {
      bestResult = {
        groups: assignedGroups,
        score,
        candidateIndex: k
      };
    }
  }

  if (bestResult === null) {
    throw new UnsatisfiableError(
      'No valid partition found satisfying all constraints',
      firstViolatedConstraint
    );
  }

  const groups: GeneratedGroup[] = bestResult.groups.map((members, idx) => ({
    position: idx + 1,
    name: `Groupe ${idx + 1}`,
    members: [...members].sort((a, b) => a.id - b.id)
  }));

  return {
    seed,
    groups,
    score: Math.round(bestResult.score),
    candidateIndex: bestResult.candidateIndex,
    totalCandidatesEvaluated: totalCandidates,
    rosterSnapshot
  };
}

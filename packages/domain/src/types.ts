import { z } from 'zod';

export const StudentSchema = z.object({
  id: z.number().int().positive(),
  fullName: z.string().min(1).max(120),
  tag: z.string().max(40).nullable().optional()
});

export type Student = z.infer<typeof StudentSchema>;

export const ConstraintKindSchema = z.enum(['apart', 'together']);
export type ConstraintKind = z.infer<typeof ConstraintKindSchema>;

export const ConstraintSchema = z.object({
  id: z.number().int().positive().optional(),
  classId: z.number().int().positive().optional(),
  studentA: z.number().int().positive(),
  studentB: z.number().int().positive(),
  kind: ConstraintKindSchema
}).refine(data => data.studentA < data.studentB, {
  message: 'studentA must be strictly less than studentB'
});

export type Constraint = z.infer<typeof ConstraintSchema>;

export const DrawModeSchema = z.enum(['group_count', 'group_size']);
export type DrawMode = z.infer<typeof DrawModeSchema>;

export const DrawOptionsSchema = z.object({
  balanceByTag: z.boolean().default(false),
  avoidRepeats: z.boolean().default(true),
  candidates: z.number().int().min(1).max(2000).default(200),
  historyLimit: z.number().int().min(0).max(50).default(5)
});

export type DrawOptions = z.infer<typeof DrawOptionsSchema>;

export const HistoricalDrawGroupSchema = z.object({
  studentIds: z.array(z.number().int().positive())
});

export const HistoricalDrawSchema = z.object({
  drawId: z.number().int().positive(),
  weight: z.number().positive(),
  groups: z.array(HistoricalDrawGroupSchema)
});

export type HistoricalDraw = z.infer<typeof HistoricalDrawSchema>;

export const DrawInputSchema = z.object({
  roster: z.array(StudentSchema).min(1).max(200),
  mode: DrawModeSchema,
  param: z.number().int().min(1).max(200),
  constraints: z.array(ConstraintSchema).default([]),
  history: z.array(HistoricalDrawSchema).default([]),
  options: DrawOptionsSchema.default({}),
  seed: z.number().int().min(0).max(0xFFFFFFFF).optional()
});

export type DrawInput = z.infer<typeof DrawInputSchema>;

export const GeneratedGroupSchema = z.object({
  position: z.number().int().min(1),
  name: z.string().min(1).max(40),
  members: z.array(StudentSchema)
});

export type GeneratedGroup = z.infer<typeof GeneratedGroupSchema>;

export const DrawResultSchema = z.object({
  seed: z.number().int().min(0).max(0xFFFFFFFF),
  groups: z.array(GeneratedGroupSchema),
  score: z.number().int().min(0),
  candidateIndex: z.number().int().min(0),
  totalCandidatesEvaluated: z.number().int().min(1),
  rosterSnapshot: z.array(z.number().int().positive())
});

export type DrawResult = z.infer<typeof DrawResultSchema>;

export interface UnsatisfiableErrorDetails {
  code: 'UNSATISFIABLE';
  reason: string;
  conflictingConstraint?: Constraint | undefined;
}

export class UnsatisfiableError extends Error implements UnsatisfiableErrorDetails {
  readonly code = 'UNSATISFIABLE' as const;
  readonly reason: string;
  readonly conflictingConstraint?: Constraint | undefined;

  constructor(reason: string, conflictingConstraint?: Constraint | undefined) {
    super(reason);
    this.name = 'UnsatisfiableError';
    this.reason = reason;
    this.conflictingConstraint = conflictingConstraint;
  }
}

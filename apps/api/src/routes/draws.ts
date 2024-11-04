import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { partitionStudents, verifyDraw, type DrawResult } from '@groups/domain';
import { authenticate } from '../middleware/auth.js';
import { validateParams, validateBody, validateQuery } from '../middleware/validate.js';
import { NotFoundError, BadRequestError } from '../middleware/error.js';
import { findClassByIdAndOwner } from '../repos/classRepo.js';
import { findStudentsByClassId } from '../repos/studentRepo.js';
import { findConstraintsByClassId } from '../repos/constraintRepo.js';
import {
  createDraw,
  findDrawByIdAndOwner,
  getHistoricalDraws,
  listDrawsByClassPaginated,
  deleteDraw
} from '../repos/drawRepo.js';

export const classDrawsRouter: Router = Router({ mergeParams: true });
export const drawsRouter: Router = Router();

classDrawsRouter.use(authenticate);
drawsRouter.use(authenticate);

const ClassIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Identifiant de classe invalide')
});

const DrawIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Identifiant de tirage invalide')
});

const CreateDrawSchema = z.object({
  mode: z.enum(['group_count', 'group_size'], {
    errorMap: () => ({ message: 'Le mode doit être group_count ou group_size' })
  }),
  param: z
    .number({ required_error: 'Le paramètre est requis' })
    .int('Le paramètre doit être un entier')
    .min(1, 'Le paramètre doit être supérieur ou égal à 1')
    .max(200, 'Le paramètre ne peut pas dépasser 200'),
  seed: z
    .number()
    .int()
    .min(0)
    .max(0xffffffff)
    .optional(),
  options: z
    .object({
      balanceByTag: z.boolean().default(false),
      avoidRepeats: z.boolean().default(true),
      candidates: z.number().int().min(1).max(2000).default(200),
      historyLimit: z.number().int().min(0).max(50).default(5)
    })
    .default({})
});

const ListDrawsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

function escapeCsvField(val: string | null | undefined): string {
  if (val === null || val === undefined) {
    return '';
  }
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

classDrawsRouter.post(
  '/',
  validateParams(ClassIdParamSchema),
  validateBody(CreateDrawSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const classId = Number(req.params.id);
    const body = req.body as z.infer<typeof CreateDrawSchema>;

    const cls = await findClassByIdAndOwner(classId, userId);
    if (!cls) {
      throw new NotFoundError('Classe introuvable');
    }

    const students = await findStudentsByClassId(classId);
    if (students.length === 0) {
      throw new BadRequestError('La classe ne contient aucun étudiant');
    }

    const constraints = await findConstraintsByClassId(classId);
    const history = await getHistoricalDraws(classId, body.options?.historyLimit ?? 5);
    const seed = body.seed ?? crypto.randomInt(0, 0x100000000);

    const result = partitionStudents({
      roster: students.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        tag: s.tag
      })),
      mode: body.mode,
      param: body.param,
      constraints: constraints.map((c) => ({
        studentA: c.studentA,
        studentB: c.studentB,
        kind: c.kind
      })),
      history,
      options: body.options,
      seed
    });

    const createdDraw = await createDraw({
      classId,
      seed: result.seed,
      mode: body.mode,
      param: body.param,
      options: body.options,
      rosterSnapshot: result.rosterSnapshot,
      score: result.score,
      candidateIndex: result.candidateIndex,
      groups: result.groups
    });

    res.status(201).json(createdDraw);
  }
);

classDrawsRouter.get(
  '/',
  validateParams(ClassIdParamSchema),
  validateQuery(ListDrawsQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const classId = Number(req.params.id);
    const query = req.query as unknown as z.infer<typeof ListDrawsQuerySchema>;

    const cls = await findClassByIdAndOwner(classId, userId);
    if (!cls) {
      throw new NotFoundError('Classe introuvable');
    }

    const paginated = await listDrawsByClassPaginated(classId, {
      cursor: query.cursor,
      limit: query.limit
    });

    res.status(200).json(paginated);
  }
);

drawsRouter.get(
  '/:id',
  validateParams(DrawIdParamSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const drawId = Number(req.params.id);

    const draw = await findDrawByIdAndOwner(drawId, userId);
    if (!draw) {
      throw new NotFoundError('Tirage introuvable');
    }

    res.status(200).json(draw);
  }
);

drawsRouter.delete(
  '/:id',
  validateParams(DrawIdParamSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const drawId = Number(req.params.id);

    const deleted = await deleteDraw(drawId, userId);
    if (!deleted) {
      throw new NotFoundError('Tirage introuvable');
    }

    res.status(204).send();
  }
);

drawsRouter.get(
  '/:id/verify',
  validateParams(DrawIdParamSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const drawId = Number(req.params.id);

    const draw = await findDrawByIdAndOwner(drawId, userId);
    if (!draw) {
      throw new NotFoundError('Tirage introuvable');
    }

    const constraints = await findConstraintsByClassId(draw.classId);
    const history = await getHistoricalDraws(
      draw.classId,
      draw.options.historyLimit ?? 5,
      draw.id
    );

    const expectedResult: DrawResult = {
      seed: draw.seed,
      groups: draw.groups.map((g) => ({
        position: g.position,
        name: g.name,
        members: g.members.map((m) => ({
          id: m.id,
          fullName: m.fullName,
          tag: m.tag
        }))
      })),
      score: draw.score,
      candidateIndex: draw.candidateIndex,
      totalCandidatesEvaluated: draw.options.candidates ?? 200,
      rosterSnapshot: draw.rosterSnapshot
    };

    const domainConstraints = constraints.map((c) => ({
      studentA: c.studentA,
      studentB: c.studentB,
      kind: c.kind
    }));

    const verified = verifyDraw({
      seed: draw.seed,
      rosterSnapshot: draw.rosterSnapshot,
      options: {
        balanceByTag: draw.options.balanceByTag ?? false,
        avoidRepeats: draw.options.avoidRepeats ?? true,
        candidates: draw.options.candidates ?? 200,
        historyLimit: draw.options.historyLimit ?? 5
      },
      mode: draw.mode,
      param: draw.param,
      constraints: domainConstraints,
      history,
      expectedResult
    });

    let recalculatedScore = -1;
    if (verified) {
      recalculatedScore = draw.score;
    } else {
      try {
        const roster = draw.groups.flatMap((g) => g.members).map((m) => ({
          id: m.id,
          fullName: m.fullName,
          tag: m.tag
        }));
        const recomputed = partitionStudents({
          roster,
          mode: draw.mode,
          param: draw.param,
          constraints: domainConstraints,
          history,
          options: {
            balanceByTag: draw.options.balanceByTag ?? false,
            avoidRepeats: draw.options.avoidRepeats ?? true,
            candidates: draw.options.candidates ?? 200,
            historyLimit: draw.options.historyLimit ?? 5
          },
          seed: draw.seed
        });
        recalculatedScore = recomputed.score;
      } catch {
        recalculatedScore = -1;
      }
    }

    res.status(200).json({
      verified,
      drawId: draw.id,
      seed: draw.seed,
      score: draw.score,
      recalculatedScore,
      matchesExactGroups: verified
    });
  }
);

drawsRouter.get(
  '/:id/export.csv',
  validateParams(DrawIdParamSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const drawId = Number(req.params.id);

    const draw = await findDrawByIdAndOwner(drawId, userId);
    if (!draw) {
      throw new NotFoundError('Tirage introuvable');
    }

    const lines: string[] = ['Groupe,Nom,Tag'];
    for (const group of draw.groups) {
      for (const member of group.members) {
        lines.push(
          `${escapeCsvField(group.name)},${escapeCsvField(member.fullName)},${escapeCsvField(member.tag ?? '')}`
        );
      }
    }

    const csvContent = lines.join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tirage-${draw.id}.csv"`
    );
    res.status(200).send(csvContent);
  }
);

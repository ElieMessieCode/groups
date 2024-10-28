import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validateParams, validateBody } from '../middleware/validate.js';
import { NotFoundError, BadRequestError, ConflictError } from '../middleware/error.js';
import {
  createClass,
  findClassByIdAndOwner,
  listClassesByOwner,
  updateClass,
  deleteClass
} from '../repos/classRepo.js';
import {
  createStudentsBatch,
  findStudentsByClassId
} from '../repos/studentRepo.js';
import {
  findConstraintsByClassId,
  replaceConstraints
} from '../repos/constraintRepo.js';
import { parseCsvStudents } from '../utils/csvParser.js';
import { classDrawsRouter } from './draws.js';

export const classesRouter: Router = Router();

classesRouter.use('/:id/draws', classDrawsRouter);

classesRouter.use(authenticate);

const IdParamSchema = z.object({
  id: z.coerce.number().int().positive('Identifiant de classe invalide')
});

const ClassInputSchema = z.object({
  name: z
    .string({ required_error: 'Le nom de la classe est requis' })
    .trim()
    .min(1, 'Le nom de la classe est requis')
    .max(120, 'Le nom ne doit pas dépasser 120 caractères')
});

const StudentItemSchema = z.object({
  fullName: z
    .string({ required_error: 'Le nom de l\'étudiant est requis' })
    .trim()
    .min(1, 'Le nom de l\'étudiant est requis')
    .max(120, 'Le nom ne doit pas dépasser 120 caractères'),
  tag: z
    .string()
    .trim()
    .max(40, 'L\'étiquette ne doit pas dépasser 40 caractères')
    .nullable()
    .optional()
});

const StudentsBatchSchema = z.union([
  z.object({
    students: z
      .array(StudentItemSchema)
      .min(1, 'Au moins un étudiant est requis')
      .max(200, 'Maximum 200 étudiants par lot')
  }),
  z
    .array(StudentItemSchema)
    .min(1, 'Au moins un étudiant est requis')
    .max(200, 'Maximum 200 étudiants par lot')
]);

const CsvImportSchema = z.union([
  z.object({
    csv: z
      .string({ required_error: 'Le contenu CSV est requis' })
      .min(1, 'Le contenu CSV ne peut pas être vide')
      .max(1024 * 1024, 'Le fichier CSV ne doit pas dépasser 1 Mo')
  }),
  z
    .string()
    .min(1, 'Le contenu CSV ne peut pas être vide')
    .max(1024 * 1024, 'Le fichier CSV ne doit pas dépasser 1 Mo')
]);

const ConstraintItemSchema = z
  .object({
    studentA: z.number().int().positive('studentA invalide'),
    studentB: z.number().int().positive('studentB invalide'),
    kind: z.enum(['apart', 'together'], {
      errorMap: () => ({ message: 'Le type de contrainte doit être apart ou together' })
    })
  })
  .refine((data) => data.studentA !== data.studentB, {
    message: 'Une contrainte ne peut pas relier un étudiant à lui-même'
  });

const ConstraintsBatchSchema = z.union([
  z.object({
    constraints: z.array(ConstraintItemSchema).max(1000, 'Maximum 1000 contraintes')
  }),
  z.array(ConstraintItemSchema).max(1000, 'Maximum 1000 contraintes')
]);

// GET /api/classes
classesRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const classes = await listClassesByOwner(userId);
  res.status(200).json(classes);
});

// POST /api/classes
classesRouter.post(
  '/',
  validateBody(ClassInputSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { name } = req.body as z.infer<typeof ClassInputSchema>;
    const createdClass = await createClass(userId, name);
    res.status(201).json(createdClass);
  }
);

// GET /api/classes/:id
classesRouter.get(
  '/:id',
  validateParams(IdParamSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const classId = Number(req.params.id);

    const cls = await findClassByIdAndOwner(classId, userId);
    if (!cls) {
      throw new NotFoundError('Classe introuvable');
    }

    const students = await findStudentsByClassId(classId);
    const constraints = await findConstraintsByClassId(classId);

    res.status(200).json({
      ...cls,
      students,
      constraints
    });
  }
);

// PATCH /api/classes/:id
classesRouter.patch(
  '/:id',
  validateParams(IdParamSchema),
  validateBody(ClassInputSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const classId = Number(req.params.id);
    const { name } = req.body as z.infer<typeof ClassInputSchema>;

    const updated = await updateClass(classId, userId, name);
    if (!updated) {
      throw new NotFoundError('Classe introuvable');
    }

    res.status(200).json(updated);
  }
);

// DELETE /api/classes/:id
classesRouter.delete(
  '/:id',
  validateParams(IdParamSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const classId = Number(req.params.id);

    const deleted = await deleteClass(classId, userId);
    if (!deleted) {
      throw new NotFoundError('Classe introuvable');
    }

    res.status(204).send();
  }
);

// GET /api/classes/:id/students
classesRouter.get(
  '/:id/students',
  validateParams(IdParamSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const classId = Number(req.params.id);

    const cls = await findClassByIdAndOwner(classId, userId);
    if (!cls) {
      throw new NotFoundError('Classe introuvable');
    }

    const students = await findStudentsByClassId(classId);
    res.status(200).json(students);
  }
);

// POST /api/classes/:id/students
classesRouter.post(
  '/:id/students',
  validateParams(IdParamSchema),
  validateBody(StudentsBatchSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const classId = Number(req.params.id);

    const cls = await findClassByIdAndOwner(classId, userId);
    if (!cls) {
      throw new NotFoundError('Classe introuvable');
    }

    const rawList = Array.isArray(req.body) ? req.body : req.body.students;
    const result = await createStudentsBatch(classId, rawList);

    res.status(201).json({
      created: result.created,
      duplicates: result.duplicates,
      total: result.created.length
    });
  }
);

// POST /api/classes/:id/students/import
classesRouter.post(
  '/:id/students/import',
  validateParams(IdParamSchema),
  validateBody(CsvImportSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const classId = Number(req.params.id);

    const cls = await findClassByIdAndOwner(classId, userId);
    if (!cls) {
      throw new NotFoundError('Classe introuvable');
    }

    const csvContent = typeof req.body === 'string' ? req.body : req.body.csv;
    const parsedStudents = parseCsvStudents(csvContent);

    if (parsedStudents.length === 0) {
      throw new BadRequestError('Aucun étudiant valide trouvé dans le fichier CSV');
    }

    if (parsedStudents.length > 200) {
      throw new BadRequestError('Le fichier CSV contient plus de 200 étudiants');
    }

    const result = await createStudentsBatch(classId, parsedStudents);

    res.status(201).json({
      created: result.created,
      duplicates: result.duplicates,
      totalImported: result.created.length
    });
  }
);

// GET /api/classes/:id/constraints
classesRouter.get(
  '/:id/constraints',
  validateParams(IdParamSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const classId = Number(req.params.id);

    const cls = await findClassByIdAndOwner(classId, userId);
    if (!cls) {
      throw new NotFoundError('Classe introuvable');
    }

    const constraints = await findConstraintsByClassId(classId);
    res.status(200).json(constraints);
  }
);

// PUT /api/classes/:id/constraints
classesRouter.put(
  '/:id/constraints',
  validateParams(IdParamSchema),
  validateBody(ConstraintsBatchSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const classId = Number(req.params.id);

    const cls = await findClassByIdAndOwner(classId, userId);
    if (!cls) {
      throw new NotFoundError('Classe introuvable');
    }

    const rawList = Array.isArray(req.body) ? req.body : req.body.constraints;
    const students = await findStudentsByClassId(classId);
    const validStudentIds = new Set(students.map((s) => s.id));

    // Validate that all referenced student IDs belong to this class
    for (const item of rawList) {
      if (!validStudentIds.has(item.studentA) || !validStudentIds.has(item.studentB)) {
        throw new BadRequestError(
          `Les étudiants (${item.studentA}, ${item.studentB}) doivent appartenir à la classe ${classId}`
        );
      }
    }

    // Canonicalize ordering (studentA < studentB) and detect duplicate pairs
    const seenPairs = new Map<string, 'apart' | 'together'>();
    const canonicalConstraints: Array<{
      studentA: number;
      studentB: number;
      kind: 'apart' | 'together';
    }> = [];

    for (const item of rawList) {
      const a = Math.min(item.studentA, item.studentB);
      const b = Math.max(item.studentA, item.studentB);
      const pairKey = `${a}:${b}`;

      if (seenPairs.has(pairKey)) {
        const existingKind = seenPairs.get(pairKey);
        if (existingKind !== item.kind) {
          throw new ConflictError(
            `Contrainte contradictoire sur la paire (${a}, ${b}) : à la fois 'apart' et 'together'`
          );
        }
        // Duplicate identical constraint: skip duplicate
        continue;
      }

      seenPairs.set(pairKey, item.kind);
      canonicalConstraints.push({
        studentA: a,
        studentB: b,
        kind: item.kind
      });
    }

    const updatedConstraints = await replaceConstraints(classId, canonicalConstraints);
    res.status(200).json(updatedConstraints);
  }
);

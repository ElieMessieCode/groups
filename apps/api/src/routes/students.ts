import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validateParams, validateBody } from '../middleware/validate.js';
import { NotFoundError } from '../middleware/error.js';
import {
  findStudentById,
  updateStudent,
  deleteStudent
} from '../repos/studentRepo.js';

export const studentsRouter: Router = Router();

studentsRouter.use(authenticate);

const IdParamSchema = z.object({
  id: z.coerce.number().int().positive('Identifiant d\'étudiant invalide')
});

const StudentUpdateSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, 'Le nom de l\'étudiant ne peut pas être vide')
      .max(120, 'Le nom ne doit pas dépasser 120 caractères')
      .optional(),
    tag: z
      .string()
      .trim()
      .max(40, 'L\'étiquette ne doit pas dépasser 40 caractères')
      .nullable()
      .optional()
  })
  .refine((data) => data.fullName !== undefined || data.tag !== undefined, {
    message: 'Au moins un champ (fullName ou tag) doit être fourni pour la mise à jour'
  });

// PATCH /api/students/:id
studentsRouter.patch(
  '/:id',
  validateParams(IdParamSchema),
  validateBody(StudentUpdateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const studentId = Number(req.params.id);

    const existing = await findStudentById(studentId);
    if (!existing || existing.ownerId !== userId) {
      throw new NotFoundError('Étudiant introuvable');
    }

    const { fullName, tag } = req.body as z.infer<typeof StudentUpdateSchema>;
    const updateData: { fullName?: string; tag?: string | null } = {};
    if (fullName !== undefined) {
      updateData.fullName = fullName;
    }
    if (tag !== undefined) {
      updateData.tag = tag;
    }

    const updated = await updateStudent(studentId, updateData);
    if (!updated) {
      throw new NotFoundError('Étudiant introuvable');
    }

    res.status(200).json(updated);
  }
);

// DELETE /api/students/:id
studentsRouter.delete(
  '/:id',
  validateParams(IdParamSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const studentId = Number(req.params.id);

    const existing = await findStudentById(studentId);
    if (!existing || existing.ownerId !== userId) {
      throw new NotFoundError('Étudiant introuvable');
    }

    const deleted = await deleteStudent(studentId);
    if (!deleted) {
      throw new NotFoundError('Étudiant introuvable');
    }

    res.status(204).send();
  }
);

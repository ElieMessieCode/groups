import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { UnsatisfiableError } from '@groups/domain';
import { logger } from '../logger.js';
import type { ProblemDetails } from '../types/index.js';

export class AppError extends Error {
  public readonly status: number;
  public readonly title: string;
  public readonly detail: string;
  public readonly type: string;
  public readonly invalidParams?: Array<{ name: string; reason: string }> | undefined;

  constructor(options: {
    status: number;
    title: string;
    detail: string;
    type?: string | undefined;
    invalidParams?: Array<{ name: string; reason: string }> | undefined;
  }) {
    super(options.detail);
    this.status = options.status;
    this.title = options.title;
    this.detail = options.detail;
    this.type = options.type ?? `https://httpstatuses.com/${options.status}`;
    if (options.invalidParams !== undefined) {
      this.invalidParams = options.invalidParams;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(detail = 'Requête invalide', invalidParams?: Array<{ name: string; reason: string }> | undefined) {
    super({
      status: 400,
      title: 'Bad Request',
      detail,
      invalidParams
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail = 'Authentification requise ou session expirée') {
    super({
      status: 401,
      title: 'Unauthorized',
      detail
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(detail = 'Accès interdit') {
    super({
      status: 403,
      title: 'Forbidden',
      detail
    });
  }
}

export class NotFoundError extends AppError {
  constructor(detail = 'Ressource introuvable') {
    super({
      status: 404,
      title: 'Not Found',
      detail
    });
  }
}

export class ConflictError extends AppError {
  constructor(detail = 'Conflit avec l\'état actuel de la ressource') {
    super({
      status: 409,
      title: 'Conflict',
      detail
    });
  }
}

export class UnprocessableEntityError extends AppError {
  public readonly conflictingConstraint?: unknown | undefined;

  constructor(
    detail = 'Entité non traitable',
    conflictingConstraint?: unknown | undefined
  ) {
    super({
      status: 422,
      title: 'Unprocessable Entity',
      detail
    });
    if (conflictingConstraint !== undefined) {
      this.conflictingConstraint = conflictingConstraint;
    }
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const instance = req.originalUrl || req.url;

  if (err instanceof UnsatisfiableError) {
    const problem: ProblemDetails = {
      type: 'https://httpstatuses.com/422',
      title: 'Unprocessable Entity',
      status: 422,
      detail: err.message,
      instance,
      conflictingConstraint: err.conflictingConstraint
    };

    res.status(422).contentType('application/problem+json').json(problem);
    return;
  }

  if (err instanceof ZodError) {
    const invalidParams = err.issues.map((issue) => ({
      name: issue.path.join('.'),
      reason: issue.message
    }));

    const problem: ProblemDetails = {
      type: 'https://httpstatuses.com/400',
      title: 'Validation Error',
      status: 400,
      detail: 'Les données fournies dans la requête ne respectent pas le schéma requis.',
      instance,
      invalidParams
    };

    res.status(400).contentType('application/problem+json').json(problem);
    return;
  }

  if (err instanceof AppError) {
    const problem: ProblemDetails = {
      type: err.type,
      title: err.title,
      status: err.status,
      detail: err.detail,
      instance
    };

    if (err.invalidParams !== undefined) {
      problem.invalidParams = err.invalidParams;
    }

    if ((err as UnprocessableEntityError).conflictingConstraint !== undefined) {
      problem.conflictingConstraint = (err as UnprocessableEntityError).conflictingConstraint;
    }

    res.status(err.status).contentType('application/problem+json').json(problem);
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, 'Erreur interne non gérée');

  const problem: ProblemDetails = {
    type: 'https://httpstatuses.com/500',
    title: 'Internal Server Error',
    status: 500,
    detail: 'Une erreur interne inattendue s\'est produite.',
    instance
  };

  res.status(500).contentType('application/problem+json').json(problem);
}

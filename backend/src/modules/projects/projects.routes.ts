import { Router } from 'express';
import { createProject, getProjects, getProjectById, updateProject, deleteProject } from './projects.controller';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { z } from 'zod';

const router = Router();

const projectSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    description: z.string().optional(),
  }),
});

router.use(authenticate as any);

router.post('/', validate(projectSchema), createProject as any);
router.get('/', getProjects as any);
router.get('/:id', getProjectById as any);
router.put('/:id', validate(projectSchema), updateProject as any);
router.delete('/:id', deleteProject as any);

export default router;

import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { getQuantities, exportBOQ } from './quantities.controller';

const router = Router();

router.use(authenticate as any);

/**
 * @swagger
 * /api/quantities:
 *   get:
 *     summary: Get quantity items for a drawing
 *     tags: [Quantities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: drawingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of quantity items
 */
router.get('/', getQuantities as any);

/**
 * @swagger
 * /api/quantities/export/{projectId}:
 *   get:
 *     summary: Export BOQ as Excel (.xlsx) for a project
 *     tags: [Quantities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: BOQ export metadata and download URL
 */
router.get('/export/:projectId', exportBOQ as any);

export default router;

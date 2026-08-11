"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middlewares/auth");
const quantities_controller_1 = require("./quantities.controller");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
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
router.get('/', quantities_controller_1.getQuantities);
/**
 * @swagger
 * /api/quantities/manual:
 *   post:
 *     summary: Save manual canvas takeoff measurement
 *     tags: [Quantities]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Created manual quantity item
 */
router.post('/manual', quantities_controller_1.createManualQuantity);
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
 *         description: BOQ export stream (.xlsx)
 */
router.get('/export/:projectId', quantities_controller_1.exportBOQ);
exports.default = router;

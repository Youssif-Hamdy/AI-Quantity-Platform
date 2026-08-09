"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
/**
 * @swagger
 * tags:
 *   name: Elements
 *   description: Elements management
 */
/**
 * @swagger
 * /api/elements/{id}:
 *   delete:
 *     summary: Delete an element
 *     tags: [Elements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Element deleted
 */
router.delete('/:id', (req, res) => {
    res.status(204).send();
});
exports.default = router;

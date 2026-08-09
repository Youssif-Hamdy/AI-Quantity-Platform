"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const projects_controller_1 = require("./projects.controller");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
const projectSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(1),
        code: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
    }),
});
router.use(auth_1.authenticate);
router.post('/', (0, validate_1.validate)(projectSchema), projects_controller_1.createProject);
router.get('/', projects_controller_1.getProjects);
router.get('/:id', projects_controller_1.getProjectById);
router.put('/:id', (0, validate_1.validate)(projectSchema), projects_controller_1.updateProject);
router.delete('/:id', projects_controller_1.deleteProject);
exports.default = router;

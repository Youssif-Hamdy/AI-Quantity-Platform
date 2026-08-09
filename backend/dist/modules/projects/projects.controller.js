"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProject = exports.updateProject = exports.getProjectById = exports.getProjects = exports.createProject = void 0;
const prisma_1 = __importDefault(require("../../database/prisma"));
const createProject = async (req, res) => {
    const { name, code, description } = req.body;
    const userId = req.user.id;
    const project = await prisma_1.default.project.create({
        data: { name, code, description, userId },
    });
    res.status(201).json({ status: 'success', data: project });
};
exports.createProject = createProject;
const getProjects = async (req, res) => {
    const userId = req.user.id;
    const projects = await prisma_1.default.project.findMany({ where: { userId } });
    res.status(200).json({ status: 'success', data: projects });
};
exports.getProjects = getProjects;
const getProjectById = async (req, res) => {
    const id = req.params['id'];
    const userId = req.user.id;
    const project = await prisma_1.default.project.findFirst({ where: { id, userId } });
    if (!project)
        return res.status(404).json({ status: 'error', message: 'Project not found' });
    res.status(200).json({ status: 'success', data: project });
};
exports.getProjectById = getProjectById;
const updateProject = async (req, res) => {
    const id = req.params['id'];
    const userId = req.user.id;
    const { name, code, description } = req.body;
    const project = await prisma_1.default.project.findFirst({ where: { id, userId } });
    if (!project)
        return res.status(404).json({ status: 'error', message: 'Project not found' });
    const updatedProject = await prisma_1.default.project.update({
        where: { id },
        data: { name, code, description },
    });
    res.status(200).json({ status: 'success', data: updatedProject });
};
exports.updateProject = updateProject;
const deleteProject = async (req, res) => {
    const id = req.params['id'];
    const userId = req.user.id;
    const project = await prisma_1.default.project.findFirst({ where: { id, userId } });
    if (!project)
        return res.status(404).json({ status: 'error', message: 'Project not found' });
    await prisma_1.default.project.delete({ where: { id } });
    res.status(200).json({ status: 'success', message: 'Project deleted' });
};
exports.deleteProject = deleteProject;

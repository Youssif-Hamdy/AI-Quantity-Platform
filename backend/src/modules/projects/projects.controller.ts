import { Response } from 'express';
import prisma from '../../database/prisma';
import { AuthRequest } from '../../middlewares/auth';

export const createProject = async (req: AuthRequest, res: Response) => {
  const { name, code, description } = req.body;
  const userId = req.user!.id as string;

  const project = await prisma.project.create({
    data: { name, code, description, userId },
  });

  res.status(201).json({ status: 'success', data: project });
};

export const getProjects = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id as string;
  const projects = await prisma.project.findMany({ where: { userId } });
  res.status(200).json({ status: 'success', data: projects });
};

export const getProjectById = async (req: AuthRequest, res: Response) => {
  const id = req.params['id'] as string;
  const userId = req.user!.id as string;

  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) return res.status(404).json({ status: 'error', message: 'Project not found' });

  res.status(200).json({ status: 'success', data: project });
};

export const updateProject = async (req: AuthRequest, res: Response) => {
  const id = req.params['id'] as string;
  const userId = req.user!.id as string;
  const { name, code, description } = req.body;

  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) return res.status(404).json({ status: 'error', message: 'Project not found' });

  const updatedProject = await prisma.project.update({
    where: { id },
    data: { name, code, description },
  });

  res.status(200).json({ status: 'success', data: updatedProject });
};

export const deleteProject = async (req: AuthRequest, res: Response) => {
  const id = req.params['id'] as string;
  const userId = req.user!.id as string;

  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) return res.status(404).json({ status: 'error', message: 'Project not found' });

  await prisma.project.delete({ where: { id } });

  res.status(200).json({ status: 'success', message: 'Project deleted' });
};

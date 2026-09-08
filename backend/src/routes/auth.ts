import { z } from 'zod';
import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { validateBody } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../validators/core.js';

const router = Router();

router.post('/register', validateBody(registerSchema), async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword } = req.body;
    if (!name || !email || !password || password !== confirmPassword) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Email already registered' } });
    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { name, email, phone: phone || null, passwordHash: hash, status: 'active' } });
    return res.status(201).json({ success: true, data: { id: user.id, name: user.name, email: user.email } });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: e.message } });
  }
});

router.post('/login', validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email and password required' } });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    // Get first active tenant for token
    const membership = await prisma.tenantUser.findFirst({ where: { userId: user.id, status: 'active' }, select: { tenantId: true } });
    const token = jwt.sign({ userId: user.id, tenantId: membership?.tenantId || undefined }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    return res.json({ success: true, data: { token, user: { id: user.id, name: user.name, email: user.email }, tenantId: membership?.tenantId } });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: e.message } });
  }
});

router.get('/me', async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    const token = header.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, name: true, email: true, phone: true, status: true } });
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    return res.json({ success: true, data: user });
  } catch (e: any) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: e.message } });
  }
});


router.post('/verify-email', validateBody(z.object({ token: z.string().min(1) })), async (req, res) => {
  try {
    const { token } = req.body;
    const user = await prisma.user.findFirst({ where: { verificationToken: token, emailVerified: false, verificationExpires: { gt: new Date() } } });
    if (!user) return res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired verification token' } });
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true, verificationToken: null, verificationExpires: null } });
    return res.json({ success: true, data: { verified: true } });
  } catch (e: any) { return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: e.message } }); }
});

router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email required' } });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    if (user.emailVerified) return res.json({ success: true, data: { message: 'Already verified' } });
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({ where: { id: user.id }, data: { verificationToken: token, verificationExpires: new Date(Date.now() + 1000 * 60 * 60 * 24) } });
    // No real SMS/email provider integrated; token is ready for manual delivery
    return res.json({ success: true, data: { message: 'Verification token generated', token } });
  } catch (e: any) { return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: e.message } }); }
});

export default router;

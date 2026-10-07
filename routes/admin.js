const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// 1. ADMIN STATS: GET /api/admin/stats
router.get('/stats', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const totalDeliveries = await prisma.delivery.count();
    const activeDeliveries = await prisma.delivery.count({
      where: { status: { in: ['REQUESTED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] } }
    });
    const completedDeliveries = await prisma.delivery.count({
      where: { status: 'DELIVERED' }
    });

    const activeDrivers = await prisma.driver.count({
      where: { isOnline: true }
    });

    const revenueResult = await prisma.delivery.aggregate({
      where: { status: 'DELIVERED' },
      _sum: { estimatedPrice: true }
    });

    const totalRevenue = revenueResult._sum.estimatedPrice || 0;

    res.json({
      stats: {
        totalDeliveries,
        activeDeliveries,
        completedDeliveries,
        activeDrivers,
        totalRevenue: Math.round(totalRevenue * 100) / 100
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// 2. GET ALL USERS: GET /api/admin/users
router.get('/users', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        driverProfile: {
          include: { vehicle: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ users });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// 3. ADMIN CREATES A NEW ADMIN: POST /api/admin/create-admin
router.post('/create-admin', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'Name, email, phone, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        role: 'ADMIN'
      },
      select: { id: true, name: true, email: true, phone: true, role: true }
    });

    res.status(201).json({ message: 'New Admin created successfully', admin: newAdmin });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

// 4. ADMIN UPDATES ANY USER/DRIVER: PUT /api/admin/users/:id
router.put('/users/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, email, phone, role } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(phone && { phone }),
        ...(role && { role })
      },
      select: { id: true, name: true, email: true, phone: true, role: true }
    });

    res.json({ message: 'User updated successfully by admin', user: updatedUser });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ADMIN FORCE-RESET PASSWORD: POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    res.json({ message: `Password for ${targetUser.name} (${targetUser.email}) reset successfully by admin` });
  } catch (error) {
    console.error('Admin password reset error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
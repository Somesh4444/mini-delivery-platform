const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const transporter = require('../utils/mailer');

const router = express.Router();

// 1. ADMIN STATS
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
    const pendingDrivers = await prisma.driver.count({
      where: { status: 'PENDING' }
    });
    const revenueResult = await prisma.delivery.aggregate({
      where: { status: 'DELIVERED' },
      _sum: { estimatedPrice: true }
    });

    res.json({
      stats: {
        totalDeliveries,
        activeDeliveries,
        completedDeliveries,
        activeDrivers,
        pendingDrivers,
        totalRevenue: Math.round((revenueResult._sum.estimatedPrice || 0) * 100) / 100
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// 2. GET ALL USERS
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
        driverProfile: { include: { vehicle: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ users });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// 3. GET DRIVERS & APPLICATIONS
router.get('/drivers', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { status } = req.query;

    const drivers = await prisma.driver.findMany({
      where: { ...(status && { status }) },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
        vehicle: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ drivers });
  } catch (error) {
    console.error('Admin fetch drivers error:', error);
    res.status(500).json({ error: 'Failed to fetch drivers list' });
  }
});

// 4. APPROVE / REJECT DRIVER STATUS
router.patch('/drivers/:id/status', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const driverId = parseInt(req.params.id);
    const { status } = req.body;

    if (!['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING'].includes(status)) {
      return res.status(400).json({ error: 'Invalid driver status' });
    }

    const updatedDriver = await prisma.driver.update({
      where: { id: driverId },
      data: {
        status,
        ...(status === 'APPROVED' && { approvedAt: new Date() }),
        ...(status !== 'APPROVED' && { isOnline: false })
      },
      include: {
        user: { select: { name: true, email: true } }
      }
    });

    res.json({
      message: `Driver ${updatedDriver.user.name} status updated to ${status}`,
      driver: updatedDriver
    });
  } catch (error) {
    console.error('Update driver status error:', error);
    res.status(500).json({ error: 'Failed to update driver status' });
  }
});

// 5. MANUAL EMAIL TRIGGER (Applies password, approves driver, sends email)
router.post('/drivers/:id/send-credentials', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const driverId = parseInt(req.params.id);
    const { temporaryPassword } = req.body;

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: true,
        vehicle: true
      }
    });

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    // Determine password
    const assignedPassword = temporaryPassword && temporaryPassword.trim().length >= 6
      ? temporaryPassword.trim()
      : `Swift@${Math.floor(1000 + Math.random() * 9000)}`;

    const hashedPassword = await bcrypt.hash(assignedPassword, 10);

    // Update password in DB and set status to APPROVED
    await prisma.$transaction([
      prisma.user.update({
        where: { id: driver.userId },
        data: { password: hashedPassword }
      }),
      prisma.driver.update({
        where: { id: driverId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          isEmailSent: true
        }
      })
    ]);

    // Send onboarding credentials email
    const mailOptions = {
      from: `"SwiftDrop Fleet Operations" <${process.env.EMAIL_USER}>`,
      to: driver.user.email,
      subject: '🚀 Welcome to SwiftDrop Fleet — Account Approved & Credentials',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #0f172a;">
          <div style="background-color: #0f172a; padding: 18px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px;">SwiftDrop Logistics Fleet</h1>
          </div>
          
          <h2 style="color: #0f172a; font-size: 18px; margin-top: 0;">Welcome to the Team, ${driver.user.name}!</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            Your documents have been verified and approved by dispatch operations. Your courier account is now active.
          </p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #334155;"><strong>Login Email:</strong> <code style="color: #2563eb;">${driver.user.email}</code></p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #334155;"><strong>Assigned Password:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${assignedPassword}</code></p>
            <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Vehicle:</strong> ${driver.vehicle?.type || 'Bike'} (${driver.vehicle?.plateNo || 'Verified'})</p>
          </div>

          <div style="padding: 14px; border-left: 4px solid #3b82f6; background-color: #eff6ff; margin: 20px 0;">
            <p style="margin: 0; font-size: 13px; color: #1e40af;">
              <strong>Next Steps:</strong> Log in using the credentials above, switch your status to <strong>Online</strong>, and begin accepting delivery dispatches.
            </p>
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/login" style="background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 28px; font-size: 14px; font-weight: bold; border-radius: 6px; display: inline-block;">
              Access Driver Portal
            </a>
          </div>

          <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
            SwiftDrop Hyperlocal Logistics • Bhubaneswar, Odisha
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({
      message: `Credentials sent successfully to ${driver.user.email}`,
      assignedPassword,
      isEmailSent: true
    });
  } catch (error) {
    console.error('Send credentials email error:', error);
    res.status(500).json({ error: 'Failed to send credentials email' });
  }
});

// 6. ADMIN CREATES A NEW ADMIN
router.post('/create-admin', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'Name, email, phone, and password are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await prisma.user.create({
      data: { name, email, phone, password: hashedPassword, role: 'ADMIN' },
      select: { id: true, name: true, email: true, phone: true, role: true }
    });

    res.status(201).json({ message: 'New Admin created successfully', admin: newAdmin });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

// 7. ADMIN UPDATES ANY USER
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

// 8. ADMIN FORCE-RESETS PASSWORD
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

    res.json({ message: `Password for ${targetUser.name} reset successfully by admin` });
  } catch (error) {
    console.error('Admin password reset error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
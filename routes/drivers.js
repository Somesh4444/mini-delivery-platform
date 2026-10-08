const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { driverDocsUpload } = require('../middleware/upload');

const router = express.Router();

// 1. PUBLIC DRIVER APPLICATION (No password needed from applicant)
router.post('/apply', (req, res, next) => {
  driverDocsUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      drivingLicense,
      aadhaarNumber,
      vehicleType,
      plateNo,
      model
    } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'Full name, email, and phone number are required' });
    }

    if (!drivingLicense || !aadhaarNumber || !vehicleType || !plateNo) {
      return res.status(400).json({ 
        error: 'Driving license, Aadhaar number, vehicle type, and plate number are mandatory' 
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'This email is already registered' });
    }

    const existingDriver = await prisma.driver.findFirst({
      where: {
        OR: [
          { drivingLicense },
          { aadhaarNumber }
        ]
      }
    });

    if (existingDriver) {
      return res.status(400).json({ error: 'This Driving License or Aadhaar Number is already registered' });
    }

    const existingVehicle = await prisma.vehicle.findUnique({ where: { plateNo } });
    if (existingVehicle) {
      return res.status(400).json({ error: 'This vehicle plate number is already registered' });
    }

    const driverPhoto = req.files?.driverPhoto ? `/uploads/${req.files.driverPhoto[0].filename}` : null;
    const licensePhoto = req.files?.licensePhoto ? `/uploads/${req.files.licensePhoto[0].filename}` : null;
    const vehiclePhoto = req.files?.vehiclePhoto ? `/uploads/${req.files.vehiclePhoto[0].filename}` : null;
    const rcPhoto = req.files?.rcPhoto ? `/uploads/${req.files.rcPhoto[0].filename}` : null;

    // Secure temporary locked password hash
    const lockedDummyPassword = await bcrypt.hash(`LOCKED_${Date.now()}_${Math.random()}`, 10);

    const application = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          phone,
          password: lockedDummyPassword,
          role: 'DRIVER'
        }
      });

      const driver = await tx.driver.create({
        data: {
          userId: user.id,
          drivingLicense,
          aadhaarNumber,
          driverPhoto,
          licensePhoto,
          vehiclePhoto,
          status: 'PENDING',
          isOnline: false,
          isEmailSent: false
        }
      });

      const vehicle = await tx.vehicle.create({
        data: {
          driverId: driver.id,
          type: vehicleType,
          plateNo,
          model: model || null,
          rcPhoto
        }
      });

      return { user, driver, vehicle };
    });

    res.status(201).json({
      message: 'Application submitted successfully. An administrator will review your documents and email your credentials once approved.',
      driverId: application.driver.id
    });
  } catch (error) {
    console.error('Apply driver error:', error);
    res.status(500).json({ error: 'Failed to submit driver application' });
  }
});

// 2. GET CURRENT DRIVER PROFILE
router.get('/me', authenticate, requireRole('DRIVER'), async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.userId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        vehicle: true
      }
    });

    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    res.json({ driver });
  } catch (error) {
    console.error('Fetch driver profile error:', error);
    res.status(500).json({ error: 'Failed to fetch driver profile' });
  }
});

// 3. TOGGLE DRIVER AVAILABILITY (Blocked unless APPROVED)
router.patch('/toggle-status', authenticate, requireRole('DRIVER'), async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.userId }
    });

    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    if (driver.status !== 'APPROVED') {
      return res.status(403).json({
        error: `Cannot go online. Your driver account status is currently ${driver.status}. Pending admin verification.`
      });
    }

    const updated = await prisma.driver.update({
      where: { id: driver.id },
      data: { isOnline: !driver.isOnline }
    });

    res.json({
      message: `Driver is now ${updated.isOnline ? 'Online' : 'Offline'}`,
      isOnline: updated.isOnline
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({ error: 'Failed to update driver status' });
  }
});

// 4. REGISTER / UPDATE VEHICLE
router.post('/vehicle', authenticate, requireRole('DRIVER'), (req, res, next) => {
  driverDocsUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { type, plateNo, model } = req.body;

    if (!type || !plateNo) {
      return res.status(400).json({ error: 'Vehicle type and plate number are required' });
    }

    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.userId }
    });

    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    const rcPhoto = req.files?.rcPhoto ? `/uploads/${req.files.rcPhoto[0].filename}` : undefined;

    const vehicle = await prisma.vehicle.upsert({
      where: { driverId: driver.id },
      update: {
        type,
        plateNo,
        model: model || null,
        ...(rcPhoto && { rcPhoto })
      },
      create: {
        driverId: driver.id,
        type,
        plateNo,
        model: model || null,
        rcPhoto: rcPhoto || null
      }
    });

    res.json({ message: 'Vehicle details saved successfully', vehicle });
  } catch (error) {
    console.error('Vehicle update error:', error);
    res.status(500).json({ error: 'Failed to save vehicle details' });
  }
});

module.exports = router;
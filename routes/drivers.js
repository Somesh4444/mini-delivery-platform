const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// TOGGLE DRIVER AVAILABILITY: PATCH /api/drivers/toggle-status
router.patch('/toggle-status', authenticate, requireRole('DRIVER'), async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.userId }
    });

    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
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

// REGISTER/UPDATE VEHICLE: POST /api/drivers/vehicle
router.post('/vehicle', authenticate, requireRole('DRIVER'), async (req, res) => {
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

    const vehicle = await prisma.vehicle.upsert({
      where: { driverId: driver.id },
      update: { type, plateNo, model },
      create: {
        driverId: driver.id,
        type,
        plateNo,
        model
      }
    });

    res.json({ message: 'Vehicle details saved successfully', vehicle });
  } catch (error) {
    console.error('Vehicle error:', error);
    res.status(500).json({ error: 'Failed to save vehicle details' });
  }
});

module.exports = router;
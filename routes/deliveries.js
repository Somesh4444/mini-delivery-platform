const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { calculateDeliveryPrice } = require('../utils/pricing');

const router = express.Router();

// Helper: Generate 4-digit verification OTP
const generateOtp = () => Math.floor(1000 + Math.random() * 9000).toString();

// ============================================================================
// 1. FARE ESTIMATION: POST /api/deliveries/estimate
// ============================================================================
router.post('/estimate', (req, res) => {
  const { distanceKm, parcelWeightKg } = req.body;

  if (distanceKm === undefined || parcelWeightKg === undefined) {
    return res.status(400).json({ error: 'distanceKm and parcelWeightKg are required' });
  }

  const price = calculateDeliveryPrice(Number(distanceKm), Number(parcelWeightKg));
  res.json({ distanceKm, parcelWeightKg, estimatedPrice: price });
});

// ============================================================================
// 2. CREATE DELIVERY: POST /api/deliveries (Customer only)
// Generates OTPs and broadcasts to online, approved drivers
// ============================================================================
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      pickupAddress,
      pickupLat,
      pickupLng,
      dropAddress,
      dropLat,
      dropLng,
      parcelType,
      parcelWeightKg,
      instructions,
      distanceKm
    } = req.body;

    if (!pickupAddress || !dropAddress || !parcelType || !distanceKm || !parcelWeightKg) {
      return res.status(400).json({ error: 'Missing required delivery details' });
    }

    const estimatedPrice = calculateDeliveryPrice(Number(distanceKm), Number(parcelWeightKg));
    const pickupOtp = generateOtp();
    const deliveryOtp = generateOtp();

    const delivery = await prisma.delivery.create({
      data: {
        customerId: req.user.userId,
        pickupAddress,
        pickupLat: Number(pickupLat) || 0.0,
        pickupLng: Number(pickupLng) || 0.0,
        dropAddress,
        dropLat: Number(dropLat) || 0.0,
        dropLng: Number(dropLng) || 0.0,
        parcelType,
        parcelWeightKg: Number(parcelWeightKg),
        instructions: instructions || '',
        distanceKm: Number(distanceKm),
        estimatedPrice,
        pickupOtp,
        deliveryOtp,
        status: 'REQUESTED',
        events: {
          create: {
            status: 'REQUESTED'
          }
        }
      },
      include: {
        events: true,
        customer: { select: { name: true, phone: true } }
      }
    });

    // Broadcast new delivery to all connected online drivers via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.to('online_drivers').emit('order:new', {
        id: delivery.id,
        pickupAddress: delivery.pickupAddress,
        dropAddress: delivery.dropAddress,
        distanceKm: delivery.distanceKm,
        estimatedPrice: delivery.estimatedPrice,
        parcelType: delivery.parcelType
      });
    }

    res.status(201).json({ message: 'Delivery requested successfully', delivery });
  } catch (error) {
    console.error('Create delivery error:', error);
    res.status(500).json({ error: 'Failed to create delivery order' });
  }
});

// ============================================================================
// 3. GET MY DELIVERIES: GET /api/deliveries/my (Customer view)
// ============================================================================
router.get('/my', authenticate, async (req, res) => {
  try {
    const deliveries = await prisma.delivery.findMany({
      where: { customerId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        driver: {
          include: {
            user: { select: { name: true, phone: true } },
            vehicle: true
          }
        },
        events: { orderBy: { createdAt: 'asc' } }
      }
    });

    res.json({ deliveries });
  } catch (error) {
    console.error('Get my deliveries error:', error);
    res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
});

// ============================================================================
// 4. AVAILABLE DELIVERIES: GET /api/deliveries/available (Drivers only)
// Guarded: Driver must be APPROVED and isOnline
// ============================================================================
router.get('/available', authenticate, requireRole('DRIVER'), async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.userId }
    });

    if (!driver || driver.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Your driver account is pending verification or suspended' });
    }

    if (!driver.isOnline) {
      return res.status(400).json({ error: 'You must toggle your status to Online to view available orders' });
    }

    const orders = await prisma.delivery.findMany({
      where: { status: 'REQUESTED' },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true, phone: true } }
      }
    });

    res.json({ deliveries: orders });
  } catch (error) {
    console.error('Available deliveries error:', error);
    res.status(500).json({ error: 'Failed to fetch available deliveries' });
  }
});

// ============================================================================
// 5. ACCEPT DELIVERY: PATCH /api/deliveries/:id/accept (Atomic Concurrency Lock)
// Only one driver can accept; prevents race conditions
// ============================================================================
router.patch('/:id/accept', authenticate, requireRole('DRIVER'), async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);

    // Verify driver profile and status
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.userId }
    });

    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    if (driver.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Only approved drivers can accept orders' });
    }

    if (!driver.isOnline) {
      return res.status(400).json({ error: 'You must be online to accept orders' });
    }

    // Atomic check-and-update to prevent duplicate acceptances
    const result = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.delivery.updateMany({
        where: {
          id: deliveryId,
          status: 'REQUESTED' // Locks execution: only succeeds if still REQUESTED
        },
        data: {
          driverId: driver.id,
          status: 'ACCEPTED'
        }
      });

      if (updateResult.count === 0) {
        return null; // Another driver claimed it first
      }

      await tx.deliveryEvent.create({
        data: {
          deliveryId,
          status: 'ACCEPTED'
        }
      });

      return tx.delivery.findUnique({
        where: { id: deliveryId },
        include: {
          customer: { select: { name: true, phone: true } },
          events: true
        }
      });
    });

    if (!result) {
      return res.status(409).json({ error: 'This delivery has already been accepted by another driver' });
    }

    // Notify all other online drivers to remove this order from their screens
    const io = req.app.get('io');
    if (io) {
      io.to('online_drivers').emit('order:claimed', { deliveryId });
    }

    res.json({ message: 'Delivery accepted successfully', delivery: result });
  } catch (error) {
    console.error('Accept delivery error:', error);
    res.status(500).json({ error: 'Failed to accept delivery' });
  }
});

// ============================================================================
// 6. UPDATE STATUS: PATCH /api/deliveries/:id/status (PICKED_UP / OUT_FOR_DELIVERY / DELIVERED)
// ============================================================================
router.patch('/:id/status', authenticate, requireRole('DRIVER'), async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);
    const { status, otp } = req.body;

    const allowedTransitions = ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    if (!allowedTransitions.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${allowedTransitions.join(', ')}` });
    }

    const driver = await prisma.driver.findUnique({ where: { userId: req.user.userId } });
    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });

    if (!delivery || delivery.driverId !== driver?.id) {
      return res.status(403).json({ error: 'Unauthorized: You are not assigned to this delivery' });
    }

    // Optional OTP check for verified handoff
    if (status === 'PICKED_UP' && delivery.pickupOtp && otp && otp !== delivery.pickupOtp) {
      return res.status(400).json({ error: 'Invalid pickup OTP provided by sender' });
    }
    if (status === 'DELIVERED' && delivery.deliveryOtp && otp && otp !== delivery.deliveryOtp) {
      return res.status(400).json({ error: 'Invalid delivery OTP provided by recipient' });
    }

    const updated = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        status,
        events: {
          create: { status }
        }
      },
      include: { events: true }
    });

    const io = req.app.get('io');
    if (io) {
      io.emit(`order:${deliveryId}:status`, { status });
    }

    res.json({ message: `Status updated to ${status}`, delivery: updated });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update delivery status' });
  }
});

// ============================================================================
// 7. GET ALL DELIVERIES: GET /api/deliveries/all (Admin view)
// ============================================================================
router.get('/all', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const deliveries = await prisma.delivery.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        driver: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
            vehicle: true
          }
        },
        events: { orderBy: { createdAt: 'asc' } }
      }
    });

    res.json({ deliveries });
  } catch (error) {
    console.error('Admin deliveries error:', error);
    res.status(500).json({ error: 'Failed to fetch all deliveries' });
  }
});

// ============================================================================
// 8. CANCEL DELIVERY: PATCH /api/deliveries/:id/cancel (Customer only)
// ============================================================================
router.patch('/:id/cancel', authenticate, async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId }
    });

    if (!delivery || delivery.customerId !== req.user.userId) {
      return res.status(404).json({ error: 'Delivery order not found' });
    }

    if (delivery.status !== 'REQUESTED') {
      return res.status(400).json({ error: 'Cannot cancel an order that has already been accepted or dispatched' });
    }

    const updated = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        status: 'CANCELLED',
        events: {
          create: { status: 'CANCELLED' }
        }
      },
      include: { events: true }
    });

    const io = req.app.get('io');
    if (io) {
      io.to('online_drivers').emit('order:cancelled', { deliveryId });
    }

    res.json({ message: 'Delivery cancelled successfully', delivery: updated });
  } catch (error) {
    console.error('Cancel delivery error:', error);
    res.status(500).json({ error: 'Failed to cancel delivery' });
  }
});

module.exports = router;
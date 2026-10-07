const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { calculateDeliveryPrice } = require('../utils/pricing');

const router = express.Router();

// 1. FARE ESTIMATION: POST /api/deliveries/estimate (Public or Logged In)
router.post('/estimate', (req, res) => {
  const { distanceKm, parcelWeightKg } = req.body;

  if (distanceKm === undefined || parcelWeightKg === undefined) {
    return res.status(400).json({ error: 'distanceKm and parcelWeightKg are required' });
  }

  const price = calculateDeliveryPrice(Number(distanceKm), Number(parcelWeightKg));
  res.json({ distanceKm, parcelWeightKg, estimatedPrice: price });
});

// 2. CREATE DELIVERY: POST /api/deliveries (Customer only)
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
        status: 'REQUESTED',
        events: {
          create: {
            status: 'REQUESTED'
          }
        }
      },
      include: {
        events: true
      }
    });

    res.status(201).json({ message: 'Delivery requested successfully', delivery });
  } catch (error) {
    console.error('Create delivery error:', error);
    res.status(500).json({ error: 'Failed to create delivery order' });
  }
});

// 3. GET MY DELIVERIES: GET /api/deliveries/my (Customer view)
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

// 4. AVAILABLE DELIVERIES: GET /api/deliveries/available (Drivers only)
router.get('/available', authenticate, requireRole('DRIVER'), async (req, res) => {
  try {
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

// 5. ACCEPT DELIVERY: PATCH /api/deliveries/:id/accept (Driver accepts)
router.patch('/:id/accept', authenticate, requireRole('DRIVER'), async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);

    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    if (delivery.status !== 'REQUESTED') {
      return res.status(400).json({ error: 'Delivery is no longer available' });
    }

    const updated = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        driverId: req.user.driverId,
        status: 'ACCEPTED',
        events: {
          create: { status: 'ACCEPTED' }
        }
      },
      include: { events: true }
    });

    res.json({ message: 'Delivery accepted successfully', delivery: updated });
  } catch (error) {
    console.error('Accept delivery error:', error);
    res.status(500).json({ error: 'Failed to accept delivery' });
  }
});

// 6. UPDATE STATUS: PATCH /api/deliveries/:id/status (Driver marks PICKED_UP or DELIVERED)
router.patch('/:id/status', authenticate, requireRole('DRIVER'), async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);
    const { status } = req.body;

    const allowedTransitions = ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    if (!allowedTransitions.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${allowedTransitions.join(', ')}` });
    }

    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery || delivery.driverId !== req.user.driverId) {
      return res.status(403).json({ error: 'Unauthorized: You are not assigned to this delivery' });
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

    res.json({ message: `Status updated to ${status}`, delivery: updated });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update delivery status' });
  }
});

// 7. GET ALL DELIVERIES: GET /api/deliveries/all (Admin only)
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

// CANCEL DELIVERY: PATCH /api/deliveries/:id/cancel (Customer only)
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

    res.json({ message: 'Delivery cancelled successfully', delivery: updated });
  } catch (error) {
    console.error('Cancel delivery error:', error);
    res.status(500).json({ error: 'Failed to cancel delivery' });
  }
});

module.exports = router;
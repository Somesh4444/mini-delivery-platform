const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// Route Imports
const authRoutes = require('./routes/auth');
const deliveryRoutes = require('./routes/deliveries');
const driverRoutes = require('./routes/drivers');
const adminRoutes = require('./routes/admin');

// 1. Initialize Express App
const app = express();

// 2. HTTP Server & Socket.io Configuration
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Attach socket instance so controllers/routes can access req.app.get('io')
app.set('io', io);

// 3. Socket.io Connection & Room Logic
io.on('connection', (socket) => {
  // Join the broadcast pool for active couriers
  socket.on('driver:join', () => {
    socket.join('online_drivers');
  });

  socket.on('driver:leave', () => {
    socket.leave('online_drivers');
  });

  socket.on('disconnect', () => {
    // Socket automatically cleans up room memberships on disconnect
  });
});

// 4. Global Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded driver photos and documents statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 5. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/admin', adminRoutes);

// 6. Health Check & Root Info
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SwiftDrop API is running'
  });
});

app.get('/', (req, res) => {
  res.json({
    project: 'SwiftDrop Delivery Platform API',
    description: 'Backend service powering user authentication, automated dynamic pricing, fleet management, and real-time delivery tracking.',
    version: '1.0.0',
    status: 'Operational & Live',
    author: {
      name: 'Somesh Behera',
      role: 'Full-Stack Web Developer & Creative Technologist',
      portfolio: 'https://somesh-dev.netlify.app/',
      github: 'https://github.com/Somesh4444'
    },
    documentation: {
      healthCheck: '/api/health',
      repository: 'https://github.com/Somesh4444/mini-delivery-platform'
    },
    infrastructure: {
      environment: process.env.NODE_ENV || 'development',
      hosting: 'Render',
      database: 'PostgreSQL (Neon)'
    }
  });
});

// 7. Start Server via HTTP Server (Required for Socket.io)
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
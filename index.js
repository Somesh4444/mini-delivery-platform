const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Route Imports
const authRoutes = require('./routes/auth');
const deliveryRoutes = require('./routes/deliveries');
const driverRoutes = require('./routes/drivers');
const adminRoutes = require('./routes/admin');

const app = express();

// Global Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/admin', adminRoutes);

// Health Check Route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Mini Delivery Platform API is running'
  });
});

// app.get('/', (req, res) => {
//   res.send(`
//     <!DOCTYPE html>
//     <html lang="en">
//     <head>
//       <meta charset="UTF-8" />
//       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//       <title>Mini Delivery Platform API</title>
//       <style>
//         * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
//         body { background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
//         .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; max-width: 560px; width: 100%; padding: 36px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
//         .status-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); font-size: 0.85rem; font-weight: 600; padding: 6px 14px; border-radius: 9999px; margin-bottom: 20px; }
//         .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 8px #4ade80; }
//         h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 8px; }
//         p { color: #94a3b8; line-height: 1.6; margin-bottom: 24px; font-size: 0.95rem; }
//         .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
//         .badge { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; }
//         .badge-title { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600; }
//         .badge-val { font-size: 0.95rem; font-weight: 600; color: #e2e8f0; margin-top: 4px; }
//         .btn-group { display: flex; gap: 12px; }
//         .btn { flex: 1; text-align: center; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 0.9rem; transition: all 0.2s; }
//         .btn-primary { background: #3b82f6; color: #ffffff; }
//         .btn-primary:hover { background: #2563eb; }
//         .btn-outline { background: transparent; border: 1px solid #475569; color: #cbd5e1; }
//         .btn-outline:hover { background: #334155; }
//       </style>
//     </head>
//     <body>
//       <div class="card">
//         <div class="status-badge">
//           <span class="status-dot"></span>
//           Operational & Live
//         </div>
//         <h1>Mini Delivery API</h1>
//         <p>Production backend service powering user authentication, automated dynamic pricing, fleet management, and real-time delivery tracking.</p>
//         <div class="grid">
//           <div class="badge">
//             <div class="badge-title">Environment</div>
//             <div class="badge-val">Production (Render)</div>
//           </div>
//           <div class="badge">
//             <div class="badge-title">Database</div>
//             <div class="badge-val">PostgreSQL (Neon)</div>
//           </div>
//         </div>
//         <div class="btn-group">
//           <a class="btn btn-primary" href="/api/health">Health Check</a>
//           <a class="btn btn-outline" href="https://github.com/Somesh4444/mini-delivery-platform" target="_blank" rel="noopener">GitHub Repo</a>
//         </div>
//       </div>
//     </body>
//     </html>
//   `);
// });

app.get('/', (req, res) => {
  res.json({
    project: 'Mini Delivery Platform API',
    description: 'Production backend service powering user authentication, automated dynamic pricing, fleet management, and real-time delivery tracking.',
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


// Server Listener
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { initSockets } = require('./sockets');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const pricingRoutes = require('./routes/pricing');
const walletRoutes = require('./routes/wallet');
const spacesRoutes = require('./routes/spaces');
const vehiclesRoutes = require('./routes/vehicles');
app.use('/auth', authRoutes);
app.use('/bookings', bookingRoutes);
app.use('/pricing', pricingRoutes);
app.use('/wallet', walletRoutes);
app.use('/spaces', spacesRoutes);
app.use('/vehicles', vehiclesRoutes);

// Day 1 health checks. DB/Redis checks added Day 4+.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'smartdrive-backend', time: new Date().toISOString() });
});

app.get('/ready', (_req, res) => {
  // Minimal readiness: env present. Deep checks (pg/redis) come later.
  const ready = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
  res.status(ready ? 200 : 503).json({ ready, checks: { env: ready } });
});

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[backend] error:', err.message);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'internal_error' });
});

const server = http.createServer(app);
const io = initSockets(server);
app.set('io', io);

if (require.main === module) {
  server.listen(PORT, () => console.log(`[backend] http+socket listening on :${PORT}`));
}

module.exports = { app, server, io };

import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { initSockets } from './sockets';
import type { Server } from 'socket.io';

import authRoutes from './routes/auth';
import bookingRoutes from './routes/bookings';
import pricingRoutes from './routes/pricing';
import walletRoutes from './routes/wallet';
import spacesRoutes from './routes/spaces';
import vehiclesRoutes from './routes/vehicles';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[backend] error:', err.message);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'internal_error' });
});

const server = http.createServer(app);
const io: Server = initSockets(server);
app.set('io', io);

if (require.main === module) {
  server.listen(PORT, () => console.log(`[backend] http+socket listening on :${PORT}`));
}

export { app, server, io };

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

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

app.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`);
});

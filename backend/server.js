require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const authRoutes         = require('./routes/auth');
const transactionsRoutes = require('./routes/transactions');
const weaponsRoutes      = require('./routes/weapons');
const membersRoutes      = require('./routes/members');
const groupsRoutes       = require('./routes/groups');
const summariesRoutes    = require('./routes/summaries');
const vehiclesRoutes     = require('./routes/vehicles');
const missionsRoutes     = require('./routes/missions');
const adminRoutes        = require('./routes/admin');
const { router: logsRoutes } = require('./routes/logs');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// ── API Routes ──
app.use('/api/auth',         authRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/weapons',      weaponsRoutes);
app.use('/api/members',      membersRoutes);
app.use('/api/groups',       groupsRoutes);
app.use('/api/summaries',    summariesRoutes);
app.use('/api/vehicles',     vehiclesRoutes);
app.use('/api/missions',     missionsRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/logs',         logsRoutes);

// ── Health check ──
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Fallback API ──
app.use((req, res) => {
  res.status(404).json({ error: 'Route introuvable.' });
});

// Démarrage local uniquement (Vercel gère le cycle de vie en serverless)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ Vanilla Unicorn backend démarré sur http://localhost:${PORT}`);
  });
}

module.exports = app;

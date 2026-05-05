const express = require('express');
const pool    = require('../db');
const auth    = require('../middleware/authMiddleware');
const router  = express.Router();

// GET /api/members
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, rp_name FROM users ORDER BY rp_name ASC');
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// GET /api/members/:id/profile
router.get('/:id/profile', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });
  try {
    const [userRes, weaponsRes, vehiclesRes, txRes] = await Promise.all([
      pool.query('SELECT id, username, rp_name, created_at FROM users WHERE id=$1', [id]),
      pool.query('SELECT id, name, category, notes FROM weapons WHERE assigned_to=$1 ORDER BY name ASC', [id]),
      pool.query('SELECT id, name, category, notes FROM vehicles WHERE assigned_to=$1 ORDER BY name ASC', [id]),
      pool.query(`
        SELECT t.*, u.rp_name AS member_name
        FROM transactions t LEFT JOIN users u ON t.user_id = u.id
        WHERE t.user_id=$1 ORDER BY t.created_at DESC LIMIT 10
      `, [id]),
    ]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'Membre introuvable.' });
    res.json({
      user:         userRes.rows[0],
      weapons:      weaponsRes.rows,
      vehicles:     vehiclesRes.rows,
      transactions: txRes.rows,
    });
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;

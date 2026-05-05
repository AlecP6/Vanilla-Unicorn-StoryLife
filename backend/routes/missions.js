const express    = require('express');
const pool       = require('../db');
const auth       = require('../middleware/authMiddleware');
const { addLog } = require('./logs');
const router     = express.Router();

// GET /api/missions
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.*, u.rp_name AS created_by_name
      FROM missions m
      LEFT JOIN users u ON m.created_by = u.id
      ORDER BY m.created_at DESC
    `);
    res.json(rows);
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/missions
router.post('/', auth, async (req, res) => {
  const { title, description, priority, assigned_ids } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Le titre est requis.' });
  try {
    const { rows } = await pool.query(`
      INSERT INTO missions (title, description, priority, assigned_ids, created_by)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [title.trim(), description?.trim() || '', priority || 'normale', assigned_ids || '', req.user.id]);
    const row = rows[0];
    row.created_by_name = req.user.rp_name;
    res.status(201).json(row);

    addLog(pool, { action: 'créé', entity_type: 'Mission', entity_name: title.trim(), user_id: req.user.id, user_rp_name: req.user.rp_name });
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// PATCH /api/missions/:id/status
router.patch('/:id/status', auth, async (req, res) => {
  const { status } = req.body;
  const valid = ['en_cours', 'termine', 'echoue'];
  const labels = { en_cours: 'En cours', termine: 'Terminée', echoue: 'Échouée' };
  if (!valid.includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
  try {
    const { rows } = await pool.query(
      'UPDATE missions SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Mission introuvable.' });
    res.json(rows[0]);

    addLog(pool, { action: 'statut modifié', entity_type: 'Mission', entity_name: rows[0].title, user_id: req.user.id, user_rp_name: req.user.rp_name, details: `→ ${labels[status]}` });
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// PUT /api/missions/:id
router.put('/:id', auth, async (req, res) => {
  const { title, description, priority, assigned_ids } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Le titre est requis.' });
  try {
    const { rows } = await pool.query(`
      UPDATE missions SET title=$1, description=$2, priority=$3, assigned_ids=$4, updated_at=NOW()
      WHERE id=$5 RETURNING *
    `, [title.trim(), description?.trim() || '', priority || 'normale', assigned_ids || '', req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Mission introuvable.' });
    res.json(rows[0]);

    addLog(pool, { action: 'modifié', entity_type: 'Mission', entity_name: title.trim(), user_id: req.user.id, user_rp_name: req.user.rp_name });
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// DELETE /api/missions/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM missions WHERE id=$1 RETURNING title', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Mission introuvable.' });
    res.json({ success: true });

    addLog(pool, { action: 'supprimé', entity_type: 'Mission', entity_name: rows[0].title, user_id: req.user.id, user_rp_name: req.user.rp_name });
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;

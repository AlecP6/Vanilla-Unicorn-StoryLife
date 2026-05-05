const express    = require('express');
const pool       = require('../db');
const auth       = require('../middleware/authMiddleware');
const { addLog } = require('./logs');

const router = express.Router();

// GET /api/weapons
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT w.id, w.name, w.category, w.notes, w.created_at,
             w.assigned_to,
             u.rp_name  AS assigned_to_name,
             a.rp_name  AS added_by_name
      FROM weapons w
      LEFT JOIN users u ON w.assigned_to = u.id
      LEFT JOIN users a ON w.added_by    = a.id
      ORDER BY w.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Get weapons error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/weapons
router.post('/', auth, async (req, res) => {
  const { name, category, notes } = req.body;

  if (!name || name.trim() === '')         return res.status(400).json({ error: 'Le nom est requis.' });
  if (!category || category.trim() === '') return res.status(400).json({ error: 'La catégorie est requise.' });

  try {
    const result = await pool.query(`
      INSERT INTO weapons (name, category, notes, added_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name.trim(), category.trim(), notes?.trim() || null, req.user.id]);

    const weapon = result.rows[0];
    weapon.added_by_name    = req.user.rp_name;
    weapon.assigned_to_name = null;
    res.status(201).json(weapon);

    addLog(pool, { action: 'ajouté', entity_type: 'Arme', entity_name: name.trim(), user_id: req.user.id, user_rp_name: req.user.rp_name, details: category.trim() });
  } catch (err) {
    console.error('Add weapon error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PATCH /api/weapons/:id/assign
router.patch('/:id/assign', auth, async (req, res) => {
  const id     = parseInt(req.params.id);
  const userId = req.body.user_id ?? null;

  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const result = await pool.query(
      'UPDATE weapons SET assigned_to = $1 WHERE id = $2 RETURNING *',
      [userId, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Arme introuvable.' });

    const full = await pool.query(`
      SELECT w.id, w.name, w.category, w.notes, w.created_at,
             w.assigned_to,
             u.rp_name AS assigned_to_name,
             a.rp_name AS added_by_name
      FROM weapons w
      LEFT JOIN users u ON w.assigned_to = u.id
      LEFT JOIN users a ON w.added_by    = a.id
      WHERE w.id = $1
    `, [id]);

    res.json(full.rows[0]);

    const memberName = full.rows[0].assigned_to_name || 'Aucun';
    addLog(pool, { action: 'attribué', entity_type: 'Arme', entity_name: result.rows[0].name, user_id: req.user.id, user_rp_name: req.user.rp_name, details: `→ ${memberName}` });
  } catch (err) {
    console.error('Assign weapon error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/weapons/:id
router.delete('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const result = await pool.query('DELETE FROM weapons WHERE id = $1 RETURNING name', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Arme introuvable.' });
    res.json({ success: true, id });

    addLog(pool, { action: 'supprimé', entity_type: 'Arme', entity_name: result.rows[0].name, user_id: req.user.id, user_rp_name: req.user.rp_name });
  } catch (err) {
    console.error('Delete weapon error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;

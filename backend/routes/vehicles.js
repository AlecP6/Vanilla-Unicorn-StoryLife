const express    = require('express');
const pool       = require('../db');
const auth       = require('../middleware/authMiddleware');
const { addLog } = require('./logs');

const router = express.Router();
const VALID_CATEGORIES = ['Moto', '4X4', 'Voiture'];

// GET /api/vehicles
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.id, v.name, v.category, v.notes, v.created_at,
             v.assigned_to,
             u.rp_name AS assigned_to_name,
             a.rp_name AS added_by_name
      FROM vehicles v
      LEFT JOIN users u ON v.assigned_to = u.id
      LEFT JOIN users a ON v.added_by    = a.id
      ORDER BY v.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Get vehicles error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/vehicles
router.post('/', auth, async (req, res) => {
  const { name, category, notes } = req.body;

  if (!name || name.trim() === '')          return res.status(400).json({ error: 'Le nom est requis.' });
  if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Catégorie invalide.' });

  try {
    const result = await pool.query(`
      INSERT INTO vehicles (name, category, notes, added_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name.trim(), category, notes?.trim() || null, req.user.id]);

    const vehicle = result.rows[0];
    vehicle.added_by_name    = req.user.rp_name;
    vehicle.assigned_to_name = null;
    res.status(201).json(vehicle);

    addLog(pool, { action: 'ajouté', entity_type: 'Véhicule', entity_name: name.trim(), user_id: req.user.id, user_rp_name: req.user.rp_name, details: category });
  } catch (err) {
    console.error('Add vehicle error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PATCH /api/vehicles/:id/assign
router.patch('/:id/assign', auth, async (req, res) => {
  const id     = parseInt(req.params.id);
  const userId = req.body.user_id ?? null;

  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const result = await pool.query(
      'UPDATE vehicles SET assigned_to=$1 WHERE id=$2 RETURNING *',
      [userId, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Véhicule introuvable.' });

    const full = await pool.query(`
      SELECT v.id, v.name, v.category, v.notes, v.created_at,
             v.assigned_to,
             u.rp_name AS assigned_to_name,
             a.rp_name AS added_by_name
      FROM vehicles v
      LEFT JOIN users u ON v.assigned_to = u.id
      LEFT JOIN users a ON v.added_by    = a.id
      WHERE v.id=$1
    `, [id]);

    res.json(full.rows[0]);

    const memberName = full.rows[0].assigned_to_name || 'Aucun';
    addLog(pool, { action: 'attribué', entity_type: 'Véhicule', entity_name: result.rows[0].name, user_id: req.user.id, user_rp_name: req.user.rp_name, details: `→ ${memberName}` });
  } catch (err) {
    console.error('Assign vehicle error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/vehicles/:id
router.delete('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const result = await pool.query('DELETE FROM vehicles WHERE id=$1 RETURNING name', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Véhicule introuvable.' });
    res.json({ success: true, id });

    addLog(pool, { action: 'supprimé', entity_type: 'Véhicule', entity_name: result.rows[0].name, user_id: req.user.id, user_rp_name: req.user.rp_name });
  } catch (err) {
    console.error('Delete vehicle error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;

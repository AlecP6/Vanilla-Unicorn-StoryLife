const express     = require('express');
const pool        = require('../db');
const auth        = require('../middleware/authMiddleware');
const { addLog }  = require('./logs');

const router = express.Router();

// GET /api/groups
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT g.*,
             c.rp_name AS created_by_name,
             u.rp_name AS updated_by_name
      FROM groups g
      LEFT JOIN users c ON g.created_by = c.id
      LEFT JOIN users u ON g.updated_by = u.id
      ORDER BY g.name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/groups
router.post('/', auth, async (req, res) => {
  const { name, residence, territory, business, company, notes, color, zone_ids, phone } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Le nom du groupe est requis.' });
  }

  try {
    const result = await pool.query(`
      INSERT INTO groups (name, residence, territory, business, company, notes, color, zone_ids, phone, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
      RETURNING *
    `, [
      name.trim(),
      residence?.trim() || null,
      territory?.trim() || null,
      business?.trim()  || null,
      company?.trim()   || null,
      notes?.trim()     || null,
      color || '#4caf82',
      zone_ids || '',
      phone?.trim()     || null,
      req.user.id,
    ]);

    const row = result.rows[0];
    row.created_by_name = req.user.rp_name;
    row.updated_by_name = req.user.rp_name;
    res.status(201).json(row);

    addLog(pool, { action: 'créé', entity_type: 'Groupe', entity_name: name.trim(), user_id: req.user.id, user_rp_name: req.user.rp_name });
  } catch (err) {
    console.error('Add group error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PUT /api/groups/:id
router.put('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });

  const { name, residence, territory, business, company, notes, color, zone_ids, phone } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Le nom du groupe est requis.' });
  }

  try {
    await pool.query(`
      UPDATE groups
      SET name=$1, residence=$2, territory=$3, business=$4, company=$5, notes=$6,
          color=$7, zone_ids=$8, phone=$9, updated_by=$10, updated_at=NOW()
      WHERE id=$11
    `, [
      name.trim(),
      residence?.trim() || null,
      territory?.trim() || null,
      business?.trim()  || null,
      company?.trim()   || null,
      notes?.trim()     || null,
      color || '#4caf82',
      zone_ids || '',
      phone?.trim()     || null,
      req.user.id,
      id,
    ]);

    const full = await pool.query(`
      SELECT g.*, c.rp_name AS created_by_name, u.rp_name AS updated_by_name
      FROM groups g
      LEFT JOIN users c ON g.created_by = c.id
      LEFT JOIN users u ON g.updated_by = u.id
      WHERE g.id = $1
    `, [id]);

    if (full.rows.length === 0) return res.status(404).json({ error: 'Groupe introuvable.' });
    res.json(full.rows[0]);

    addLog(pool, { action: 'modifié', entity_type: 'Groupe', entity_name: name.trim(), user_id: req.user.id, user_rp_name: req.user.rp_name });
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/groups/:id
router.delete('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const result = await pool.query('DELETE FROM groups WHERE id=$1 RETURNING name', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Groupe introuvable.' });
    res.json({ success: true, id });

    addLog(pool, { action: 'supprimé', entity_type: 'Groupe', entity_name: result.rows[0].name, user_id: req.user.id, user_rp_name: req.user.rp_name });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;

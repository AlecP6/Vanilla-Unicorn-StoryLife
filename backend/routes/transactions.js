const express    = require('express');
const pool       = require('../db');
const auth       = require('../middleware/authMiddleware');
const { addLog } = require('./logs');

const router = express.Router();

// GET /api/transactions
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.type, t.member, t.motif, t.amount, t.created_at,
              u.rp_name AS created_by_name
       FROM transactions t
       LEFT JOIN users u ON t.created_by = u.id
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/transactions
router.post('/', auth, async (req, res) => {
  const { type, motif, amount } = req.body;

  if (!type || !['entree', 'sortie'].includes(type)) {
    return res.status(400).json({ error: 'Type invalide (entree ou sortie).' });
  }
  if (!motif || motif.trim() === '') {
    return res.status(400).json({ error: 'Le motif est requis.' });
  }
  if (!amount || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Montant invalide (entier positif requis).' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO transactions (type, member, motif, amount, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [type, req.user.rp_name, motif.trim(), amount, req.user.id]
    );
    res.status(201).json(result.rows[0]);

    const label = type === 'entree' ? 'Entrée' : 'Sortie';
    addLog(pool, { action: label, entity_type: 'Transaction', entity_name: motif.trim(), user_id: req.user.id, user_rp_name: req.user.rp_name, details: `$${amount}` });
  } catch (err) {
    console.error('Add transaction error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const result = await pool.query(
      'DELETE FROM transactions WHERE id = $1 RETURNING motif, amount',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction introuvable.' });
    }
    res.json({ success: true, id });

    addLog(pool, { action: 'supprimé', entity_type: 'Transaction', entity_name: result.rows[0].motif, user_id: req.user.id, user_rp_name: req.user.rp_name, details: `$${result.rows[0].amount}` });
  } catch (err) {
    console.error('Delete transaction error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;

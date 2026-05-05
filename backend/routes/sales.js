const express = require('express');
const pool    = require('../db');
const auth    = require('../middleware/authMiddleware');
const router  = express.Router();

// GET /api/sales/items — catalogue de tous les articles
router.get('/items', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM sale_items ORDER BY category, name'
    );
    res.json(rows);
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// GET /api/sales/my — historique des ventes de l'utilisateur connecté
router.get('/my', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.quantity, s.unit_price, s.total, s.created_at,
             i.name AS item_name, i.category
      FROM sales s
      JOIN sale_items i ON s.item_id = i.id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
      LIMIT 50
    `, [req.user.id]);
    res.json(rows);
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/sales — enregistrer une vente + créer la transaction comptable
router.post('/', auth, async (req, res) => {
  const { item_id, quantity, custom_amount } = req.body;
  const qty = parseInt(quantity) || 1;
  if (!item_id || qty < 1) return res.status(400).json({ error: 'Données invalides.' });

  try {
    const itemRes = await pool.query('SELECT * FROM sale_items WHERE id = $1', [item_id]);
    if (!itemRes.rows.length) return res.status(404).json({ error: 'Article introuvable.' });
    const item = itemRes.rows[0];

    let unitPrice, total;
    if (item.custom_price) {
      const amt = parseInt(custom_amount);
      if (!amt || amt <= 0) return res.status(400).json({ error: 'Montant requis pour cet article.' });
      unitPrice = amt;
      total     = amt * qty;
    } else {
      unitPrice = item.price;
      total     = item.price * qty;
    }

    // Enregistrer la vente
    const { rows } = await pool.query(`
      INSERT INTO sales (user_id, item_id, quantity, unit_price, total)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [req.user.id, item_id, qty, unitPrice, total]);

    // Créer automatiquement une transaction comptable (entrée)
    await pool.query(`
      INSERT INTO transactions (type, member, motif, amount, created_by)
      VALUES ('entree', $1, $2, $3, $4)
    `, [req.user.rp_name, `Vente — ${item.name} ×${qty}`, total, req.user.id]);

    res.status(201).json({ ...rows[0], item_name: item.name, category: item.category });
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;

const express = require('express');
const pool    = require('../db');
const auth    = require('../middleware/authMiddleware');
const router  = express.Router();

async function adminOnly(req, res, next) {
  const { rows } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]?.is_admin) return res.status(403).json({ error: 'Accès refusé.' });
  next();
}

// GET /api/sales/items — catalogue de tous les articles
router.get('/items', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM sale_items ORDER BY category, name'
    );
    res.json(rows);
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// GET /api/sales/my — historique des ventes de l'utilisateur connecté (filtrable par semaine)
router.get('/my', auth, async (req, res) => {
  try {
    const { week_start } = req.query;
    let rows;
    if (week_start && /^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
      ({ rows } = await pool.query(`
        SELECT s.id, s.quantity, s.unit_price, s.total, s.created_at,
               i.name AS item_name, i.category
        FROM sales s
        JOIN sale_items i ON s.item_id = i.id
        WHERE s.user_id = $1
          AND s.created_at >= $2::date
          AND s.created_at < ($2::date + INTERVAL '7 days')
        ORDER BY s.created_at DESC
      `, [req.user.id, week_start]));
    } else {
      ({ rows } = await pool.query(`
        SELECT s.id, s.quantity, s.unit_price, s.total, s.created_at,
               i.name AS item_name, i.category
        FROM sales s
        JOIN sale_items i ON s.item_id = i.id
        WHERE s.user_id = $1
        ORDER BY s.created_at DESC
        LIMIT 50
      `, [req.user.id]));
    }
    res.json(rows);
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// DELETE /api/sales/all — réinitialise toutes les ventes et leurs transactions liées (admin seulement)
router.delete('/all', auth, adminOnly, async (req, res) => {
  try {
    const txRes = await pool.query('SELECT transaction_id FROM sales WHERE transaction_id IS NOT NULL');
    const txIds = txRes.rows.map(r => r.transaction_id);
    await pool.query('DELETE FROM sales');
    if (txIds.length > 0) {
      await pool.query('DELETE FROM transactions WHERE id = ANY($1)', [txIds]);
    }
    res.json({ success: true, deleted_sales: txRes.rows.length });
  } catch (err) {
    console.error('Reset sales error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
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

    // Créer la transaction comptable et récupérer son id
    const txRes = await pool.query(`
      INSERT INTO transactions (type, member, motif, amount, created_by)
      VALUES ('entree', $1, $2, $3, $4) RETURNING id
    `, [req.user.rp_name, `Vente — ${item.name} ×${qty}`, total, req.user.id]);
    const transactionId = txRes.rows[0].id;

    // Enregistrer la vente liée à la transaction
    const { rows } = await pool.query(`
      INSERT INTO sales (user_id, item_id, quantity, unit_price, total, transaction_id)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [req.user.id, item_id, qty, unitPrice, total, transactionId]);

    res.status(201).json({ ...rows[0], item_name: item.name, category: item.category });
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;

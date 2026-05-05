const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const router   = express.Router();
const pool     = require('../db');
const auth     = require('../middleware/authMiddleware');

// Génère un code de 6 caractères déterministe pour la journée UTC courante.
// Le code est basé sur HMAC-SHA256(JWT_SECRET, date_UTC), ce qui garantit :
//  - un changement automatique toutes les 24h (à minuit UTC)
//  - l'impossibilité de le deviner sans connaître le secret
function getDailyRegisterCode() {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const secret = process.env.JWT_SECRET || 'fallback-secret';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update('register-code:' + today);
  return hmac.digest('hex').slice(0, 6).toUpperCase();
}

// Middleware : admin seulement
async function adminOnly(req, res, next) {
  const { rows } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]?.is_admin) return res.status(403).json({ error: 'Accès refusé.' });
  next();
}

// GET /api/admin/register-code — retourne le code d'inscription du jour (admin uniquement)
router.get('/register-code', auth, adminOnly, (req, res) => {
  res.json({ code: getDailyRegisterCode() });
});

// GET /api/admin/users — liste tous les utilisateurs
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, rp_name, is_admin, created_at FROM users ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PATCH /api/admin/users/:id/reset-password — réinitialise le mot de passe
router.patch('/users/:id/reset-password', auth, adminOnly, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4)
    return res.status(400).json({ error: 'Mot de passe trop court (min. 4 caractères).' });
  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashed, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PATCH /api/admin/users/:id/toggle-admin — promouvoir / rétrograder
router.patch('/users/:id/toggle-admin', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE users SET is_admin = NOT is_admin WHERE id = $1 RETURNING is_admin', [req.params.id]
    );
    res.json({ is_admin: rows[0].is_admin });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/admin/users/:id — supprimer un utilisateur
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  if (Number(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Impossible de supprimer votre propre compte.' });
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;

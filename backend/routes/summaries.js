const express    = require('express');
const https      = require('https');
const pool       = require('../db');
const auth       = require('../middleware/authMiddleware');
const { addLog } = require('./logs');

const router = express.Router();

function sendDiscordWebhook(summary) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const dateFormatted = summary.event_date
    ? new Date(summary.event_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  const payload = JSON.stringify({
    embeds: [{
      title:       `📋 ${summary.title}`,
      description: summary.content.length > 4000
        ? summary.content.slice(0, 3997) + '...'
        : summary.content,
      color:       0x4caf82,
      fields: [
        { name: '📅 Date de l\'événement', value: dateFormatted,           inline: true },
        { name: '✍️ Publié par',           value: summary.created_by_name, inline: true },
      ],
      footer:    { text: 'Vanilla Unicorn — Comptes-rendus' },
      timestamp: new Date().toISOString(),
    }],
  });

  try {
    const url  = new URL(webhookUrl);
    const opts = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };
    const req = https.request(opts, (res) => {
      res.resume();
      if (res.statusCode < 200 || res.statusCode >= 300) {
        console.error(`Discord webhook error: HTTP ${res.statusCode}`);
      }
    });
    req.on('error', (err) => console.error('Discord webhook request error:', err.message));
    req.write(payload);
    req.end();
  } catch (err) {
    console.error('Discord webhook setup error:', err.message);
  }
}

// GET /api/summaries
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.rp_name AS created_by_name
      FROM summaries s
      LEFT JOIN users u ON s.created_by = u.id
      ORDER BY s.event_date DESC, s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Get summaries error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/summaries
router.post('/', auth, async (req, res) => {
  const { title, content, event_date } = req.body;

  if (!title    || title.trim()    === '') return res.status(400).json({ error: 'Le titre est requis.' });
  if (!content  || content.trim()  === '') return res.status(400).json({ error: 'Le contenu est requis.' });
  if (!event_date)                         return res.status(400).json({ error: 'La date est requise.' });

  try {
    const result = await pool.query(`
      INSERT INTO summaries (title, content, event_date, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [title.trim(), content.trim(), event_date, req.user.id]);

    const row = result.rows[0];
    row.created_by_name = req.user.rp_name;
    res.status(201).json(row);

    sendDiscordWebhook(row);
    addLog(pool, { action: 'publié', entity_type: 'Résumé', entity_name: title.trim(), user_id: req.user.id, user_rp_name: req.user.rp_name });
  } catch (err) {
    console.error('Add summary error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PUT /api/summaries/:id
router.put('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });

  const { title, content, event_date } = req.body;
  if (!title    || title.trim()    === '') return res.status(400).json({ error: 'Le titre est requis.' });
  if (!content  || content.trim()  === '') return res.status(400).json({ error: 'Le contenu est requis.' });
  if (!event_date)                         return res.status(400).json({ error: 'La date est requise.' });

  try {
    const result = await pool.query(`
      UPDATE summaries SET title=$1, content=$2, event_date=$3, updated_at=NOW()
      WHERE id=$4 RETURNING *
    `, [title.trim(), content.trim(), event_date, id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Résumé introuvable.' });

    const full = await pool.query(`
      SELECT s.*, u.rp_name AS created_by_name
      FROM summaries s LEFT JOIN users u ON s.created_by = u.id
      WHERE s.id=$1
    `, [id]);
    res.json(full.rows[0]);

    addLog(pool, { action: 'modifié', entity_type: 'Résumé', entity_name: title.trim(), user_id: req.user.id, user_rp_name: req.user.rp_name });
  } catch (err) {
    console.error('Update summary error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/summaries/:id
router.delete('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const result = await pool.query('DELETE FROM summaries WHERE id=$1 RETURNING title', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Résumé introuvable.' });
    res.json({ success: true, id });

    addLog(pool, { action: 'supprimé', entity_type: 'Résumé', entity_name: result.rows[0].title, user_id: req.user.id, user_rp_name: req.user.rp_name });
  } catch (err) {
    console.error('Delete summary error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;

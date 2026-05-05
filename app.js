// ===== CONFIG =====
const API = '/api';

// ===== ANIMATIONS UTILITAIRES =====

// Applique une animation d'apparition décalée (stagger) sur toutes les cartes d'une grille.
// Chaque carte repart de opacity:0 puis se réanime avec un délai de 55ms × son index,
// produisant un effet visuel d'entrée en cascade plutôt qu'un apparition simultanée.
function applyStagger(grid) {
  const cards = grid.querySelectorAll('.weapon-card, .group-card, .mission-card');
  cards.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.animation = 'none';
    // Double requestAnimationFrame nécessaire pour forcer le navigateur à "voir"
    // le reset de l'animation avant de relancer la nouvelle.
    requestAnimationFrame(() => {
      el.style.animation = `fadeIn 0.35s cubic-bezier(.22,1,.36,1) ${i * 55}ms forwards`;
    });
  });
}

// Anime un compteur numérique de 0 vers `target` sur 650ms avec un easing "ease-out cubic"
// (décélération progressive). Le `formatter` optionnel est appliqué à chaque frame
// pour afficher des unités (ex : formatAmount pour les montants $).
// Si la valeur n'est pas numérique, elle est affichée directement sans animation.
function animateCounter(el, target, formatter = null) {
  const num = parseFloat(String(target).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) { el.textContent = formatter ? formatter(target) : target; return; }
  const start = performance.now();
  const duration = 650;
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    // Formule ease-out cubique : rapide au début, ralentit vers la fin
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(eased * num);
    el.textContent = formatter ? formatter(current) : current;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = formatter ? formatter(num) : num;
  };
  requestAnimationFrame(step);
}

// ===== LOADING SCREEN =====
function hideLoadingScreen() {
  const el = document.getElementById('loadingScreen');
  if (el) el.classList.add('hidden');
}

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'success') {
  const icons = { success: '✓', error: '✕', warning: '⚠' };
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '•'}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('show')); });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

// ===== CONFIRM MODAL =====
let _confirmCallback = null;
function confirmAction(message, callback, confirmLabel = 'Supprimer') {
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('btnConfirmYes').textContent = confirmLabel;
  _confirmCallback = callback;
  openModal('confirmModal');
}
document.getElementById('btnConfirmYes')?.addEventListener('click', () => {
  closeModal('confirmModal');
  if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
});
document.getElementById('btnConfirmNo')?.addEventListener('click', () => {
  closeModal('confirmModal');
  _confirmCallback = null;
});
document.getElementById('confirmModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('confirmModal')) {
    closeModal('confirmModal');
    _confirmCallback = null;
  }
});

// ===== AUTH =====
// currentUser : objet utilisateur courant (id, rp_name, is_admin…) ; null si déconnecté.
// authToken   : JWT renvoyé par le serveur, inclus dans chaque requête API.
let currentUser = null;
let authToken   = null;

// Relit la session depuis sessionStorage (persist le temps de l'onglet, pas au-delà).
// Retourne { token, user } ou null si aucune session n'est enregistrée.
function getStoredSession() {
  const token = sessionStorage.getItem('cc_token');
  const user  = sessionStorage.getItem('cc_user');
  if (token && user) return { token, user: JSON.parse(user) };
  return null;
}

// Persiste le token JWT et les données utilisateur pour la durée de l'onglet.
function storeSession(token, user) {
  sessionStorage.setItem('cc_token', token);
  sessionStorage.setItem('cc_user', JSON.stringify(user));
}

// Supprime la session stockée (appel lors de la déconnexion).
function clearStoredSession() {
  sessionStorage.removeItem('cc_token');
  sessionStorage.removeItem('cc_user');
}

function showAuthOverlay() {
  document.getElementById('authOverlay').classList.remove('hidden');
}

function hideAuthOverlay() {
  document.getElementById('authOverlay').classList.add('hidden');
}

function showPanel(id) {
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setAuthError(panelId, msg) {
  const errorId = panelId === 'panelLogin' ? 'loginError' : 'registerError';
  document.getElementById(errorId).textContent = msg;
}

function clearAuthErrors() {
  document.getElementById('loginError').textContent    = '';
  document.getElementById('registerError').textContent = '';
}

// Switch panels
document.getElementById('goRegister')?.addEventListener('click', (e) => {
  e.preventDefault();
  clearAuthErrors();
  showPanel('panelRegister');
});

document.getElementById('goLogin')?.addEventListener('click', (e) => {
  e.preventDefault();
  clearAuthErrors();
  showPanel('panelLogin');
});

// Register
document.getElementById('btnRegister')?.addEventListener('click', async () => {
  const username    = document.getElementById('regId').value.trim();
  const rp_name     = document.getElementById('regRpName').value.trim();
  const password    = document.getElementById('regPwd').value;
  const confirm     = document.getElementById('regPwdConfirm').value;
  const invite_code = document.getElementById('regInviteCode').value.trim();

  if (!username)    return setAuthError('panelRegister', 'L\'identifiant est requis.');
  if (!rp_name)     return setAuthError('panelRegister', 'Le nom RP est requis.');
  if (!password)    return setAuthError('panelRegister', 'Le mot de passe est requis.');
  if (password.length < 4) return setAuthError('panelRegister', 'Mot de passe trop court (min. 4 caractères).');
  if (password !== confirm) return setAuthError('panelRegister', 'Les mots de passe ne correspondent pas.');
  if (!invite_code) return setAuthError('panelRegister', 'Le code d\'invitation est requis.');

  setAuthLoading('btnRegister', true);
  try {
    const res  = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, rp_name, password, invite_code }),
    });
    const data = await res.json();
    if (!res.ok) return setAuthError('panelRegister', data.error || 'Erreur.');
    loginUser(data.token, data.user);
  } catch {
    setAuthError('panelRegister', 'Impossible de contacter le serveur.');
  } finally {
    setAuthLoading('btnRegister', false);
  }
});

// Login
document.getElementById('btnLogin')?.addEventListener('click', async () => {
  const username = document.getElementById('loginId').value.trim();
  const password = document.getElementById('loginPwd').value;

  if (!username) return setAuthError('panelLogin', 'L\'identifiant est requis.');
  if (!password) return setAuthError('panelLogin', 'Le mot de passe est requis.');

  setAuthLoading('btnLogin', true);
  try {
    const res  = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) return setAuthError('panelLogin', data.error || 'Erreur.');
    loginUser(data.token, data.user);
  } catch {
    setAuthError('panelLogin', 'Impossible de contacter le serveur.');
  } finally {
    setAuthLoading('btnLogin', false);
  }
});

function setAuthLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading
    ? 'Chargement...'
    : btnId === 'btnLogin' ? 'Se connecter' : 'Créer le compte';
}

// Enter key on auth inputs
document.querySelectorAll('.auth-input').forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const panel = input.closest('.auth-panel');
    if (panel?.id === 'panelLogin')    document.getElementById('btnLogin').click();
    if (panel?.id === 'panelRegister') document.getElementById('btnRegister').click();
  });
});

// Met à jour les variables globales de session, persiste et initialise l'interface.
function loginUser(token, user) {
  currentUser = user;
  authToken   = token;
  storeSession(token, user);
  hideAuthOverlay();
  onUserLoggedIn(user);
}

// Appelé après une connexion réussie : met à jour l'avatar, le nom RP en topbar,
// affiche le lien Admin uniquement aux admins et charge le dashboard.
function onUserLoggedIn(user) {
  // Génère les initiales à partir du nom RP (ex : "Jean Dupont" → "JD")
  const initials = user.rp_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('userAvatar').textContent = initials;
  document.getElementById('userRpName').textContent = user.rp_name;
  const adminNav = document.getElementById('adminNavItem');
  if (adminNav) adminNav.style.display = user.is_admin ? '' : 'none';
  switchSection('dashboard');
}

// Logout
document.getElementById('btnLogout')?.addEventListener('click', () => {
  clearStoredSession();
  currentUser = null;
  authToken   = null;
  document.getElementById('loginId').value = '';
  document.getElementById('loginPwd').value = '';
  clearAuthErrors();
  showPanel('panelLogin');
  showAuthOverlay();
});

// ===== NAVIGATION =====
const navItems    = document.querySelectorAll('.nav-item');
const sections    = document.querySelectorAll('.section');
const topbarTitle = document.getElementById('topbarTitle');

// Correspondance entre l'id de section et le titre affiché dans la topbar.
const sectionTitles = {
  'dashboard':     'Dashboard',
  'comptabilite':  'Comptabilité',
  'armement':      'Personnel',
  'groupes':       'Contacts',
  'missions':      'Événements',
  'admin':         'Administration',
};

// Restore session on load
const saved = getStoredSession();
if (saved) {
  loginUser(saved.token, saved.user);
  setTimeout(hideLoadingScreen, 600);
} else {
  showAuthOverlay();
  hideLoadingScreen();
}

// Active la section cible (affichage CSS), met à jour la navigation,
// ferme la sidebar sur mobile et déclenche le chargement des données spécifiques à la section.
function switchSection(targetId) {
  sections.forEach(s => s.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));
  const targetSection = document.getElementById('section-' + targetId);
  const targetNav     = document.querySelector(`[data-section="${targetId}"]`);
  if (targetSection) targetSection.classList.add('active');
  if (targetNav)     targetNav.classList.add('active');
  if (topbarTitle)   topbarTitle.textContent = sectionTitles[targetId] || targetId;
  if (window.innerWidth <= 768) closeSidebar();

  // Chargement des données par section — chaque section charge ses données à la demande (lazy loading)
  if (currentUser) {
    if (targetId === 'comptabilite') {
      refreshComptabilite();
    }
    if (targetId === 'armement') {
      fetchWeapons();
      fetchMembers();
    }
    if (targetId === 'groupes') {
      fetchGroups();
    }
    if (targetId === 'resume-tables') {
      fetchSummaries();
      initSummaryDate();
    }
    if (targetId === 'vehicule') {
      fetchVehicles();
      fetchMembers();
    }
    if (targetId === 'dashboard') {
      refreshDashboard();
    }
    if (targetId === 'missions') {
      fetchMissions();
    }
    if (targetId === 'admin') {
      fetchAdminInviteCode();
      fetchAdminUsers();
      fetchLogs();
      fetchTransactions();
    }
  }
}

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.getAttribute('data-section');
    if (section) switchSection(section);
  });
});

// ===== MOBILE MENU =====
const menuToggle     = document.getElementById('menuToggle');
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay?.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay?.classList.remove('visible');
  document.body.style.overflow = '';
}

menuToggle?.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});

sidebarOverlay?.addEventListener('click', closeSidebar);

// ===== COMPTABILITÉ =====
// Cache local des transactions et filtre courant ('all' | 'entree' | 'sortie').
let transactions = [];
let activeFilter = 'all';

// Construit les en-têtes HTTP communs pour toutes les requêtes authentifiées :
// Content-Type JSON + JWT Bearer token issu de la session en cours.
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };
}

// Récupère toutes les transactions depuis l'API, met à jour le cache local,
// puis déclenche : rendu du tableau, calcul des stats et tableau des cotisations.
async function fetchTransactions() {
  try {
    const res  = await fetch(`${API}/transactions`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    transactions = data;
    renderTransactions();
    updateStats();
    renderCotisationsTable();
  } catch {
    console.error('Erreur chargement transactions.');
  }
}

// Formate un nombre en devise : préfixe "$" avec séparateur de milliers (locale fr-CA utilise l'espace).
// Ex : 1500 → "$1 500"
function formatAmount(n) {
  return '$' + Number(n).toLocaleString('fr-CA', { maximumFractionDigits: 0 });
}

// Formate une date ISO en "JJ/MM/AAAA HH:MM" lisible.
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Recalcule les totaux entrées/sorties/solde à partir du cache `transactions`
// et anime les cartes de statistiques. Le solde apparaît en rouge si négatif.
function updateStats() {
  const total_in  = transactions.filter(t => t.type === 'entree').reduce((s, t) => s + Number(t.amount), 0);
  const total_out = transactions.filter(t => t.type === 'sortie').reduce((s, t) => s + Number(t.amount), 0);
  const balance   = total_in - total_out;

  animateCounter(document.getElementById('statBalance'), balance, formatAmount);
  animateCounter(document.getElementById('statIncome'),  total_in,  formatAmount);
  animateCounter(document.getElementById('statExpense'), total_out, formatAmount);
  animateCounter(document.getElementById('statCount'),   transactions.length);

  // Feedback visuel : rouge si le solde est dans le négatif, vert accent sinon.
  document.getElementById('statBalance').style.color = balance < 0 ? '#e05c5c' : 'var(--accent)';
}

// Reconstruit le tableau des transactions : supprime les anciennes lignes `.data-row`
// (en conservant la ligne "vide") puis insère les nouvelles selon le filtre actif.
function renderTransactions() {
  const tbody    = document.getElementById('transactionsList');
  const emptyRow = document.getElementById('emptyTransactions');

  const filtered = activeFilter === 'all'
    ? transactions
    : transactions.filter(t => t.type === activeFilter);

  // Supprime uniquement les lignes de données, pas la ligne d'état vide.
  Array.from(tbody.querySelectorAll('tr.data-row')).forEach(r => r.remove());

  if (filtered.length === 0) {
    emptyRow.style.display = '';
    return;
  }
  emptyRow.style.display = 'none';

  filtered.forEach(t => {
    const tr = document.createElement('tr');
    tr.className  = 'data-row';
    tr.dataset.id = t.id;

    const badgeClass  = t.type === 'entree' ? 'badge-entree' : 'badge-sortie';
    const badgeLabel  = t.type === 'entree' ? '↑ Entrée' : '↓ Sortie';
    const amountClass = t.type === 'entree' ? 'amount-entree' : 'amount-sortie';
    const sign        = t.type === 'entree' ? '+' : '−';

    tr.innerHTML = `
      <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
      <td>${escapeHtml(t.member)}</td>
      <td class="td-motif" title="${escapeHtml(t.motif)}">${escapeHtml(t.motif)}</td>
      <td class="${amountClass}">${sign}${formatAmount(t.amount)}</td>
      <td class="td-date">${formatDate(t.created_at)}</td>
      <td><button class="btn-delete" data-id="${t.id}" title="Supprimer">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// Échappe les caractères HTML spéciaux pour prévenir les injections XSS
// lors de l'insertion de contenu utilisateur directement dans le DOM via innerHTML.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function refreshComptabilite() {
  fetchTransactions();
}

// Type toggle
document.getElementById('btnEntree')?.addEventListener('click', () => {
  document.getElementById('transactionType').value = 'entree';
  document.getElementById('btnEntree').classList.add('active');
  document.getElementById('btnSortie').classList.remove('active');
});

document.getElementById('btnSortie')?.addEventListener('click', () => {
  document.getElementById('transactionType').value = 'sortie';
  document.getElementById('btnSortie').classList.add('active');
  document.getElementById('btnEntree').classList.remove('active');
});

// Add transaction
document.getElementById('btnAddTransaction')?.addEventListener('click', async () => {
  if (!currentUser) return;

  const amountRaw = document.getElementById('transactionAmount').value;
  const motif     = document.getElementById('transactionMotif').value.trim();
  const type      = document.getElementById('transactionType').value;

  if (!amountRaw || parseInt(amountRaw) <= 0) return flashInput('transactionAmount', 'Montant invalide');
  if (!motif) return flashInput('transactionMotif', 'Motif requis');

  const btn = document.getElementById('btnAddTransaction');
  btn.disabled    = true;
  btn.textContent = 'Ajout...';

  try {
    const res  = await fetch(`${API}/transactions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ type, motif, amount: parseInt(amountRaw) }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Erreur.', 'error'); return; }

    transactions.unshift(data);
    updateStats();
    renderTransactions();
    showToast('Transaction ajoutée avec succès.');

    document.getElementById('transactionAmount').value = '';
    document.getElementById('transactionMotif').value  = '';
  } catch {
    showToast('Impossible de contacter le serveur.', 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Ajouter la transaction';
  }
});

// Signale visuellement une erreur de saisie : bordure rouge + message dans le placeholder.
// Se réinitialise automatiquement après 2 secondes.
function flashInput(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = '#e05c5c';
  el.placeholder = msg;
  el.focus();
  setTimeout(() => {
    el.style.borderColor = '';
    el.placeholder = id === 'transactionAmount' ? '0' : 'Raison de la transaction...';
  }, 2000);
}

// Delete transaction
document.getElementById('transactionsList')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-delete');
  if (!btn) return;
  const id = Number(btn.dataset.id);

  try {
    const res = await fetch(`${API}/transactions/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) return;
    transactions = transactions.filter(t => t.id !== id);
    updateStats();
    renderTransactions();
    showToast('Transaction supprimée.');
  } catch {
    showToast('Impossible de contacter le serveur.', 'error');
  }
});

// Filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderTransactions();
  });
});

// ===== ARMEMENT =====
// Caches locaux des armes et des membres, filtres actifs et id de l'arme en attente d'attribution.
let weapons      = [];
let members      = [];
let weaponFilter = 'all';   // 'all' | 'free' | 'assigned'
let weaponSearch = '';
let assignTarget = null;    // id de l'arme dont la modale d'attribution est ouverte

const CATEGORY_ICONS = {
  'Danseuse':           '💃',
  'Agent de sécurité':  '🛡️',
  'Barman/Barmaid':     '🍸',
  'DJ':                 '🎧',
  'Manager':            '💼',
  'Serveuse/Serveur':   '🥂',
};

async function fetchWeapons() {
  try {
    const res  = await fetch(`${API}/weapons`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    weapons = data;
    renderWeapons();
    updateWeaponStats();
  } catch { console.error('Erreur chargement armes.'); }
}

// Récupère la liste des membres et repeuple les deux selects d'attribution
// (armes et véhicules) qui dépendent de cette liste.
async function fetchMembers() {
  try {
    const res  = await fetch(`${API}/members`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    members = data;
    populateAssignSelect();
    populateVehicleAssignSelect();
  } catch { console.error('Erreur chargement membres.'); }
}

function updateWeaponStats() {
  const total    = weapons.length;
  const assigned = weapons.filter(w => w.assigned_to).length;
  animateCounter(document.getElementById('weaponStatTotal'),    total);
  animateCounter(document.getElementById('weaponStatAssigned'), assigned);
  animateCounter(document.getElementById('weaponStatFree'),     total - assigned);
}

// Retourne les armes correspondant au filtre actif (disponible / attribuée / toutes)
// ET à la recherche textuelle (portant sur le nom ou la catégorie).
function getFilteredWeapons() {
  return weapons.filter(w => {
    if (weaponFilter === 'free'     && w.assigned_to)  return false;
    if (weaponFilter === 'assigned' && !w.assigned_to) return false;
    if (weaponSearch) {
      const q = weaponSearch.toLowerCase();
      if (!w.name.toLowerCase().includes(q) && !w.category.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function renderWeapons() {
  const grid  = document.getElementById('weaponsGrid');
  const empty = document.getElementById('weaponsEmpty');
  const list  = getFilteredWeapons();

  // Remove old cards
  Array.from(grid.querySelectorAll('.weapon-card')).forEach(c => c.remove());

  if (list.length === 0) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  list.forEach(w => {
    const card = document.createElement('div');
    card.className  = `weapon-card ${w.assigned_to ? 'is-assigned' : 'is-free'}`;
    card.dataset.id = w.id;

    const icon     = CATEGORY_ICONS[w.category] || '🔧';
    // Génère les initiales du propriétaire depuis son nom RP (ex : "Jean Dupont" → "JD").
    const initials = w.assigned_to_name
      ? w.assigned_to_name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2)
      : '—';

    card.innerHTML = `
      <div class="weapon-card-top">
        <div class="weapon-card-category">${icon} ${escapeHtml(w.category)}</div>
        <div class="weapon-card-name">${escapeHtml(w.name)}</div>
        ${w.notes ? `<div class="weapon-card-notes">${escapeHtml(w.notes)}</div>` : ''}
      </div>
      <div class="weapon-card-divider"></div>
      <div class="weapon-card-bottom">
        <div class="weapon-assignee">
          <div class="weapon-assignee-avatar ${w.assigned_to ? 'assigned' : 'free'}">${initials}</div>
          <span class="weapon-assignee-name ${w.assigned_to ? 'assigned' : 'free'}">
            ${w.assigned_to ? escapeHtml(w.assigned_to_name) : 'Disponible'}
          </span>
        </div>
        <div class="weapon-card-actions">
          <button class="btn-assign" data-id="${w.id}" title="Attribuer">
            ${w.assigned_to ? '↩ Modifier' : '+ Attribuer'}
          </button>
          <button class="btn-delete" data-weapon-id="${w.id}" title="Supprimer">✕</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
  applyStagger(grid);
}

// Réinitialise et repeuple le <select> d'attribution des armes avec la liste
// des membres actuels. L'option vide permet de retirer une attribution existante.
function populateAssignSelect() {
  const sel = document.getElementById('assignSelect');
  sel.innerHTML = '<option value="">-- Aucun (retirer l\'attribution) --</option>';
  members.forEach(m => {
    const opt = document.createElement('option');
    opt.value       = m.id;
    opt.textContent = m.rp_name;
    sel.appendChild(opt);
  });
}

// Add weapon
document.getElementById('btnAddWeapon')?.addEventListener('click', async () => {
  if (!currentUser) return;
  const name     = document.getElementById('weaponName').value.trim();
  const category = document.getElementById('weaponCategory').value;
  const notes    = document.getElementById('weaponNotes').value.trim();

  if (!name)     return flashInput('weaponName',     'Nom requis');
  if (!category) return flashInput('weaponCategory', 'Catégorie requise');

  const btn = document.getElementById('btnAddWeapon');
  btn.disabled = true; btn.textContent = 'Ajout...';

  try {
    const res  = await fetch(`${API}/weapons`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({ name, category, notes }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Erreur.', 'error'); return; }
    weapons.unshift(data);
    updateWeaponStats();
    renderWeapons();
    document.getElementById('weaponName').value  = '';
    document.getElementById('weaponCategory').value = '';
    document.getElementById('weaponNotes').value = '';
  } catch { showToast('Impossible de contacter le serveur.', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Ajouter l\'employé'; }
});

// Click on grid (assign / delete)
document.getElementById('weaponsGrid')?.addEventListener('click', (e) => {
  const assignBtn = e.target.closest('.btn-assign');
  const deleteBtn = e.target.closest('[data-weapon-id]');

  if (assignBtn) {
    assignTarget = Number(assignBtn.dataset.id);
    const weapon = weapons.find(w => w.id === assignTarget);
    document.getElementById('assignModalTitle').textContent = `Affecter : ${weapon?.name}`;
    populateAssignSelect();
    const sel = document.getElementById('assignSelect');
    sel.value = weapon?.assigned_to ?? '';
    openModal('assignModal');
  }

  if (deleteBtn && !assignBtn) {
    const id = Number(deleteBtn.dataset.weaponId);
    deleteWeapon(id);
  }
});

async function deleteWeapon(id) {
  try {
    const res = await fetch(`${API}/weapons/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) return;
    weapons = weapons.filter(w => w.id !== id);
    updateWeaponStats();
    renderWeapons();
  } catch { showToast('Impossible de contacter le serveur.', 'error'); }
}

// Modal confirm assign
document.getElementById('btnConfirmAssign')?.addEventListener('click', async () => {
  if (assignTarget === null) return;
  const userId = document.getElementById('assignSelect').value || null;
  const parsed = userId ? parseInt(userId) : null;

  try {
    const res  = await fetch(`${API}/weapons/${assignTarget}/assign`, {
      method:  'PATCH',
      headers: authHeaders(),
      body:    JSON.stringify({ user_id: parsed }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Erreur.', 'error'); return; }
    const idx = weapons.findIndex(w => w.id === assignTarget);
    if (idx !== -1) weapons[idx] = data;
    updateWeaponStats();
    renderWeapons();
    closeModal('assignModal');
  } catch { showToast('Impossible de contacter le serveur.', 'error'); }
});

// Ouvre/ferme une modale par son id. closeModal remet également assignTarget à null
// pour éviter qu'une ancienne cible ne soit réutilisée par erreur.
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  assignTarget = null;
}

document.getElementById('assignModalClose')?.addEventListener('click',  () => closeModal('assignModal'));
document.getElementById('assignModalCancel')?.addEventListener('click', () => closeModal('assignModal'));
document.getElementById('assignModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('assignModal')) closeModal('assignModal');
});

// Filters
document.querySelectorAll('[data-wfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-wfilter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    weaponFilter = btn.dataset.wfilter;
    renderWeapons();
  });
});

// Search
document.getElementById('weaponSearch')?.addEventListener('input', (e) => {
  weaponSearch = e.target.value.trim();
  renderWeapons();
});

// ===== GROUPES =====
// Cache local des groupes et terme de recherche en cours.
let groups      = [];
let groupSearch = '';

// Récupère les groupes, les affiche dans la grille et met à jour les polygones sur la carte
// (les zones assignées aux groupes sont dessinées via refreshMapOverlays).
async function fetchGroups() {
  try {
    const res  = await fetch(`${API}/groups`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    groups = data;
    renderGroups();
    refreshMapOverlays();
  } catch { console.error('Erreur chargement groupes.'); }
}

function getFilteredGroups() {
  if (!groupSearch) return groups;
  const q = groupSearch.toLowerCase();
  return groups.filter(g =>
    g.name.toLowerCase().includes(q) ||
    (g.residence  && g.residence.toLowerCase().includes(q)) ||
    (g.territory  && g.territory.toLowerCase().includes(q))
  );
}

function renderGroups() {
  const grid  = document.getElementById('groupsGrid');
  const empty = document.getElementById('groupsEmpty');
  const list  = getFilteredGroups();

  Array.from(grid.querySelectorAll('.group-card')).forEach(c => c.remove());

  if (list.length === 0) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  list.forEach(g => {
    const card = document.createElement('div');
    card.className  = 'group-card';
    card.dataset.id = g.id;

    const updatedDate = new Date(g.updated_at).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    const field = (label, value) => `
      <div class="group-field">
        <span class="group-field-label">${label}</span>
        <span class="group-field-value ${value ? '' : 'empty'}">${escapeHtml(value || 'Non renseigné')}</span>
      </div>`;

    card.innerHTML = `
      <div class="group-card-header">
        <span class="group-card-name">
          ${escapeHtml(g.name)}
        </span>
        <div class="group-card-actions">
          <button class="btn-edit"  data-group-edit="${g.id}">✏️ Modifier</button>
          <button class="btn-delete" data-group-del="${g.id}">✕</button>
        </div>
      </div>
      <div class="group-card-body">
        ${field('📍 Lieu de résidence',   g.residence)}
        ${field('🗺️ Territoire contrôlé', g.territory)}
        ${field('📞 Téléphone',           g.phone)}
        ${field('💼 Business possédé',    g.business)}
        ${field('🏢 Entreprise possédée', g.company)}
      </div>
      ${g.notes ? `
      <div class="group-card-notes">
        <span class="group-field-label">📝 Informations complémentaires</span>
        <div class="group-notes-text">${escapeHtml(g.notes)}</div>
      </div>` : ''}
      <div class="group-card-footer">
        <span>Créé par ${escapeHtml(g.created_by_name || '—')}</span>
        <span>Mis à jour le ${updatedDate} par ${escapeHtml(g.updated_by_name || '—')}</span>
      </div>
    `;
    grid.appendChild(card);
  });
  applyStagger(grid);
}

// Ouvrir modal en mode ajout
document.getElementById('btnOpenAddGroup')?.addEventListener('click', () => {
  openGroupModal(null);
});

// Ouvrir modal en mode édition ou supprimer via la grille
document.getElementById('groupsGrid')?.addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-group-edit]');
  const delBtn  = e.target.closest('[data-group-del]');

  if (editBtn) {
    const id    = Number(editBtn.dataset.groupEdit);
    const group = groups.find(g => g.id === id);
    if (group) openGroupModal(group);
  }
  if (delBtn) {
    const id = Number(delBtn.dataset.groupDel);
    deleteGroup(id);
  }
});

// Génère les chips cliquables de sélection de zones dans la modale groupe.
// Les zones déjà assignées au groupe sont pré-sélectionnées (classe CSS "selected").
function buildZoneSelector(selectedIds = []) {
  const container = document.getElementById('zoneSelector');
  if (!container) return;
  container.innerHTML = '';
  GTA_ZONES.forEach(zone => {
    const chip = document.createElement('span');
    chip.className   = 'zone-chip' + (selectedIds.includes(zone.id) ? ' selected' : '');
    chip.textContent = zone.name;
    chip.dataset.zid = zone.id;
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
    container.appendChild(chip);
  });
}

// Lit les chips sélectionnées et retourne leurs ids sous forme de chaîne CSV
// (ex : "paleto_bay,davis") pour stockage en base de données.
function getSelectedZoneIds() {
  return Array.from(document.querySelectorAll('#zoneSelector .zone-chip.selected'))
    .map(c => c.dataset.zid).join(',');
}

function openGroupModal(group) {
  document.getElementById('groupModalTitle').textContent = group ? `Modifier : ${group.name}` : 'Nouveau groupe';
  document.getElementById('groupEditId').value    = group?.id ?? '';
  document.getElementById('groupName').value      = group?.name      ?? '';
  document.getElementById('groupResidence').value = group?.residence ?? '';
  document.getElementById('groupTerritory').value = group?.territory ?? '';
  document.getElementById('groupPhone').value     = group?.phone     ?? '';
  document.getElementById('groupBusiness').value  = group?.business  ?? '';
  document.getElementById('groupCompany').value   = group?.company   ?? '';
  document.getElementById('groupNotes').value     = group?.notes     ?? '';

  const color = group?.color || '#4caf82';
  document.getElementById('groupColor').value           = color;
  document.getElementById('groupColorLabel').textContent = color;

  const selectedZones = group?.zone_ids ? group.zone_ids.split(',').filter(Boolean) : [];
  buildZoneSelector(selectedZones);

  document.getElementById('groupError').textContent = '';
  openModal('groupModal');
}

document.getElementById('groupColor')?.addEventListener('input', (e) => {
  document.getElementById('groupColorLabel').textContent = e.target.value;
});

// Sauvegarder groupe
document.getElementById('btnSaveGroup')?.addEventListener('click', async () => {
  const id        = document.getElementById('groupEditId').value;
  const name      = document.getElementById('groupName').value.trim();
  const residence = document.getElementById('groupResidence').value.trim();
  const territory = document.getElementById('groupTerritory').value.trim();
  const phone     = document.getElementById('groupPhone').value.trim();
  const business  = document.getElementById('groupBusiness').value.trim();
  const company   = document.getElementById('groupCompany').value.trim();
  const notes     = document.getElementById('groupNotes').value.trim();

  if (!name) {
    document.getElementById('groupError').textContent = 'Le nom du groupe est requis.';
    return;
  }

  const color    = document.getElementById('groupColor').value;
  const zone_ids = getSelectedZoneIds();
  const body = { name, residence, territory, phone, business, company, notes, color, zone_ids };
  const isEdit  = id !== '';
  const url     = isEdit ? `${API}/groups/${id}` : `${API}/groups`;
  const method  = isEdit ? 'PUT' : 'POST';

  const btn = document.getElementById('btnSaveGroup');
  btn.disabled = true; btn.textContent = 'Enregistrement...';

  try {
    const res  = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('groupError').textContent = data.error || 'Erreur.';
      return;
    }
    if (isEdit) {
      const idx = groups.findIndex(g => g.id === Number(id));
      if (idx !== -1) groups[idx] = data;
    } else {
      groups.unshift(data);
    }
    renderGroups();
    refreshMapOverlays();
    closeModal('groupModal');
    showToast(isEdit ? 'Contact modifié.' : 'Contact créé.');
  } catch {
    document.getElementById('groupError').textContent = 'Impossible de contacter le serveur.';
  } finally {
    btn.disabled = false; btn.textContent = 'Enregistrer';
  }
});

async function deleteGroup(id) {
  try {
    const res = await fetch(`${API}/groups/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) return;
    groups = groups.filter(g => g.id !== id);
    renderGroups();
    refreshMapOverlays();
  } catch { showToast('Impossible de contacter le serveur.', 'error'); }
}

// Fermeture modal groupe
document.getElementById('groupModalClose')?.addEventListener('click',  () => closeModal('groupModal'));
document.getElementById('groupModalCancel')?.addEventListener('click', () => closeModal('groupModal'));
document.getElementById('groupModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('groupModal')) closeModal('groupModal');
});

// Recherche groupes
document.getElementById('groupSearch')?.addEventListener('input', (e) => {
  groupSearch = e.target.value.trim();
  renderGroups();
});

// ===== RÉSUMÉ TABLES =====
// Cache local des résumés (comptes-rendus de réunion) et terme de recherche.
let summaries     = [];
let summarySearch = '';

async function fetchSummaries() {
  try {
    const res  = await fetch(`${API}/summaries`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    summaries = data;
    renderSummaries();
  } catch { console.error('Erreur chargement résumés.'); }
}

// Convertit une date ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:...) en format lisible JJ/MM/AAAA.
// On tronque à 10 caractères pour ignorer l'heure si elle est présente.
function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const clean = dateStr.substring(0, 10);
  const [y, m, d] = clean.split('-');
  return `${d}/${m}/${y}`;
}

function formatPostedDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getFilteredSummaries() {
  if (!summarySearch) return summaries;
  const q = summarySearch.toLowerCase();
  return summaries.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.content.toLowerCase().includes(q)
  );
}

function renderSummaries() {
  const timeline = document.getElementById('summaryTimeline');
  const empty    = document.getElementById('summaryEmpty');
  const list     = getFilteredSummaries();

  Array.from(timeline.querySelectorAll('.timeline-entry')).forEach(e => e.remove());

  if (list.length === 0) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  list.forEach(s => {
    const entry = document.createElement('div');
    entry.className  = 'timeline-entry';
    entry.dataset.id = s.id;

    const isOwn = currentUser && s.created_by === currentUser.id;

    entry.innerHTML = `
      <div class="timeline-block">
        <div class="timeline-block-header">
          <div class="timeline-block-meta">
            <span class="timeline-block-title">${escapeHtml(s.title)}</span>
            <span class="timeline-block-date">📅 ${formatEventDate(s.event_date)}</span>
          </div>
          ${isOwn ? `
          <div class="timeline-block-actions">
            <button class="btn-edit" data-summary-edit="${s.id}">✏️ Modifier</button>
            <button class="btn-delete" data-summary-del="${s.id}">✕</button>
          </div>` : ''}
        </div>
        <div class="timeline-block-content">${escapeHtml(s.content)}</div>
        <div class="timeline-block-footer">
          <span>Publié par <strong>${escapeHtml(s.created_by_name || '—')}</strong></span>
          <span>Le ${formatPostedDate(s.created_at)}</span>
        </div>
      </div>
    `;
    timeline.appendChild(entry);
  });
}

// Pré-remplit la date du formulaire de résumé avec la date du jour (format YYYY-MM-DD)
// uniquement si le champ est encore vide (évite d'écraser une saisie en cours).
function initSummaryDate() {
  const input = document.getElementById('summaryDate');
  if (input && !input.value) {
    input.value = new Date().toISOString().split('T')[0];
  }
}

// Ajouter un résumé
document.getElementById('btnAddSummary')?.addEventListener('click', async () => {
  if (!currentUser) return;

  const title      = document.getElementById('summaryTitle').value.trim();
  const event_date = document.getElementById('summaryDate').value;
  const content    = document.getElementById('summaryContent').value.trim();
  const errorEl    = document.getElementById('summaryFormError');

  errorEl.textContent = '';
  if (!title)      { errorEl.textContent = 'Le titre est requis.';   return; }
  if (!event_date) { errorEl.textContent = 'La date est requise.';   return; }
  if (!content)    { errorEl.textContent = 'Le contenu est requis.'; return; }

  const btn = document.getElementById('btnAddSummary');
  btn.disabled = true; btn.textContent = 'Publication...';

  try {
    const res  = await fetch(`${API}/summaries`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title, content, event_date }),
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'Erreur.'; return; }

    summaries.unshift(data);
    summaries.sort((a, b) => b.event_date.localeCompare(a.event_date));
    renderSummaries();

    document.getElementById('summaryTitle').value   = '';
    document.getElementById('summaryContent').value = '';
    document.getElementById('summaryDate').value    = new Date().toISOString().split('T')[0];
  } catch {
    errorEl.textContent = 'Impossible de contacter le serveur.';
  } finally {
    btn.disabled = false; btn.textContent = 'Publier le compte-rendu';
  }
});

// Clic sur la timeline (edit / delete)
document.getElementById('summaryTimeline')?.addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-summary-edit]');
  const delBtn  = e.target.closest('[data-summary-del]');

  if (editBtn) {
    const id      = Number(editBtn.dataset.summaryEdit);
    const summary = summaries.find(s => s.id === id);
    if (summary) openSummaryModal(summary);
  }
  if (delBtn) {
    const id = Number(delBtn.dataset.summaryDel);
    deleteSummary(id);
  }
});

function openSummaryModal(s) {
  document.getElementById('summaryEditId').value      = s.id;
  document.getElementById('summaryEditTitle').value   = s.title;
  document.getElementById('summaryEditDate').value    = s.event_date;
  document.getElementById('summaryEditContent').value = s.content;
  document.getElementById('summaryEditError').textContent = '';
  openModal('summaryModal');
}

document.getElementById('btnSaveSummary')?.addEventListener('click', async () => {
  const id         = document.getElementById('summaryEditId').value;
  const title      = document.getElementById('summaryEditTitle').value.trim();
  const event_date = document.getElementById('summaryEditDate').value;
  const content    = document.getElementById('summaryEditContent').value.trim();
  const errorEl    = document.getElementById('summaryEditError');

  errorEl.textContent = '';
  if (!title)      { errorEl.textContent = 'Le titre est requis.';   return; }
  if (!event_date) { errorEl.textContent = 'La date est requise.';   return; }
  if (!content)    { errorEl.textContent = 'Le contenu est requis.'; return; }

  const btn = document.getElementById('btnSaveSummary');
  btn.disabled = true; btn.textContent = 'Enregistrement...';

  try {
    const res  = await fetch(`${API}/summaries/${id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ title, content, event_date }),
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'Erreur.'; return; }

    const idx = summaries.findIndex(s => s.id === Number(id));
    if (idx !== -1) summaries[idx] = data;
    summaries.sort((a, b) => b.event_date.localeCompare(a.event_date));
    renderSummaries();
    closeModal('summaryModal');
  } catch {
    errorEl.textContent = 'Impossible de contacter le serveur.';
  } finally {
    btn.disabled = false; btn.textContent = 'Enregistrer';
  }
});

async function deleteSummary(id) {
  try {
    const res = await fetch(`${API}/summaries/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) return;
    summaries = summaries.filter(s => s.id !== id);
    renderSummaries();
  } catch { showToast('Impossible de contacter le serveur.', 'error'); }
}

// Fermeture modal résumé
document.getElementById('summaryModalClose')?.addEventListener('click',  () => closeModal('summaryModal'));
document.getElementById('summaryModalCancel')?.addEventListener('click', () => closeModal('summaryModal'));
document.getElementById('summaryModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('summaryModal')) closeModal('summaryModal');
});

// Recherche résumés
document.getElementById('summarySearch')?.addEventListener('input', (e) => {
  summarySearch = e.target.value.trim();
  renderSummaries();
});

// ===== VÉHICULES =====
// Cache local des véhicules, filtres actifs et id du véhicule en attente d'attribution.
// Le module véhicule est calqué sur le même pattern que l'armement.
let vehicles       = [];
let vehicleFilter  = 'all';   // 'all' | 'free' | 'assigned'
let vehicleSearch  = '';
let vehicleAssignTarget = null;   // id du véhicule dont la modale d'attribution est ouverte

const VEHICLE_ICONS = {
  'Voiture': '🚗',
  '4X4':     '🚙',
  'Moto':    '🏍️',
};

async function fetchVehicles() {
  try {
    const res  = await fetch(`${API}/vehicles`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    vehicles = data;
    renderVehicles();
    updateVehicleStats();
  } catch { console.error('Erreur chargement véhicules.'); }
}

function updateVehicleStats() {
  const total    = vehicles.length;
  const assigned = vehicles.filter(v => v.assigned_to).length;
  animateCounter(document.getElementById('vehicleStatTotal'),    total);
  animateCounter(document.getElementById('vehicleStatAssigned'), assigned);
  animateCounter(document.getElementById('vehicleStatFree'),     total - assigned);
}

function getFilteredVehicles() {
  return vehicles.filter(v => {
    if (vehicleFilter === 'free'     && v.assigned_to)  return false;
    if (vehicleFilter === 'assigned' && !v.assigned_to) return false;
    if (vehicleSearch) {
      const q = vehicleSearch.toLowerCase();
      if (!v.name.toLowerCase().includes(q) && !v.category.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function renderVehicles() {
  const grid  = document.getElementById('vehiclesGrid');
  const empty = document.getElementById('vehiclesEmpty');
  const list  = getFilteredVehicles();

  Array.from(grid.querySelectorAll('.weapon-card')).forEach(c => c.remove());

  if (list.length === 0) { empty.style.display = ''; return; }
  empty.style.display = 'none';

  list.forEach(v => {
    const card = document.createElement('div');
    card.className  = `weapon-card ${v.assigned_to ? 'is-assigned' : 'is-free'}`;
    card.dataset.id = v.id;

    const icon     = VEHICLE_ICONS[v.category] || '🚗';
    const initials = v.assigned_to_name
      ? v.assigned_to_name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2)
      : '—';

    card.innerHTML = `
      <div class="weapon-card-top">
        <div class="weapon-card-category">${icon} ${escapeHtml(v.category)}</div>
        <div class="weapon-card-name">${escapeHtml(v.name)}</div>
        ${v.notes ? `<div class="weapon-card-notes">${escapeHtml(v.notes)}</div>` : ''}
      </div>
      <div class="weapon-card-divider"></div>
      <div class="weapon-card-bottom">
        <div class="weapon-assignee">
          <div class="weapon-assignee-avatar ${v.assigned_to ? 'assigned' : 'free'}">${initials}</div>
          <span class="weapon-assignee-name ${v.assigned_to ? 'assigned' : 'free'}">
            ${v.assigned_to ? escapeHtml(v.assigned_to_name) : 'Disponible'}
          </span>
        </div>
        <div class="weapon-card-actions">
          <button class="btn-assign" data-vid="${v.id}">
            ${v.assigned_to ? '↩ Modifier' : '+ Attribuer'}
          </button>
          <button class="btn-delete" data-vehicle-del="${v.id}">✕</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function populateVehicleAssignSelect() {
  const sel = document.getElementById('vehicleAssignSelect');
  sel.innerHTML = '<option value="">-- Aucun (retirer l\'attribution) --</option>';
  members.forEach(m => {
    const opt = document.createElement('option');
    opt.value       = m.id;
    opt.textContent = m.rp_name;
    sel.appendChild(opt);
  });
}

// Clic sur la grille véhicules
document.getElementById('vehiclesGrid')?.addEventListener('click', (e) => {
  const assignBtn = e.target.closest('[data-vid]');
  const deleteBtn = e.target.closest('[data-vehicle-del]');

  if (assignBtn) {
    vehicleAssignTarget = Number(assignBtn.dataset.vid);
    const vehicle = vehicles.find(v => v.id === vehicleAssignTarget);
    document.getElementById('vehicleAssignModalTitle').textContent = `Attribuer : ${vehicle?.name}`;
    populateVehicleAssignSelect();
    const sel = document.getElementById('vehicleAssignSelect');
    sel.value = vehicle?.assigned_to ?? '';
    openModal('vehicleAssignModal');
  }

  if (deleteBtn && !assignBtn) {
    const id = Number(deleteBtn.dataset.vehicleDel);
    deleteVehicle(id);
  }
});

// Ajouter véhicule
document.getElementById('btnAddVehicle')?.addEventListener('click', async () => {
  if (!currentUser) return;
  const name     = document.getElementById('vehicleName').value.trim();
  const category = document.getElementById('vehicleCategory').value;
  const notes    = document.getElementById('vehicleNotes').value.trim();

  if (!name)     return flashInput('vehicleName',     'Nom requis');
  if (!category) return flashInput('vehicleCategory', 'Catégorie requise');

  const btn = document.getElementById('btnAddVehicle');
  btn.disabled = true; btn.textContent = 'Ajout...';

  try {
    const res  = await fetch(`${API}/vehicles`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name, category, notes }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Erreur.', 'error'); return; }
    vehicles.unshift(data);
    updateVehicleStats();
    renderVehicles();
    document.getElementById('vehicleName').value     = '';
    document.getElementById('vehicleCategory').value = '';
    document.getElementById('vehicleNotes').value    = '';
  } catch { showToast('Impossible de contacter le serveur.', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Ajouter le véhicule'; }
});

// Confirmer attribution véhicule
document.getElementById('btnConfirmVehicleAssign')?.addEventListener('click', async () => {
  if (vehicleAssignTarget === null) return;
  const userId = document.getElementById('vehicleAssignSelect').value || null;
  const parsed = userId ? parseInt(userId) : null;

  try {
    const res  = await fetch(`${API}/vehicles/${vehicleAssignTarget}/assign`, {
      method: 'PATCH', headers: authHeaders(),
      body: JSON.stringify({ user_id: parsed }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Erreur.', 'error'); return; }
    const idx = vehicles.findIndex(v => v.id === vehicleAssignTarget);
    if (idx !== -1) vehicles[idx] = data;
    updateVehicleStats();
    renderVehicles();
    closeModal('vehicleAssignModal');
  } catch { showToast('Impossible de contacter le serveur.', 'error'); }
});

async function deleteVehicle(id) {
  try {
    const res = await fetch(`${API}/vehicles/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) return;
    vehicles = vehicles.filter(v => v.id !== id);
    updateVehicleStats();
    renderVehicles();
  } catch { showToast('Impossible de contacter le serveur.', 'error'); }
}

// Fermeture modal attribution véhicule
document.getElementById('vehicleAssignModalClose')?.addEventListener('click',  () => closeModal('vehicleAssignModal'));
document.getElementById('vehicleAssignCancel')?.addEventListener('click',      () => closeModal('vehicleAssignModal'));
document.getElementById('vehicleAssignModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('vehicleAssignModal')) closeModal('vehicleAssignModal');
});

// Filtres véhicules
document.querySelectorAll('[data-vfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-vfilter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    vehicleFilter = btn.dataset.vfilter;
    renderVehicles();
  });
});

// Recherche véhicules
document.getElementById('vehicleSearch')?.addEventListener('input', (e) => {
  vehicleSearch = e.target.value.trim();
  renderVehicles();
});

// ===== ADMIN =====

// Récupère et affiche le code d'inscription du jour dans la section admin.
async function fetchAdminInviteCode() {
  const codeEl   = document.getElementById('adminInviteCode');
  const expireEl = document.getElementById('adminInviteExpire');
  if (!codeEl) return;
  codeEl.textContent = '…';
  try {
    const res  = await fetch(`${API}/admin/register-code`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { codeEl.textContent = 'Erreur'; return; }
    codeEl.textContent = data.code;

    // Calcul du temps restant avant expiration (minuit UTC)
    const now     = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const diffMs  = midnight - now;
    const hh      = Math.floor(diffMs / 3600000);
    const mm      = Math.floor((diffMs % 3600000) / 60000);
    if (expireEl) expireEl.textContent = `Expire dans ${hh}h ${mm}min (minuit UTC)`;
  } catch {
    codeEl.textContent = 'Erreur serveur';
  }
}

document.getElementById('btnRefreshInviteCode')?.addEventListener('click', fetchAdminInviteCode);

document.getElementById('btnCopyInviteCode')?.addEventListener('click', () => {
  const code = document.getElementById('adminInviteCode')?.textContent;
  if (!code || code === '…' || code === '——————') return;
  navigator.clipboard.writeText(code).then(() => showToast('Code copié !', 'success'));
});

// Cache local des utilisateurs pour la vue admin.
let adminUsers = [];

// Charge la liste complète des membres depuis l'endpoint admin (accès restreint aux admins).
// Affiche un état de chargement pendant la requête.
async function fetchAdminUsers() {
  const tbody = document.getElementById('adminUsersTbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">Chargement...</td></tr>';
  try {
    const res  = await fetch(`${API}/admin/users`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { tbody.innerHTML = `<tr><td colspan="5" class="admin-empty">${data.error}</td></tr>`; return; }
    adminUsers = data;
    renderAdminUsers();
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">Impossible de contacter le serveur.</td></tr>';
  }
}

function renderAdminUsers() {
  const tbody = document.getElementById('adminUsersTbody');
  if (!tbody) return;
  if (adminUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">Aucun membre enregistré.</td></tr>';
    return;
  }
  tbody.innerHTML = adminUsers.map(u => `
    <tr>
      <td><span class="admin-username">${escapeHtml(u.username)}</span></td>
      <td>${escapeHtml(u.rp_name)}</td>
      <td>
        <span class="badge ${u.is_admin ? 'badge-admin' : 'badge-member'}">
          ${u.is_admin ? '🛡️ Admin' : '👤 Membre'}
        </span>
      </td>
      <td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
      <td class="admin-actions">
        <button class="btn-edit" data-reset-id="${u.id}" data-reset-name="${escapeHtml(u.username)}">🔑 Réinitialiser mdp</button>
        ${u.id !== currentUser?.id ? `
          <button class="btn-edit" data-toggle-admin="${u.id}">${u.is_admin ? '⬇ Rétrograder' : '⬆ Promouvoir'}</button>
          <button class="btn-delete" data-admin-del="${u.id}">✕</button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

document.getElementById('adminUsersTbody')?.addEventListener('click', async (e) => {
  // Reset mot de passe
  const resetBtn = e.target.closest('[data-reset-id]');
  if (resetBtn) {
    document.getElementById('resetPwdUserId').value = resetBtn.dataset.resetId;
    document.getElementById('resetPwdTitle').textContent = `Réinitialiser : ${resetBtn.dataset.resetName}`;
    document.getElementById('resetPwdInput').value = '';
    document.getElementById('resetPwdError').textContent = '';
    openModal('resetPwdModal');
    return;
  }
  // Toggle admin
  const toggleBtn = e.target.closest('[data-toggle-admin]');
  if (toggleBtn) {
    const id = toggleBtn.dataset.toggleAdmin;
    try {
      const res = await fetch(`${API}/admin/users/${id}/toggle-admin`, { method: 'PATCH', headers: authHeaders() });
      if (res.ok) fetchAdminUsers();
    } catch {}
    return;
  }
  // Supprimer
  const delBtn = e.target.closest('[data-admin-del]');
  if (delBtn) {
    const userId = delBtn.dataset.adminDel;
    confirmAction('Supprimer ce membre définitivement ? Cette action est irréversible.', async () => {
      try {
        const res = await fetch(`${API}/admin/users/${userId}`, { method: 'DELETE', headers: authHeaders() });
        if (res.ok) { fetchAdminUsers(); showToast('Membre supprimé.', 'success'); }
        else showToast('Erreur lors de la suppression.', 'error');
      } catch { showToast('Impossible de contacter le serveur.', 'error'); }
    });
  }
});

// Confirmer reset mot de passe
document.getElementById('btnConfirmResetPwd')?.addEventListener('click', async () => {
  const id  = document.getElementById('resetPwdUserId').value;
  const pwd = document.getElementById('resetPwdInput').value.trim();
  const err = document.getElementById('resetPwdError');
  err.textContent = '';
  if (!pwd) { err.textContent = 'Entrez un nouveau mot de passe.'; return; }
  try {
    const res  = await fetch(`${API}/admin/users/${id}/reset-password`, {
      method: 'PATCH', headers: authHeaders(),
      body: JSON.stringify({ newPassword: pwd }),
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error; return; }
    closeModal('resetPwdModal');
  } catch { err.textContent = 'Impossible de contacter le serveur.'; }
});

document.getElementById('resetPwdClose')?.addEventListener('click',  () => closeModal('resetPwdModal'));
document.getElementById('resetPwdCancel')?.addEventListener('click', () => closeModal('resetPwdModal'));
document.getElementById('resetPwdModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('resetPwdModal')) closeModal('resetPwdModal');
});

// ===== HISTORIQUE DES MODIFICATIONS =====
// Cache local des entrées d'audit et filtre actif par type d'entité.
let auditLogs   = [];
let logFilter   = 'all';   // 'all' | 'Groupe' | 'Mission' | 'Résumé' | 'Arme' | 'Véhicule' | 'Transaction'

// Charge l'historique complet des modifications effectuées par les membres.
async function fetchLogs() {
  const tbody = document.getElementById('logsTbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Chargement...</td></tr>';
  try {
    const res  = await fetch(`${API}/logs`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">${data.error}</td></tr>`; return; }
    auditLogs = data;
    renderLogs();
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Impossible de contacter le serveur.</td></tr>';
  }
}

function renderLogs() {
  const tbody = document.getElementById('logsTbody');
  if (!tbody) return;
  const list = logFilter === 'all' ? auditLogs : auditLogs.filter(l => l.entity_type === logFilter);
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Aucune entrée.</td></tr>';
    return;
  }
  const actionKey = (a) => a.replace(/\s+/g, '-');
  tbody.innerHTML = list.map(l => `
    <tr>
      <td class="td-date">${new Date(l.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' })} ${new Date(l.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}</td>
      <td>${escapeHtml(l.user_rp_name || '—')}</td>
      <td><span class="log-action-badge log-action-${escapeHtml(actionKey(l.action))}">${escapeHtml(l.action)}</span></td>
      <td>${escapeHtml(l.entity_type)}</td>
      <td>${escapeHtml(l.entity_name || '—')}</td>
      <td style="color:var(--text-2);font-size:.85rem">${escapeHtml(l.details || '')}</td>
    </tr>`).join('');
}

// Filtres logs
document.querySelectorAll('[data-lfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-lfilter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    logFilter = btn.dataset.lfilter;
    renderLogs();
  });
});

document.getElementById('btnRefreshLogs')?.addEventListener('click', fetchLogs);

// ===== COTISATIONS PAR MEMBRE ET PAR SEMAINE =====
// Filtre courant : 'entree' (cotisations uniquement) ou 'all' (toutes transactions).
let cotisationsFilter = 'entree';

// Calcule la clé ISO 8601 de la semaine (ex : "2025-W03") à partir d'une date ISO.
// Algorithme : trouve le jeudi de la semaine courante (ref ISO), puis en déduit le numéro.
// Cela garantit que le jour 1 de la semaine 1 est toujours un lundi.
function getISOWeekKey(dateStr) {
  const d    = new Date(dateStr);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // getUTCDay() retourne 0 pour dimanche, on le remplace par 7 pour l'ISO (lundi=1, dimanche=7)
  const dayNum = date.getUTCDay() || 7;
  // Recale la date au jeudi de la même semaine ISO
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum   = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Transforme la clé ISO (ex : "2025-W03") en label lisible (ex : "S03 · 2025").
function formatWeekLabel(weekKey) {
  const [year, wPart] = weekKey.split('-W');
  return `S${wPart} · ${year}`;
}

// Construit un tableau croisé dynamique (pivot) : lignes = membres, colonnes = 12 dernières semaines.
// Chaque cellule contient la somme des montants pour ce membre cette semaine.
// Une ligne de totaux par colonne et un grand total général sont ajoutés en pied de tableau.
function renderCotisationsTable() {
  const wrap = document.getElementById('cotisationsTableWrap');
  if (!wrap) return;

  const list = cotisationsFilter === 'entree'
    ? transactions.filter(t => t.type === 'entree')
    : transactions;

  if (list.length === 0) {
    wrap.innerHTML = '<p class="admin-empty">Aucune transaction à afficher.</p>';
    return;
  }

  // pivot[membre][semaine] = montant cumulé
  const pivot   = {};
  const weeksSet = new Set();

  list.forEach(t => {
    const wk = getISOWeekKey(t.created_at);
    weeksSet.add(wk);
    if (!pivot[t.member]) pivot[t.member] = {};
    pivot[t.member][wk] = (pivot[t.member][wk] || 0) + Number(t.amount);
  });

  const weeks   = [...weeksSet].sort((a, b) => b.localeCompare(a)).slice(0, 12);
  const members = Object.keys(pivot).sort();

  let html = `<div class="cotisations-scroll"><table class="admin-table cotisations-table">
    <thead><tr>
      <th class="coti-th-member">Membre</th>
      ${weeks.map(wk => `<th class="coti-th-week">${escapeHtml(formatWeekLabel(wk))}</th>`).join('')}
      <th class="coti-th-total">Total</th>
    </tr></thead>
    <tbody>`;

  members.forEach(member => {
    const rowTotal = weeks.reduce((sum, wk) => sum + (pivot[member][wk] || 0), 0);
    html += `<tr>
      <td class="coti-member">${escapeHtml(member)}</td>
      ${weeks.map(wk => {
        const val = pivot[member][wk];
        return val
          ? `<td class="coti-cell coti-has">${formatAmount(val)}</td>`
          : `<td class="coti-cell coti-empty">—</td>`;
      }).join('')}
      <td class="coti-cell coti-row-total">${formatAmount(rowTotal)}</td>
    </tr>`;
  });

  const grandTotal = list.reduce((s, t) => s + Number(t.amount), 0);
  html += `<tr class="coti-footer-row">
    <td class="coti-member"><strong>Total</strong></td>
    ${weeks.map(wk => {
      const wkTotal = members.reduce((sum, m) => sum + (pivot[m][wk] || 0), 0);
      return `<td class="coti-cell coti-row-total">${wkTotal > 0 ? formatAmount(wkTotal) : '—'}</td>`;
    }).join('')}
    <td class="coti-cell coti-grand-total">${formatAmount(grandTotal)}</td>
  </tr>`;

  html += '</tbody></table></div>';
  wrap.innerHTML = html;
}

document.querySelectorAll('[data-cfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-cfilter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    cotisationsFilter = btn.dataset.cfilter;
    renderCotisationsTable();
  });
});

document.getElementById('btnRefreshCotisations')?.addEventListener('click', fetchTransactions);

// ===== DASHBOARD =====
// Charge toutes les données nécessaires au dashboard en parallèle (Promise.all)
// pour minimiser la latence totale, puis met à jour chaque widget indépendamment.
async function refreshDashboard() {
  try {
    // Toutes les requêtes sont lancées simultanément plutôt que séquentiellement.
    const [txRes, wRes, gRes, mRes, missRes] = await Promise.all([
      fetch(`${API}/transactions`,  { headers: authHeaders() }),
      fetch(`${API}/weapons`,       { headers: authHeaders() }),
      fetch(`${API}/groups`,        { headers: authHeaders() }),
      fetch(`${API}/members`,       { headers: authHeaders() }),
      fetch(`${API}/missions`,      { headers: authHeaders() }),
    ]);
    const [txData, wData, gData, mData, missData] = await Promise.all([
      txRes.json(), wRes.json(), gRes.json(), mRes.json(), missRes.json(),
    ]);

    const balance  = txData.reduce((s, t) => s + (t.type === 'entree' ? t.amount : -t.amount), 0);
    const missions = missData.filter ? missData.filter(m => m.status === 'en_cours') : [];

    animateCounter(document.getElementById('dashBalance'),  balance, formatAmount);
    animateCounter(document.getElementById('dashWeapons'),  Array.isArray(wData) ? wData.length : 0);
    animateCounter(document.getElementById('dashGroups'),   Array.isArray(gData) ? gData.length : 0);
    animateCounter(document.getElementById('dashMembers'),  Array.isArray(mData) ? mData.length : 0);
    animateCounter(document.getElementById('dashMissions'), missions.length);

    // Dernières transactions
    const txEl = document.getElementById('dashRecentTx');
    if (txEl) {
      const recent = txData.slice(0, 6);
      txEl.innerHTML = recent.length ? recent.map(t => `
        <div class="dash-list-item">
          <span class="dash-list-badge ${t.type === 'entree' ? 'badge-income' : 'badge-expense'}">
            ${t.type === 'entree' ? '+' : '-'}${formatAmount(t.amount)}
          </span>
          <span class="dash-list-label">${escapeHtml(t.motif || '—')}</span>
          <span class="dash-list-sub">${escapeHtml(t.member_name || '—')}</span>
        </div>`).join('')
        : '<p class="dash-empty">Aucune transaction.</p>';
    }

    // Événements actifs
    const missEl = document.getElementById('dashMissionsList');
    if (missEl) {
      missEl.innerHTML = missions.length ? missions.slice(0, 4).map(m => `
        <div class="dash-list-item">
          <span class="mission-priority-dot priority-${m.priority}"></span>
          <span class="dash-list-label">${escapeHtml(m.title)}</span>
        </div>`).join('')
        : '<p class="dash-empty">Aucun événement en cours.</p>';
    }

    // Membres
    const membEl = document.getElementById('dashMembersList');
    if (membEl && Array.isArray(mData)) {
      membEl.innerHTML = mData.map(m => `
        <div class="dash-list-item dash-member-item" data-member-id="${m.id}" style="cursor:pointer">
          <span class="dash-member-avatar">${m.rp_name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}</span>
          <div>
            <div class="dash-list-label">${escapeHtml(m.rp_name)}</div>
            <div class="dash-list-sub">@${escapeHtml(m.username)}</div>
          </div>
        </div>`).join('');

      membEl.querySelectorAll('.dash-member-item').forEach(el => {
        el.addEventListener('click', () => openMemberProfile(Number(el.dataset.memberId)));
      });
    }

    renderBalanceChart(txData);

  } catch(e) { console.error('Dashboard error', e); }
}

// ===== GRAPHIQUES COMPTABILITÉ =====
// Instance Chart.js courante — conservée pour pouvoir la détruire avant de la recréer.
let chartBalanceInst = null;

// Calcule le solde cumulatif (running total) transaction par transaction dans l'ordre chronologique,
// puis affiche une courbe de tendance du solde avec Chart.js.
// L'instance précédente est détruite pour éviter les doublons de canvas.
function renderBalanceChart(txData) {
  const canvas = document.getElementById('chartBalance');
  if (!canvas || !window.Chart) return;
  if (chartBalanceInst) chartBalanceInst.destroy();

  // Tri chronologique pour que la courbe soit dans le bon sens.
  const sorted = [...txData].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  let running = 0;
  const labels = [], data = [];
  sorted.forEach(t => {
    running += t.type === 'entree' ? t.amount : -t.amount;
    labels.push(new Date(t.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }));
    data.push(running);
  });

  chartBalanceInst = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Solde', data, borderColor: '#4caf82', backgroundColor: 'rgba(76,175,130,0.1)',
        tension: 0.3, fill: true, pointRadius: 3 }],
    },
    options: { responsive: true, plugins: { legend: { display: false } },
      scales: { x: { ticks: { color:'#888', maxTicksLimit: 8 }, grid: { color:'#2a2a3a' } },
                y: { ticks: { color:'#888' }, grid: { color:'#2a2a3a' } } } },
  });
}


// ===== MISSIONS =====
// Cache local des missions et filtre actif par statut.
let missions      = [];
let missionFilter = 'all';   // 'all' | 'en_cours' | 'termine' | 'echoue'

// Labels d'affichage pour les statuts et priorités (utilisés dans les cartes et les selects).
const MISSION_STATUS_LABELS = { en_cours: '⏳ En cours', termine: '✅ Terminé', echoue: '🚫 Annulé' };
const MISSION_PRIORITY_LABELS = { basse: '🟢 Basse', normale: '🟡 Normale', haute: '🔴 Haute' };

async function fetchMissions() {
  try {
    const res  = await fetch(`${API}/missions`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    missions = data;
    renderMissions();
  } catch { console.error('Erreur chargement missions.'); }
}

function getFilteredMissions() {
  if (missionFilter === 'all') return missions;
  return missions.filter(m => m.status === missionFilter);
}

// Génère les chips de sélection des membres assignés à une mission.
// Même pattern que buildZoneSelector mais pour les membres plutôt que les zones.
function buildMissionMembersSelector(selectedIds = []) {
  const container = document.getElementById('missionMembersSelector');
  if (!container) return;
  container.innerHTML = '';
  members.forEach(m => {
    const chip = document.createElement('span');
    // Les ids sont comparés en String car data-mid est une string et selectedIds peut contenir des strings
    chip.className   = 'zone-chip' + (selectedIds.includes(String(m.id)) ? ' selected' : '');
    chip.textContent = m.rp_name;
    chip.dataset.mid = m.id;
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
    container.appendChild(chip);
  });
}

// Retourne les ids des membres sélectionnés sous forme de chaîne CSV pour l'API.
function getSelectedMissionMembers() {
  return Array.from(document.querySelectorAll('#missionMembersSelector .zone-chip.selected'))
    .map(c => c.dataset.mid).join(',');
}

// Résout une liste d'ids membres (format CSV) en noms RP lisibles.
// Si un id n'est pas trouvé dans le cache local, il est retourné tel quel (fallback).
function getMemberNames(ids) {
  if (!ids) return '';
  return ids.split(',').filter(Boolean).map(id => {
    const m = members.find(m => String(m.id) === id);
    return m ? m.rp_name : id;
  }).join(', ');
}

function renderMissions() {
  const grid  = document.getElementById('missionsGrid');
  const empty = document.getElementById('missionsEmpty');
  const list  = getFilteredMissions();
  Array.from(grid.querySelectorAll('.mission-card')).forEach(c => c.remove());
  if (list.length === 0) { empty.style.display = ''; return; }
  empty.style.display = 'none';

  list.forEach(m => {
    const card = document.createElement('div');
    card.className = `mission-card status-${m.status}`;
    card.innerHTML = `
      <div class="mission-card-header">
        <div class="mission-card-title-row">
          <span class="mission-priority-dot priority-${m.priority}"></span>
          <span class="mission-card-title">${escapeHtml(m.title)}</span>
        </div>
        <div class="mission-card-badges">
          <span class="mission-status-badge status-badge-${m.status}">${MISSION_STATUS_LABELS[m.status]}</span>
          ${currentUser?.id === m.created_by ? `
            <button class="btn-edit" data-mission-edit="${m.id}">✏️</button>
            <button class="btn-delete" data-mission-del="${m.id}">✕</button>
          ` : ''}
        </div>
      </div>
      ${m.description ? `<div class="mission-card-desc">${escapeHtml(m.description)}</div>` : ''}
      ${m.assigned_ids ? `<div class="mission-card-members">👥 ${escapeHtml(getMemberNames(m.assigned_ids))}</div>` : ''}
      <div class="mission-card-footer">
        <span>Par ${escapeHtml(m.created_by_name || '—')}</span>
        <div class="mission-status-controls">
          <select class="mission-status-select form-input form-select" data-mission-status="${m.id}">
            <option value="en_cours"  ${m.status==='en_cours'  ? 'selected':''}>⏳ En cours</option>
            <option value="termine"   ${m.status==='termine'   ? 'selected':''}>✅ Terminé</option>
            <option value="echoue"    ${m.status==='echoue'    ? 'selected':''}>🚫 Annulé</option>
          </select>
        </div>
      </div>`;
    grid.appendChild(card);
  });
  applyStagger(grid);
}

// Filtres missions
document.querySelectorAll('[data-mfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-mfilter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    missionFilter = btn.dataset.mfilter;
    renderMissions();
  });
});

// Ouvrir modal ajout
document.getElementById('btnOpenAddMission')?.addEventListener('click', () => {
  document.getElementById('missionModalTitle').textContent = 'Nouvelle mission';
  document.getElementById('missionEditId').value  = '';
  document.getElementById('missionTitle').value   = '';
  document.getElementById('missionDesc').value    = '';
  document.getElementById('missionPriority').value = 'normale';
  document.getElementById('missionError').textContent = '';
  buildMissionMembersSelector();
  openModal('missionModal');
});

// Clic grille missions
document.getElementById('missionsGrid')?.addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-mission-edit]');
  const delBtn  = e.target.closest('[data-mission-del]');
  const selEl   = e.target.closest('[data-mission-status]');

  if (editBtn) {
    const m = missions.find(m => m.id === Number(editBtn.dataset.missionEdit));
    if (!m) return;
    document.getElementById('missionModalTitle').textContent = 'Modifier la mission';
    document.getElementById('missionEditId').value   = m.id;
    document.getElementById('missionTitle').value    = m.title;
    document.getElementById('missionDesc').value     = m.description || '';
    document.getElementById('missionPriority').value = m.priority;
    document.getElementById('missionError').textContent = '';
    buildMissionMembersSelector(m.assigned_ids ? m.assigned_ids.split(',') : []);
    openModal('missionModal');
  }
  if (delBtn) {
    const id = Number(delBtn.dataset.missionDel);
    confirmAction('Supprimer cette mission ?', async () => {
      try {
        const res = await fetch(`${API}/missions/${id}`, { method:'DELETE', headers: authHeaders() });
        if (res.ok) { missions = missions.filter(m => m.id !== id); renderMissions(); showToast('Événement supprimé.'); }
        else showToast('Erreur lors de la suppression.', 'error');
      } catch { showToast('Impossible de contacter le serveur.', 'error'); }
    });
  }
});

// Changement statut via select
document.getElementById('missionsGrid')?.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-mission-status]');
  if (!sel) return;
  const id = Number(sel.dataset.missionStatus);
  try {
    const res  = await fetch(`${API}/missions/${id}/status`, {
      method:'PATCH', headers: authHeaders(), body: JSON.stringify({ status: sel.value }),
    });
    const data = await res.json();
    if (res.ok) { const idx = missions.findIndex(m => m.id === id); if (idx !== -1) missions[idx] = data; renderMissions(); }
  } catch {}
});

// Sauvegarder mission
document.getElementById('btnSaveMission')?.addEventListener('click', async () => {
  const id          = document.getElementById('missionEditId').value;
  const title       = document.getElementById('missionTitle').value.trim();
  const description = document.getElementById('missionDesc').value.trim();
  const priority    = document.getElementById('missionPriority').value;
  const assigned_ids = getSelectedMissionMembers();
  const errorEl     = document.getElementById('missionError');
  errorEl.textContent = '';
  if (!title) { errorEl.textContent = 'Le titre est requis.'; return; }

  const isEdit = id !== '';
  const url    = isEdit ? `${API}/missions/${id}` : `${API}/missions`;
  const method = isEdit ? 'PUT' : 'POST';
  const btn    = document.getElementById('btnSaveMission');
  btn.disabled = true; btn.textContent = 'Enregistrement...';

  try {
    const res  = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify({ title, description, priority, assigned_ids }) });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'Erreur.'; return; }
    if (isEdit) { const idx = missions.findIndex(m => m.id === Number(id)); if (idx !== -1) missions[idx] = data; }
    else missions.unshift(data);
    renderMissions();
    closeModal('missionModal');
    showToast(isEdit ? 'Événement modifié.' : 'Événement créé.');
  } catch { errorEl.textContent = 'Impossible de contacter le serveur.'; }
  finally { btn.disabled = false; btn.textContent = 'Enregistrer'; }
});

document.getElementById('missionModalClose')?.addEventListener('click',  () => closeModal('missionModal'));
document.getElementById('missionModalCancel')?.addEventListener('click', () => closeModal('missionModal'));
document.getElementById('missionModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('missionModal')) closeModal('missionModal');
});

// ===== PROFIL MEMBRE =====
// Charge le profil complet d'un membre depuis l'API (armes, véhicules, transactions associés),
// peuple la modale et l'ouvre. Accessible en cliquant sur un membre dans le dashboard ou l'admin.
async function openMemberProfile(memberId) {
  try {
    const res  = await fetch(`${API}/members/${memberId}/profile`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    // Destructuration : l'API retourne un objet { user, weapons, vehicles, transactions }
    const { user, weapons: w, vehicles: v, transactions: tx } = data;

    document.getElementById('profileModalTitle').textContent = user.rp_name;
    document.getElementById('profileRpName').textContent     = user.rp_name;
    document.getElementById('profileUsername').textContent   = `@${user.username}`;
    document.getElementById('profileSince').textContent      = `Membre depuis le ${new Date(user.created_at).toLocaleDateString('fr-FR')}`;
    document.getElementById('profileAvatar').textContent     = user.rp_name.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2);
    document.getElementById('profileTxCount').textContent    = tx.length;
    document.getElementById('profileWeaponCount').textContent = w.length;

    document.getElementById('profileWeapons').innerHTML = w.length
      ? w.map(x => `<div class="profile-item"><span>${escapeHtml(x.name)}</span><span class="profile-item-sub">${escapeHtml(x.category)}</span></div>`).join('')
      : '<p class="dash-empty">Aucune affectation.</p>';

    document.getElementById('profileTx').innerHTML = tx.length
      ? tx.map(t => `
        <div class="profile-item">
          <span class="${t.type === 'entree' ? 'dash-list-badge badge-income' : 'dash-list-badge badge-expense'}">${t.type==='entree'?'+':'-'}${formatAmount(t.amount)}</span>
          <span>${escapeHtml(t.motif || '—')}</span>
          <span class="profile-item-sub">${new Date(t.created_at).toLocaleDateString('fr-FR')}</span>
        </div>`).join('')
      : '<p class="dash-empty">Aucune transaction.</p>';

    openModal('memberProfileModal');
  } catch { console.error('Erreur profil membre.'); }
}

document.getElementById('profileModalClose')?.addEventListener('click', () => closeModal('memberProfileModal'));
document.getElementById('memberProfileModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('memberProfileModal')) closeModal('memberProfileModal');
});

// Clic sur membres dans le tableau admin
document.getElementById('adminUsersTbody')?.addEventListener('click', (e) => {
  const rpName = e.target.closest('tr')?.querySelector('.admin-username');
  if (rpName && !e.target.closest('button')) {
    const row = e.target.closest('tr');
    const id  = adminUsers.find(u => u.username === rpName.textContent)?.id;
    if (id) openMemberProfile(id);
  }
}, true);


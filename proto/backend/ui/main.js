// Minimal helper
const $ = (sel) => document.querySelector(sel);

// Inline SVG data URIs for brand logo to avoid external loads
const FOOTBALL_LOGO_DATA = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="%230b132b" stroke="%2394a3b8"/><g fill="%23ffffff"><polygon points="32,14 24,20 28,28 36,28 40,20"/><polygon points="18,26 12,34 18,42 26,38 24,30"/><polygon points="46,26 40,30 38,38 46,42 52,34"/><polygon points="24,44 32,38 40,44 36,52 28,52"/></g></svg>';
const CRICKET_LOGO_DATA = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="%237f1d1d" stroke="%23fecaca"/><path d="M10 28 C 28 32, 36 36, 54 40" stroke="%23fecdd3" stroke-width="2" fill="none"/><path d="M10 24 C 28 28, 36 40, 54 44" stroke="%23fda4af" stroke-width="1" fill="none" stroke-dasharray="3 3"/></svg>';
const F1_LOGO_DATA = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 24"><rect width="64" height="24" rx="4" fill="%23111" stroke="%23ef4444"/><path d="M6 16 L22 16 L26 8 L14 8 Z" fill="%23ef4444"/><rect x="30" y="8" width="8" height="8" fill="%23ef4444"/></svg>';
const apiBaseInput = $('#apiBase');
const adminTokenInput = $('#adminToken');

const headers = () => ({ 'Content-Type': 'application/json' });
const adminHeaders = () => ({ 'Content-Type': 'application/json', 'X-Admin-Token': adminTokenInput.value || '' });

// Ensure API base points to a live server (try current origin, then 8000, then 8001)
async function ensureApiBaseAlive() {
  const tryPing = async (base) => {
    try {
      const r = await fetch(`${base}/analytics`, { method: 'GET' });
      return r.ok;
    } catch { return false; }
  };
  const candidates = [];
  if (window?.location?.origin) candidates.push(window.location.origin);
  candidates.push('http://127.0.0.1:8000');
  candidates.push('http://127.0.0.1:8001');
  for (const base of candidates) {
    if (await tryPing(base)) {
      if (apiBaseInput) apiBaseInput.value = base;
      if (base !== window.location.origin) {
        showToast(`API connected: ${base}`, 'success');
      }
      return base;
    }
  }
  showToast('API server unreachable. Start backend on 8000 or 8001.', 'error');
  return null;
}

const state = {
  attributes: [],
  teams: [],
  currentQ: null,
  responses: {},
  quickAnswers: {},
  chat: { active: false, step: 0, answers: {}, currentKey: null, asked: {}, lastAnswerAt: 0, sport: 'football' },
};

// F1 questions (personality-first)
const f1Keys = [
  'Calm vs Aggressive','Bold Overtakes','Consistency over Wins','Clutch Performances','Radio Composure','Rich Legacy (F1)','Leadership & Mentoring','Adaptability (Wet/Tricky)','Fan Engagement','Technical Feedback'];
const f1Labels = {
  'Calm vs Aggressive':'Do you prefer calm, calculated drivers over aggressive risk-takers?',
  'Bold Overtakes':'Do you enjoy bold overtakes even if they’re risky?',
  'Consistency over Wins':'Is consistent points scoring more important than occasional wins?',
  'Clutch Performances':'Do clutch, high-pressure performances matter to you?',
  'Radio Composure':'Do you value calm and positive team-radio communication?',
  'Rich Legacy (F1)':'Do you prefer drivers with a rich F1 history and legacy?',
  'Leadership & Mentoring':'Do you like drivers known for leadership and mentoring?',
  'Adaptability (Wet/Tricky)':'Is adaptability to wet or tricky conditions important to you?',
  'Fan Engagement':'Do you care about a driver’s fan engagement and charisma?',
  'Technical Feedback':'Do you value strong technical feedback and car development input?'
};

// Server switch buttons
// Default to current site origin (helps when accessing from another device)
if (apiBaseInput && window?.location?.origin) {
  apiBaseInput.value = window.location.origin;
  apiBaseInput.setAttribute('readonly', 'true');
}

// Expose for fallback inline triggers if needed
window.__startChat = startChat;

// Apply sport from URL query (e.g., index.html?sport=football)
function applySportFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const sport = (params.get('sport') || '').toLowerCase();
  if (!sport) return;
  if (sport === 'football') {
    state.chat.sport = 'football';
    setSportActive(btnSportFootball);
    const home = document.getElementById('homeSelect');
    const chat = document.getElementById('chatMatch');
    if (home && chat) {
      home.classList.add('hidden-section');
      chat.classList.remove('hidden-section');
      chat.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const chatContainer = document.querySelector('#chatMatch .chat-container');
    if (chatContainer) { chatContainer.classList.add('stadium-bg'); chatContainer.classList.remove('cricket-bg'); }
    const logo = document.getElementById('brandLogo');
    if (logo) logo.src = FOOTBALL_LOGO_DATA;
  } else if (sport === 'cricket') {
    state.chat.sport = 'cricket';
    const home = document.getElementById('homeSelect');
    const chat = document.getElementById('chatMatch');
    if (home && chat) {
      home.classList.add('hidden-section');
      chat.classList.remove('hidden-section');
      chat.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // apply cricket theme background
    const chatContainer = document.querySelector('#chatMatch .chat-container');
    if (chatContainer) { chatContainer.classList.add('cricket-bg'); chatContainer.classList.remove('stadium-bg'); chatContainer.classList.remove('f1-bg'); }
    const logo = document.getElementById('brandLogo');
    if (logo) logo.src = CRICKET_LOGO_DATA;
  } else if (sport === 'f1') {
    state.chat.sport = 'f1';
    const home = document.getElementById('homeSelect');
    const chat = document.getElementById('chatMatch');
    if (home && chat) {
      home.classList.add('hidden-section');
      chat.classList.remove('hidden-section');
      chat.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const chatContainer = document.querySelector('#chatMatch .chat-container');
    if (chatContainer) { chatContainer.classList.add('f1-bg'); chatContainer.classList.remove('stadium-bg'); chatContainer.classList.remove('cricket-bg'); }
    const logo = document.getElementById('brandLogo'); if (logo) logo.src = F1_LOGO_DATA;
    showToast('F1 selected', 'success');
  }
}

// ---------------- Sport Selector -----------------
// Sport-aware chat keys
const footballKeys = [
  'Community Engagement',
  'Possession Play',
  'Youth Academy',
  'National Team Contributors',
  'Iconic Players',
  'Atmospheric Stadium',
  'Derby Specialists',
  'Big Match Temperament',
  'Historic Success',
  'Global Fanbase'
];
const footballLabels = {
  'Community Engagement': 'Do you value teams with a prominent presence in charity and community work?',
  'Possession Play': 'Do you enjoy possession-based play?',
  'Youth Academy': 'Do you prefer teams known for nurturing homegrown players?',
  'National Team Contributors': 'Is it important that your team regularly provides players to the national team?',
  'Iconic Players': 'Are you drawn to teams with iconic superstars and big personalities?',
  'Atmospheric Stadium': 'Do you enjoy an electric, passionate matchday atmosphere?',
  'Derby Specialists': 'Do historic rivalries and derby storylines excite you?',
  'Big Match Temperament': 'Do clutch performances on big occasions matter to you?',
  'Historic Success': 'Do you appreciate a rich trophy history?',
  'Global Fanbase': 'Do you like being part of a large, worldwide fan community?'
};

// Cricket beginner-friendly 10 questions
const cricketKeys = [
  'Aggressive Batting',
  'Steady Batting',
  'Fast Bowling',
  'Spin Bowling',
  'Big Match Wins',
  'Strong Fielding',
  'Back Young Players',
  'Win In All Conditions',
  'Rich Legacy',
  'Passionate Fanbase'
];
const cricketLabels = {
  'Aggressive Batting': 'Do you like teams that bat aggressively and go for big shots?',
  'Steady Batting': 'Do you like teams that build the innings slowly and steadily?',
  'Fast Bowling': 'Do you enjoy watching fast bowlers who bowl really quick?',
  'Spin Bowling': 'Do you enjoy clever spin bowling that tricks batters?',
  'Big Match Wins': 'Do you care about big-match wins in World Cups and ICC knockouts?',
  'Strong Fielding': 'Is strong fielding (great catches and saves) important to you?',
  'Back Young Players': 'Do you like teams that give new young players a chance?',
  'Win In All Conditions': 'Is it important that a team can win in different countries and conditions?',
  'Rich Legacy': 'Do you value teams with a long history of success and famous players?',
  'Passionate Fanbase': 'Do you like teams with huge, passionate fan support?'
};

function chatKeys() { if (state.chat.sport==='cricket') return cricketKeys; if (state.chat.sport==='f1') return f1Keys; return footballKeys; }
function chatLabels() { if (state.chat.sport==='cricket') return cricketLabels; if (state.chat.sport==='f1') return f1Labels; return footballLabels; }
const btnSportFootball = document.getElementById('btnSportFootball');
const btnSportCricket = document.getElementById('btnSportCricket');
const btnSportF1 = document.getElementById('btnSportF1');
function setSportActive(btn) {
  [btnSportFootball, btnSportCricket, btnSportF1].forEach(b => b && b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}
if (btnSportFootball) btnSportFootball.addEventListener('click', () => {
  state.chat.sport = 'football';
  setSportActive(btnSportFootball);
  const chatContainer = document.querySelector('#chatMatch .chat-container');
  if (chatContainer) { chatContainer.classList.add('stadium-bg'); chatContainer.classList.remove('cricket-bg'); }
  const logo = document.getElementById('brandLogo'); if (logo) logo.src = FOOTBALL_LOGO_DATA;
  showChat();
  showToast('Football selected', 'success');
});
if (btnSportCricket) btnSportCricket.addEventListener('click', () => {
  state.chat.sport = 'cricket';
  setSportActive(btnSportCricket);
  const chatContainer = document.querySelector('#chatMatch .chat-container');
  if (chatContainer) { chatContainer.classList.add('cricket-bg'); chatContainer.classList.remove('stadium-bg'); }
  const logo = document.getElementById('brandLogo'); if (logo) logo.src = CRICKET_LOGO_DATA;
  showChat();
  showToast('Cricket selected', 'success');
});
if (btnSportF1) btnSportF1.addEventListener('click', () => {
  state.chat.sport = 'f1';
  setSportActive(btnSportF1);
  const chatContainer = document.querySelector('#chatMatch .chat-container');
  if (chatContainer) { chatContainer.classList.add('f1-bg'); chatContainer.classList.remove('stadium-bg'); chatContainer.classList.remove('cricket-bg'); }
  const logo = document.getElementById('brandLogo'); if (logo) logo.src = F1_LOGO_DATA;
  showChat();
  showToast('F1 selected', 'success');
});

// Short descriptions for the 15 famous clubs
function teamDescription(name) {
  const m = {
    'Manchester City': 'Modern powerhouse known for possession play and relentless pressing under elite managers.',
    'Manchester United': 'Global giant with a rich history, famed for academy talent and dramatic comebacks.',
    'Liverpool': 'High-octane pressing, anthem nights at Anfield, and a deep European pedigree.',
    'Chelsea': 'London contenders with European success and a knack for big-match moments.',
    'Arsenal': 'Stylish footballing identity, strong youth pathway, and a passionate North London fanbase.',
    'Tottenham Hotspur': 'Attacking flair from North London with a cutting-edge stadium atmosphere.',
    'Real Madrid': 'The kings of Europe—icons, trophies, and a culture of winning under bright lights.',
    'FC Barcelona': 'Tiki-taka heritage, La Masia academy, and a global fanbase united by beautiful football.',
    'Atletico Madrid': 'Grit, tactical discipline, and big-game temperament under a warrior ethos.',
    'Bayern Munich': 'German dominance, elite player development, and an expectation to contend every season.',
    'Borussia Dortmund': 'Yellow Wall passion, youth development, and electric counterattacks.',
    'Paris Saint-Germain': 'Star-studded lineups, flair in attack, and a growing European ambition.',
    'Juventus': 'Italian giants built on defensive steel, winning mentality, and iconic personalities.',
    'Inter Milan': 'Historic Milan side mixing tactical craft with big-occasion resilience.',
    'AC Milan': 'Rossoneri tradition—European royalty with iconic players and a classic football aura.',
  };
  return m[name] || '';
}

// F1 constructor names
function driverTeamF1(name) {
  const teams = {
    'Max Verstappen': 'Red Bull Racing',
    'Sergio Pérez': 'Red Bull Racing',
    'Lewis Hamilton': 'Mercedes',
    'George Russell': 'Mercedes',
    'Charles Leclerc': 'Ferrari',
    'Carlos Sainz': 'Ferrari',
    'Lando Norris': 'McLaren',
    'Oscar Piastri': 'McLaren',
    'Fernando Alonso': 'Aston Martin',
    'Daniel Ricciardo': 'RB (Visa Cash App RB)'
  };
  return teams[name] || '';
}

function updateChatProgress() {
  const bar = document.getElementById('chatProgressBar');
  const txt = document.getElementById('chatProgressText');
  const total = chatKeys().length; const cur = Math.min(state.chat.step, total);
  const pct = Math.round((cur / total) * 100);
  if (bar) bar.style.setProperty('--pct', pct + '%');
  if (txt) txt.textContent = `${cur} / ${total}`;
}
$('#btnUse8000').addEventListener('click', () => { apiBaseInput.value = 'http://127.0.0.1:8000'; });
$('#btnUse8001').addEventListener('click', () => { apiBaseInput.value = 'http://127.0.0.1:8001'; });

// Attributes
async function fetchAttributes() {
  const res = await fetch(`${apiBaseInput.value}/attributes`);
  state.attributes = await res.json();
  renderAttributes();
}

function renderAttributes() {
  const list = $('#attrList');
  list.innerHTML = '';
  state.attributes.forEach(a => {
    const li = document.createElement('li');
    li.textContent = `#${a.id} ${a.name}${a.description ? ' — ' + a.description : ''}`;
    list.appendChild(li);
  });
  renderTeams();
  renderQuestions();
}

$('#btnAddAttr').addEventListener('click', async () => {
  const name = $('#attrName').value.trim();
  const description = $('#attrDesc').value.trim();
  if (!name) return;
  await fetch(`${apiBaseInput.value}/attributes`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name, description: description || null, active: true })
  });
  $('#attrName').value = '';
  $('#attrDesc').value = '';
  fetchAttributes();
});
$('#btnRefreshAttrs').addEventListener('click', fetchAttributes);

// Teams
async function fetchTeams() {
  const res = await fetch(`${apiBaseInput.value}/teams`);
  state.teams = await res.json();
  renderTeams();
}

function renderTeams() {
  const wrap = $('#teamsContainer');
  wrap.innerHTML = '';
  state.teams.forEach(team => {
    const div = document.createElement('div');
    div.className = 'team-card';

    const h = document.createElement('h3');
    h.textContent = `#${team.id} ${team.name}`;
    div.appendChild(h);

    const attrs = document.createElement('div');
    attrs.className = 'attrs-grid';

    state.attributes.forEach(a => {
      const row = document.createElement('label');
      row.className = 'attr-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!team.attributes[a.id];
      cb.addEventListener('change', () => {
        team.attributes[a.id] = cb.checked ? 1 : 0;
      });
      row.appendChild(cb);
      const span = document.createElement('span');
      span.textContent = a.name;
      row.appendChild(span);
      attrs.appendChild(row);
    });

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Team Attributes';
    saveBtn.addEventListener('click', async () => {
      await fetch(`${apiBaseInput.value}/teams/${team.id}/attributes`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ attributes: team.attributes })
      });
      fetchTeams();
    });

    div.appendChild(attrs);
    div.appendChild(saveBtn);
    wrap.appendChild(div);
  });
}

$('#btnAddTeam').addEventListener('click', async () => {
  const name = $('#teamName').value.trim();
  const league = $('#teamLeague').value.trim();
  if (!name) return;
  await fetch(`${apiBaseInput.value}/teams`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name, meta: league ? { league } : null })
  });
  $('#teamName').value = '';
  $('#teamLeague').value = '';
  fetchTeams();
});
$('#btnRefreshTeams').addEventListener('click', fetchTeams);

// Questionnaire & Prediction
$('#btnCreateQ').addEventListener('click', async () => {
  const user_id = $('#userId').value.trim() || null;
  const res = await fetch(`${apiBaseInput.value}/questionnaires`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ user_id })
  });
  const data = await res.json();
  state.currentQ = data.id;
  $('#currentQ').textContent = `Current Questionnaire ID: ${data.id}`;
  state.responses = {};
  $('#btnSaveResponses').disabled = false;
  $('#btnPredict').disabled = false;
  renderQuestions();
});

function renderQuestions() {
  const q = $('#questions');
  q.innerHTML = '';
  if (!state.attributes.length) {
    q.textContent = 'No attributes yet.';
    return;
  }
  state.attributes.forEach(a => {
    const row = document.createElement('label');
    row.className = 'attr-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!state.responses[a.id];
    cb.addEventListener('change', () => { state.responses[a.id] = cb.checked ? 1 : 0; });
    row.appendChild(cb);
    const span = document.createElement('span');
    span.textContent = a.name;
    row.appendChild(span);
    q.appendChild(row);
  });
}

$('#btnSaveResponses').addEventListener('click', async () => {
  if (!state.currentQ) return;
  const responses = Object.keys(state.responses).map(k => ({ attribute_id: parseInt(k), value: state.responses[k] }));
  await fetch(`${apiBaseInput.value}/questionnaires/${state.currentQ}/responses`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ responses })
  });
  alert('Responses saved');
});

$('#btnPredict').addEventListener('click', async () => {
  if (!state.currentQ) return;
  const res = await fetch(`${apiBaseInput.value}/predict`, { method: 'POST', headers: headers(), body: JSON.stringify({ questionnaire_id: state.currentQ }) });
  const data = await res.json();
  const wrap = $('#predictions');
  wrap.innerHTML = '<h3>Predictions</h3>';
  const ul = document.createElement('ul');
  data.scores.forEach(s => {
    const li = document.createElement('li');
    li.textContent = `${s.team_name}: ${(s.score * 100).toFixed(1)}%`;
    ul.appendChild(li);
  });
  wrap.appendChild(ul);
});

// Analytics
$('#btnAnalytics').addEventListener('click', async () => {
  const res = await fetch(`${apiBaseInput.value}/analytics`);
  const data = await res.json();
  const a = $('#analytics');
  a.innerHTML = '';
  const counts = document.createElement('div');
  counts.innerHTML = `<strong>Totals:</strong> Q=${data.total_questionnaires}, Feedback=${data.total_feedback}, Teams=${data.total_teams}, Attrs=${data.total_attributes}`;
  a.appendChild(counts);

  const attrH = document.createElement('h4'); attrH.textContent = 'Attribute Popularity'; a.appendChild(attrH);
  const ul1 = document.createElement('ul');
  data.attribute_popularity.forEach(x => {
    const li = document.createElement('li');
    li.textContent = `${x.name}: yes=${x.yes_count}/${x.total_answers} (${(x.yes_rate*100).toFixed(1)}%)`;
    ul1.appendChild(li);
  });
  a.appendChild(ul1);

  const teamH = document.createElement('h4'); teamH.textContent = 'Team Support Rate'; a.appendChild(teamH);
  const ul2 = document.createElement('ul');
  data.team_support_rate.forEach(x => {
    const li = document.createElement('li');
    li.textContent = `${x.team_name}: yes=${x.support_yes}/${x.total} (${(x.support_rate*100).toFixed(1)}%)`;
    ul2.appendChild(li);
  });
  a.appendChild(ul2);
});

$('#btnTrain').addEventListener('click', async () => {
  const res = await fetch(`${apiBaseInput.value}/train`, { method: 'POST' });
  const data = await res.json();
  alert(`Model trained on ${data.trained_on_rows} rows`);
});

// Admin
$('#btnReset').addEventListener('click', async () => {
  const res = await fetch(`${apiBaseInput.value}/admin/reset-db`, { method: 'POST', headers: adminHeaders() });
  const data = await res.json();
  $('#adminStatus').textContent = data.message || 'Reset complete';
  fetchAttributes();
  fetchTeams();
});

$('#btnReseed').addEventListener('click', async () => {
  const res = await fetch(`${apiBaseInput.value}/admin/reseed-demo`, { method: 'POST', headers: adminHeaders() });
  const data = await res.json();
  $('#adminStatus').textContent = data.message || 'Reseeded';
  fetchAttributes();
  fetchTeams();
});

$('#btnDeleteModel').addEventListener('click', async () => {
  const res = await fetch(`${apiBaseInput.value}/admin/delete-model`, { method: 'POST', headers: adminHeaders() });
  const data = await res.json();
  $('#adminStatus').textContent = `Removed: ${(data.removed||[]).join(', ')}`;
});

// Init
fetchAttributes();
fetchTeams();

// ---------------- Quick Match (12 Questions) -----------------
// Keep quick match for football; chat uses chatKeys/chatLabels

function renderQuick12() {
  const wrap = document.getElementById('quick12');
  if (!wrap) return;
  wrap.innerHTML = '';
  footballKeys.forEach(k => {
    const row = document.createElement('label');
    row.className = 'attr-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!state.quickAnswers[k];
    cb.addEventListener('change', () => { state.quickAnswers[k] = cb.checked ? 1 : 0; });
    const span = document.createElement('span');
    span.textContent = footballLabels[k] || k;
    row.appendChild(cb);
    row.appendChild(span);
    wrap.appendChild(row);
  });
}

async function findMyClub() {
  // Create questionnaire
  const qRes = await fetch(`${apiBaseInput.value}/questionnaires`, { method: 'POST', headers: headers(), body: JSON.stringify({ user_id: 'quick-match' }) });
  const q = await qRes.json();
  const qid = q.id;
  // Map answers by attribute name -> id
  const attrsRes = await fetch(`${apiBaseInput.value}/attributes`);
  const attrs = await attrsRes.json();
  const byName = {};
  attrs.forEach(a => { byName[a.name] = a.id; });
  const responses = [];
  footballKeys.forEach(k => {
    const id = byName[k];
    if (!id) return;
    const val = state.quickAnswers[k] ? 1 : 0;
    responses.push({ attribute_id: id, value: val });
  });
  await fetch(`${apiBaseInput.value}/questionnaires/${qid}/responses`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ responses })
  });
  // Predict (no personalization slider)
  const spinner = document.getElementById('loadingSpinner');
  if (spinner) spinner.classList.remove('hidden');
  const sportParam = state.chat.sport ? `?sport=${encodeURIComponent(state.chat.sport)}` : '';
  const predRes = await fetch(`${apiBaseInput.value}/predict${sportParam}`, { method: 'POST', headers: headers(), body: JSON.stringify({ questionnaire_id: qid, blend: null, weights_profile: 'sentiment_v1' }) });
  // Reissue with sport param if needed
  const pred = await predRes.json();
  if (spinner) spinner.classList.add('hidden');
  showQuickResults(pred.scores || []);
}

function showQuickResults(scores) {
  const winnerCard = document.getElementById('winnerCard');
  const otherPicks = document.getElementById('otherPicks');
  const list = document.getElementById('quickList');
  list.innerHTML = '';
  if (!scores.length) {
    winnerCard.classList.add('hidden');
    if (otherPicks) { otherPicks.classList.add('hidden'); otherPicks.textContent = ''; }
    list.textContent = 'No results.';
    return;
  }
  // Restrict to known 15 clubs for consistency
  const known = new Set(Object.keys(crestMap()));
  const filtered = scores.filter(s => known.has(s.team_name));
  const [top, ...rest] = filtered.length ? filtered : scores;
  // Winner card
  winnerCard.classList.remove('hidden');
  const crestUrl = getCrest(top.team_name);
  winnerCard.innerHTML = `
    <div class="winner-title">Top Match</div>
    <div style="display:flex;align-items:center;gap:10px;">
      ${crestUrl ? `<img class="crest" alt="${top.team_name} crest" src="${crestUrl}" />` : ''}
      <div class="winner-name">${top.team_name}</div>
    </div>
  `;
  confettiBurst();
  // Ranked list
  const ul = document.createElement('ul');
  rest.forEach(s => {
    const li = document.createElement('li');
    li.textContent = `${s.team_name}: ${(s.score * 100).toFixed(1)}%`;
    ul.appendChild(li);
  });
  list.appendChild(ul);

  // Other picks (2nd and 3rd)
  if (otherPicks) {
    otherPicks.classList.remove('hidden');
    const second = rest[0];
    const third = rest[1];
    let html = '<div class="winner-title">Other teams you may like</div>';
    if (second) html += `<span class="pill">${second.team_name}</span>`;
    if (third) html += ` <span class="pill">${third.team_name}</span>`;
    otherPicks.innerHTML = html;
  }
  // Enable download button
  const btnDownload = document.getElementById('btnDownload');
  if (btnDownload) btnDownload.disabled = false;
}

// Crest URLs for known 15 teams (public vector/PNG logo sources could be swapped in later)
function getCrest(name) {
  const map = {
    'Manchester City': 'https://upload.wikimedia.org/wikipedia/en/e/eb/Manchester_City_FC_badge.svg',
    'Manchester United': 'https://upload.wikimedia.org/wikipedia/en/7/7a/Manchester_United_FC_crest.svg',
    'Liverpool': 'https://upload.wikimedia.org/wikipedia/en/0/0c/Liverpool_FC.svg',
    'Chelsea': 'https://upload.wikimedia.org/wikipedia/en/c/cc/Chelsea_FC.svg',
    'Arsenal': 'https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg',
    'Tottenham Hotspur': 'https://upload.wikimedia.org/wikipedia/en/b/b4/Tottenham_Hotspur.svg',
    'Real Madrid': 'https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg',
    'FC Barcelona': 'https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg',
    'Atletico Madrid': 'https://upload.wikimedia.org/wikipedia/en/f/f4/Club_Atl%C3%A9tico_de_Madrid_2017_logo.svg',
    'Bayern Munich': 'https://upload.wikimedia.org/wikipedia/en/1/1f/FC_Bayern_M%C3%BCnchen_logo_%282017%29.svg',
    'Borussia Dortmund': 'https://upload.wikimedia.org/wikipedia/commons/6/67/Borussia_Dortmund_logo.svg',
    'Paris Saint-Germain': 'https://upload.wikimedia.org/wikipedia/en/a/a7/Paris_Saint-Germain_F.C..svg',
    'Juventus': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Juventus_FC_2017_logo.svg',
    'Inter Milan': 'https://upload.wikimedia.org/wikipedia/commons/0/05/FC_Internazionale_Milano_2021.svg',
    'AC Milan': 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Logo_of_AC_Milan.svg',
  };
  return map[name] || '';
}

function crestMap() { return {
  'Manchester City': 'https://upload.wikimedia.org/wikipedia/en/e/eb/Manchester_City_FC_badge.svg',
  'Manchester United': 'https://upload.wikimedia.org/wikipedia/en/7/7a/Manchester_United_FC_crest.svg',
  'Liverpool': 'https://upload.wikimedia.org/wikipedia/en/0/0c/Liverpool_FC.svg',
  'Chelsea': 'https://upload.wikimedia.org/wikipedia/en/c/cc/Chelsea_FC.svg',
  'Arsenal': 'https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg',
  'Tottenham Hotspur': 'https://upload.wikimedia.org/wikipedia/en/b/b4/Tottenham_Hotspur.svg',
  'Real Madrid': 'https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg',
  'FC Barcelona': 'https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg',
  'Atletico Madrid': 'https://upload.wikimedia.org/wikipedia/en/f/f4/Club_Atl%C3%A9tico_de_Madrid_2017_logo.svg',
  'Bayern Munich': 'https://upload.wikimedia.org/wikipedia/en/1/1f/FC_Bayern_M%C3%BCnchen_logo_%282017%29.svg',
  'Borussia Dortmund': 'https://upload.wikimedia.org/wikipedia/commons/6/67/Borussia_Dortmund_logo.svg',
  'Paris Saint-Germain': 'https://upload.wikimedia.org/wikipedia/en/a/a7/Paris_Saint-Germain_F.C..svg',
  'Juventus': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Juventus_FC_2017_logo.svg',
  'Inter Milan': 'https://upload.wikimedia.org/wikipedia/commons/0/05/FC_Internazionale_Milano_2021.svg',
  'AC Milan': 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Logo_of_AC_Milan.svg',
};}

// Cricket flag/crest map
function crestMapCricket() { return {
  'India': 'https://upload.wikimedia.org/wikipedia/en/4/41/Flag_of_India.svg',
  'Pakistan': 'https://upload.wikimedia.org/wikipedia/commons/3/32/Flag_of_Pakistan.svg',
  'Sri Lanka': 'https://upload.wikimedia.org/wikipedia/commons/1/11/Flag_of_Sri_Lanka.svg',
  'West Indies': 'https://upload.wikimedia.org/wikipedia/commons/1/1f/Flag_of_the_West_Indies.svg',
  'Australia': 'https://upload.wikimedia.org/wikipedia/en/b/b9/Flag_of_Australia.svg',
  'New Zealand': 'https://upload.wikimedia.org/wikipedia/commons/3/3e/Flag_of_New_Zealand.svg',
  'England': 'https://upload.wikimedia.org/wikipedia/en/b/be/Flag_of_England.svg',
  'South Africa': 'https://upload.wikimedia.org/wikipedia/commons/a/af/Flag_of_South_Africa.svg',
};}

function getCrestCricket(name) {
  const m = crestMapCricket();
  return m[name] || '';
}

// ---- F1 helpers ----
function normalizeF1Name(s) {
  try {
    return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch { return String(s||''); }
}
function crestMapF1() {
  // Built-in defaults (Wikimedia or similar stable sources). You can override via window.__F1_IMAGES.
  const builtin = {
    'Max Verstappen': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Max_Verstappen_2023_%28cropped%29.jpg/256px-Max_Verstappen_2023_%28cropped%29.jpg',
    'Lewis Hamilton': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Lewis_Hamilton_2018_%28cropped%29.jpg/256px-Lewis_Hamilton_2018_%28cropped%29.jpg',
    'Charles Leclerc': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Charles_Leclerc_2019_Italian_GP_%28cropped%29.jpg/256px-Charles_Leclerc_2019_Italian_GP_%28cropped%29.jpg',
    'Carlos Sainz': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Carlos_Sainz_Jr._2019_Formula_One_tests_Barcelona_%28cropped%29.jpg/256px-Carlos_Sainz_Jr._2019_Formula_One_tests_Barcelona_%28cropped%29.jpg',
    'Lando Norris': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Lando_Norris_2019_Formula_One_tests_Barcelona_%28cropped%29.jpg/256px-Lando_Norris_2019_Formula_One_tests_Barcelona_%28cropped%29.jpg',
    'George Russell': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/George_Russell_2019_Formula_One_tests_Barcelona_%28cropped%29.jpg/256px-George_Russell_2019_Formula_One_tests_Barcelona_%28cropped%29.jpg',
    'Fernando Alonso': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Fernando_Alonso_2016_Malaysia_2_%28cropped%29.jpg/256px-Fernando_Alonso_2016_Malaysia_2_%28cropped%29.jpg',
    'Sergio Pérez': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Sergio_P%C3%A9rez_2019_Formula_One_tests_Barcelona_%28cropped%29.jpg/256px-Sergio_P%C3%A9rez_2019_Formula_One_tests_Barcelona_%28cropped%29.jpg',
    'Oscar Piastri': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Oscar_Piastri_2021_Emilia_Romagna_FIA_Formula_3_round_%28cropped%29.jpg/256px-Oscar_Piastri_2021_Emilia_Romagna_FIA_Formula_3_round_%28cropped%29.jpg',
    'Daniel Ricciardo': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Daniel_Ricciardo_2019_Formula_One_tests_Barcelona_%28cropped%29.jpg/256px-Daniel_Ricciardo_2019_Formula_One_tests_Barcelona_%28cropped%29.jpg',
  };
  const override = (window.__F1_IMAGES && typeof window.__F1_IMAGES === 'object') ? window.__F1_IMAGES : {};
  // Build a map that also contains normalized (accent-free) keys for robustness
  const out = Object.assign({}, builtin, override);
  const extra = {};
  Object.keys(out).forEach(k => { extra[normalizeF1Name(k)] = out[k]; });
  return Object.assign(out, extra);
}
function f1Drivers() {
  return [
    'Max Verstappen','Lewis Hamilton','Charles Leclerc','Carlos Sainz','Lando Norris',
    'George Russell','Fernando Alonso','Sergio Pérez','Oscar Piastri','Daniel Ricciardo'
  ];
}
function f1Initials(name) {
  const parts = String(name||'').split(/\s+/).filter(Boolean);
  const a = (parts[0]||'F')[0];
  const b = (parts[1]||'1')[0];
  return (a + b).toUpperCase();
}
function getCrestF1(name) {
  const m = crestMapF1();
  const url = (m && (m[name] || m[normalizeF1Name(name)]));
  if (url) return url; // prefer provided photo
  // fallback: initials avatar
  const bg = '%230a0f1f'; const stroke = '%23ef4444'; const fill = '%23e2e8f0';
  const txt = encodeURIComponent(f1Initials(name));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect x='2' y='2' width='60' height='60' rx='12' fill='${bg}' stroke='${stroke}'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, Helvetica, sans-serif' font-size='22' fill='${fill}'>${txt}</text></svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}

// Try to resolve a Wikipedia thumbnail for a driver name
async function resolveF1Image(name) {
  try {
    const aliases = (n) => {
      const base = normalizeF1Name(n);
      const list = [base];
      // Known alias/title variants
      if (/^carlos\s+sainz$/i.test(base)) list.push('Carlos Sainz Jr.');
      if (/^sergio\s+perez$/i.test(base)) list.push('Sergio Pérez');
      return list;
    };
    for (const t of aliases(name)) {
      const title = encodeURIComponent(t);
      const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${title}&prop=pageimages&pithumbsize=256&format=json&origin=*`;
      const res = await fetch(url, { mode: 'cors' });
      const data = await res.json();
      const pages = data?.query?.pages || {};
      for (const k in pages) {
        const thumb = pages[k]?.thumbnail?.source;
        if (thumb) return thumb;
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}
function driverDescriptionF1(name) {
  const m = {
    'Max Verstappen': 'Aggressive racecraft, relentless pace, supreme consistency at the front.',
    'Lewis Hamilton': 'Calm under pressure, elite race management, vocal leader and icon.',
    'Charles Leclerc': 'Qualifying ace with fearless overtakes and Ferrari talisman energy.',
    'Carlos Sainz': 'Calculated, consistent, strategic thinker with strong team play.',
    'Lando Norris': 'Quick, adaptable, composed on radio with strong fan connection.',
    'George Russell': 'Methodical, technical, thrives under pressure, future-focused.',
    'Fernando Alonso': 'Legendary racecraft, opportunistic, maximizes any situation.',
    'Sergio Pérez': 'Tyre whisperer, clutch on strategy, decisive in traffic.',
    'Oscar Piastri': 'Rising star, calm and clinical, strong adaptation curve.',
    'Daniel Ricciardo': 'Late-braking master, charismatic, morale-boosting presence.'
  };
  return m[name] || '';
}

// Cricket team short descriptions
function teamDescriptionCricket(name) {
  const m = {
    'India': 'Spin heritage, world-class batting depth, and massive fan support across the globe.',
    'Pakistan': 'Express pace, reverse swing mastery, and thrilling unpredictability in big moments.',
    'Sri Lanka': 'Clever spin, game awareness, and a proud legacy of disciplined cricket.',
    'West Indies': 'Power hitters, fast bowling tradition, and flair born from Caribbean cricket culture.',
    'Australia': 'Relentless competitiveness, elite fielding, and winning in all conditions.',
    'New Zealand': 'Smart tactics, top fielding standards, and a respected, sporting identity.',
    'England': 'Aggressive modern batting, innovative strategies, and a deep professional system.',
    'South Africa': 'Strong fast bowling stocks, athletic fielding, and all-round depth.',
  };
  return m[name] || '';
}

// Reset answers
function resetQuick() {
  state.quickAnswers = {};
  renderQuick12();
  const btnDownload = document.getElementById('btnDownload');
  if (btnDownload) btnDownload.disabled = true;
  const winnerCard = document.getElementById('winnerCard');
  const otherPicks = document.getElementById('otherPicks');
  const list = document.getElementById('quickList');
  if (winnerCard) { winnerCard.classList.add('hidden'); winnerCard.innerHTML = ''; }
  if (otherPicks) { otherPicks.classList.add('hidden'); otherPicks.innerHTML = ''; }
  if (list) { list.innerHTML = ''; }
}

// Download result image (simple: capture winner card via canvas)
async function downloadResult() {
  const winner = document.getElementById('winnerCard');
  if (!winner || winner.classList.contains('hidden')) return;
  // Lightweight DOM-to-image approach using html2canvas via CDN
  if (!window.html2canvas) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = resolve; s.onerror = reject; document.body.appendChild(s);
    });
  }
  const canvas = await window.html2canvas(winner);
  const link = document.createElement('a');
  link.download = 'my-top-team.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Simple confetti burst using CSS/JS (minimal)
function confettiBurst() {
  // Lightweight inline confetti: create a few colored dots that fade out
  const container = document.getElementById('winnerCard');
  if (!container) return;
  for (let i=0;i<18;i++) {
    const dot = document.createElement('div');
    dot.style.position = 'absolute';
    dot.style.width = '6px';
    dot.style.height = '6px';
    dot.style.borderRadius = '50%';
    dot.style.background = ['#22d3ee','#60a5fa','#a78bfa','#f472b6','#34d399'][i%5];
    dot.style.left = (50 + Math.random()*40 - 20) + '%';
    dot.style.top = (20 + Math.random()*40 - 20) + 'px';
    dot.style.opacity = '0.95';
    dot.style.transition = 'transform 900ms ease, opacity 900ms ease';
    container.appendChild(dot);
    setTimeout(() => {
      dot.style.transform = `translate(${(Math.random()*120-60)}px, ${(-Math.random()*80)}px)`;
      dot.style.opacity = '0';
    }, 20);
    setTimeout(() => { dot.remove(); }, 1200);
  }
}

// Render and bind
renderQuick12();
const btnQuick = document.getElementById('btnQuickMatch');
if (btnQuick) btnQuick.addEventListener('click', findMyClub);
const btnReset = document.getElementById('btnResetQuick');
if (btnReset) btnReset.addEventListener('click', resetQuick);
const btnDownload = document.getElementById('btnDownload');
if (btnDownload) btnDownload.addEventListener('click', downloadResult);

// Share link: encode answers as query ?a=12-bit string (0/1), e.g., a=110... ordered by quickKeys
const btnShare = document.getElementById('btnShare');
if (btnShare) btnShare.addEventListener('click', async () => {
  const bits = footballKeys.map(k => (state.quickAnswers[k] ? '1' : '0')).join('');
  const url = new URL(window.location.href);
  url.searchParams.set('a', bits);
  const link = url.toString();
  try {
    await navigator.clipboard.writeText(link);
    btnShare.textContent = 'Link Copied!';
    setTimeout(() => { btnShare.textContent = 'Share Link'; }, 1500);
  } catch (e) {
    // fallback
    prompt('Copy this link', link);
  }
});

// If URL contains answers (?a=...), pre-fill checkboxes
function hydrateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const a = params.get('a');
  if (a && a.length === footballKeys.length) {
    footballKeys.forEach((k, i) => { state.quickAnswers[k] = a[i] === '1' ? 1 : 0; });
    renderQuick12();
  }
}
hydrateFromQuery();

// Personalization label binding
const blendRangeEl = document.getElementById('blendRange');
const blendLabelEl = document.getElementById('blendLabel');
if (blendRangeEl && blendLabelEl) {
  const syncLabel = () => {
    const v = parseFloat(blendRangeEl.value || '0');
    blendLabelEl.textContent = `${v.toFixed(2)} (0 = pure model, 1 = pure sentiment)`;
  };
  blendRangeEl.addEventListener('input', syncLabel);
  blendRangeEl.addEventListener('change', syncLabel);
  syncLabel();
}

// ---------------- Chat Bot Questionnaire -----------------
const chatMessages = document.getElementById('chatMessages');
const btnStartChat = document.getElementById('btnStartChat');
const btnYes = document.getElementById('btnYes');
const btnNo = document.getElementById('btnNo');
const btnRestartChat = document.getElementById('btnRestartChat');

function chatReset() {
  const currentSport = state.chat?.sport || 'football';
  state.chat = { active: false, step: 0, answers: {}, currentKey: null, asked: {}, lastAnswerAt: 0, sport: currentSport };
  if (chatMessages) chatMessages.innerHTML = '';
  const startBtn = document.getElementById('btnStartChat');
  if (startBtn) startBtn.classList.remove('hidden');
  const chatButtons = document.getElementById('chatButtons');
  if (chatButtons) chatButtons.classList.add('hidden');
}

function appendBubble(text, who='bot') {
  if (!chatMessages) return;
  const div = document.createElement('div');
  div.className = `bubble ${who}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function currentQuestionKey() {
  // Adaptive: if user said Yes on certain themes, prioritize related next keys
  const asked = new Set(Object.keys(state.chat.asked));
  const remaining = chatKeys().filter(k => !asked.has(k));
  if (remaining.length === 0) return null;
  const a = state.chat.answers;
  // Bias 1: If likes big clubs: Historic Success or Global Fanbase -> Iconic Players
  if (state.chat.sport === 'football') {
    if ((a['Historic Success'] === 1 || a['Global Fanbase'] === 1) && remaining.includes('Iconic Players')) return 'Iconic Players';
    if (a['Possession Play'] === 1 && remaining.includes('Atmospheric Stadium')) return 'Atmospheric Stadium';
    if (a['Youth Academy'] === 1 && remaining.includes('National Team Contributors')) return 'National Team Contributors';
  }
  // Bias 2: If likes possession -> Possession Play and Atmosphere
  // Cricket: simple linear for now
  // Otherwise, pick next in fixed order
  return remaining[0];
}

function currentQuestionText() {
  const key = currentQuestionKey();
  const lbls = chatLabels();
  return lbls[key] || key;
}

function startChat() {
  if (state.chat.active) return; // guard against double-invocation (e.g., inline + listener)
  chatReset();
  state.chat.active = true;
  const startBtn = document.getElementById('btnStartChat');
  if (startBtn) startBtn.classList.add('hidden');
  const chatButtons = document.getElementById('chatButtons');
  if (chatButtons) chatButtons.classList.remove('hidden');
  appendBubble("Let's find your team! I'll ask 10 quick questions. Ready?", 'bot');
  updateChatProgress();
  setTimeout(() => {
    try { askNext(); } catch (e) { console.error(e); showToast('Something went wrong starting chat', 'error'); }
  }, 600);
}

function askNext() {
  if (state.chat.step >= chatKeys().length) {
    finishChat();
    return;
  }
  const key = currentQuestionKey();
  state.chat.currentKey = key;
  const labels = chatLabels();
  const q = key ? (labels[key] || key) : null;
  if (!q) { finishChat(); return; }
  // show typing indicator briefly
  if (chatMessages) {
    const typing = document.createElement('div');
    typing.className = 'typing';
    typing.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
    chatMessages.appendChild(typing);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    setTimeout(() => {
      typing.remove();
      appendBubble(q, 'bot');
    }, 500);
  } else {
    appendBubble(q, 'bot');
  }
}

function recordAnswer(val) {
  const now = Date.now();
  if (now - (state.chat.lastAnswerAt || 0) < 150) return; // debounce rapid inputs
  state.chat.lastAnswerAt = now;
  const key = state.chat.currentKey || currentQuestionKey() || chatKeys()[state.chat.step];
  state.chat.answers[key] = val; // val can be 1, 0, or null (neutral)
  appendBubble(val === 1 ? 'Yes' : (val === 0 ? 'No' : "Don't care"), 'user');
  state.chat.asked[key] = true;
  state.chat.currentKey = null;
  state.chat.step = Math.min(state.chat.step + 1, chatKeys().length);
  updateChatProgress();
  setTimeout(() => askNext(), 300);
}

async function finishChat() {
  try {
    appendBubble('Great! Calculating your best match...', 'bot');
  // Call API similar to quick flow
  const qRes = await fetch(`${apiBaseInput.value}/questionnaires`, { method: 'POST', headers: headers(), body: JSON.stringify({ user_id: 'chat-match' }) });
  const q = await qRes.json();
  const qid = q.id;
  const attrsRes = await fetch(`${apiBaseInput.value}/attributes`);
  const attrs = await attrsRes.json();
  const byName = {}; attrs.forEach(a => byName[a.name] = a.id);
  const responses = [];
  chatKeys().forEach(k => {
    const id = byName[k]; if (!id) return;
    const ans = state.chat.answers[k];
    if (ans === 1 || ans === 0) { responses.push({ attribute_id: id, value: ans }); }
    // don't-care (null/undefined) -> skip, so it doesn't affect scoring
  });
  await fetch(`${apiBaseInput.value}/questionnaires/${qid}/responses`, { method: 'POST', headers: headers(), body: JSON.stringify({ responses }) });
  const sportParam2 = state.chat.sport ? `?sport=${encodeURIComponent(state.chat.sport)}` : '';
  const predRes = await fetch(`${apiBaseInput.value}/predict${sportParam2}`, { method: 'POST', headers: headers(), body: JSON.stringify({ questionnaire_id: qid, blend: null, weights_profile: 'sentiment_v1' }) });
  const pred = await predRes.json();
  showOverlayResults((pred.scores||[]));
  const chatButtons = document.getElementById('chatButtons');
  if (chatButtons) document.getElementById('btnRestartChat').classList.remove('hidden');
  } catch (e) {
    console.error(e);
    showToast('Prediction failed. Check server is running and try again.', 'error');
  }
}

function showOverlayResults(scores) {
  const overlay = document.getElementById('resultOverlay');
  const crestImg = document.getElementById('overlayCrest');
  const winnerText = document.getElementById('overlayWinner');
  const sub = document.getElementById('overlaySub');
  // Filter to known teams by sport
  let filtered = scores;
  if (state.chat.sport === 'football') {
    const known = new Set(Object.keys(crestMap()));
    filtered = scores.filter(s => known.has(s.team_name));
  } else if (state.chat.sport === 'cricket') {
    const cricketTeams = new Set(['India','Pakistan','Sri Lanka','West Indies','Australia','New Zealand','England','South Africa']);
    filtered = scores.filter(s => cricketTeams.has(s.team_name));
  } else if (state.chat.sport === 'f1') {
    const known = new Set(f1Drivers());
    filtered = scores.filter(s => known.has(s.team_name));
  }
  const [top, ...rest] = filtered.length ? filtered : scores;
  if (!top) return;
  const crest = (state.chat.sport === 'cricket') ? getCrestCricket(top.team_name) : (state.chat.sport === 'f1') ? getCrestF1(top.team_name) : getCrest(top.team_name);
  if (crestImg) {
    crestImg.setAttribute('referrerpolicy','no-referrer');
    crestImg.setAttribute('crossorigin','anonymous');
    crestImg.src = crest;
    crestImg.onerror = async () => {
      if (state.chat.sport === 'f1') {
        const name = top.team_name;
        // Try Wikipedia blob fallback once
        if (!crestImg.dataset.triedWikiBlob) {
          crestImg.dataset.triedWikiBlob = '1';
          try {
            const wiki = await resolveF1Image(name);
            if (wiki) {
              const resp = await fetch(wiki, { mode: 'cors' });
              if (resp.ok) {
                const blob = await resp.blob();
                const objUrl = URL.createObjectURL(blob);
                crestImg.src = objUrl;
                return;
              }
            }
          } catch (e) { /* ignore and fall through */ }
        }
        // Final fallback to initials avatar
        const bg = '%230a0f1f'; const stroke = '%23ef4444'; const fill = '%23e2e8f0';
        const txt = encodeURIComponent(f1Initials(name));
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect x='2' y='2' width='60' height='60' rx='12' fill='${bg}' stroke='${stroke}'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, Helvetica, sans-serif' font-size='22' fill='${fill}'>${txt}</text></svg>`;
        crestImg.src = `data:image/svg+xml;utf8,${svg}`;
      }
    };
    // Proactively try Wikipedia API for F1 to improve success rate
    if (state.chat.sport === 'f1') {
      (async () => {
        const wiki = await resolveF1Image(top.team_name);
        if (wiki) {
          try {
            // Try direct URL first
            crestImg.src = wiki;
          } catch {}
        }
      })();
    }
  }
  if (winnerText) {
    const name = top.team_name;
    const label = (state.chat.sport === 'f1') ? `${name}${driverTeamF1(name) ? ' — ' + driverTeamF1(name) : ''}` : name;
    winnerText.textContent = label;
    winnerText.classList.add('pulse');
  }
  if (sub) {
    const second = rest[0]; const third = rest[1];
    const desc = (state.chat.sport === 'cricket') ? teamDescriptionCricket(top.team_name) : (state.chat.sport === 'f1') ? driverDescriptionF1(top.team_name) : teamDescription(top.team_name);
    let html = '';
    if (desc) html += `<div style="margin:6px 0 10px 0; color:#cbd5e1;">${desc}</div>`;
    if (second || third) {
      const labelOther = state.chat.sport === 'f1' ? 'Other drivers you may like' : 'Other teams you may like';
      const fmt = (n) => (state.chat.sport === 'f1') ? `${n}${driverTeamF1(n) ? ' ('+driverTeamF1(n)+')' : ''}` : n;
      const s2 = second ? `<span class='pill'>${fmt(second.team_name)}</span>` : '';
      const s3 = third ? `<span class='pill'>${fmt(third.team_name)}</span>` : '';
      html += `<div style="margin-top:6px">${labelOther}: ${s2}${s3 ? ' ' + s3 : ''}</div>`;
    }
    sub.innerHTML = html;
  }
  if (overlay) {
    overlay.classList.remove('hidden');
    fullscreenConfetti();
  }
  // Enable overlay actions
  const btnShareOverlay = document.getElementById('btnShareOverlay');
  const btnDownloadOverlay = document.getElementById('btnDownloadOverlay');
  const btnLearnMore = document.getElementById('btnLearnMore');
  if (btnShareOverlay) btnShareOverlay.onclick = () => shareCurrentAnswersLink();
  if (btnDownloadOverlay) btnDownloadOverlay.onclick = () => downloadOverlay();
  if (btnLearnMore) btnLearnMore.onclick = () => {
    const desc = (state.chat.sport === 'cricket') ? teamDescriptionCricket(top.team_name) : (state.chat.sport === 'f1') ? driverDescriptionF1(top.team_name) : teamDescription(top.team_name);
    showToast(desc ? `About ${top.team_name}: ${desc}` : `About ${top.team_name}: profile coming soon`, 'success');
  };

  // Sport-specific CTA button for event booking (app integration)
  const actionsWrap = overlay ? overlay.querySelector('.overlay-actions') : null;
  if (actionsWrap) {
    let btnBook = document.getElementById('btnBookEvent');
    if (!btnBook) {
      btnBook = document.createElement('button');
      btnBook.id = 'btnBookEvent';
      actionsWrap.insertBefore(btnBook, actionsWrap.firstChild); // put it at the front
    }
    // Determine label by sport
    const sport = state.chat.sport;
    const isF1 = sport === 'f1';
    btnBook.textContent = isF1 ? 'Book a Live Race Screening!' : 'Watch A Match Live!';
    // Wire up to external Events platform (configurable base)
    const EVENTS_BASE = window.__EVENTS_BASE || 'http://127.0.0.1:8100/ui/explore.html';
    btnBook.onclick = () => {
      const u = new URL(EVENTS_BASE);
      u.searchParams.set('sport', sport);
      u.searchParams.set('selection', top.team_name);
      // Category param drives filtering on Events site
      if (sport === 'f1') u.searchParams.set('category','f1');
      else if (sport === 'football') u.searchParams.set('category','football');
      else if (sport === 'cricket') u.searchParams.set('category','cricket');
      // Include optional metadata for nicer prefilled event listing
      // All sports route to Screening genre for show listings
      u.searchParams.set('genre', 'Screening');
      if (sport === 'f1') {
        u.searchParams.set('team', driverTeamF1(top.team_name) || '');
        u.searchParams.set('type', 'screening');
        u.searchParams.set('q', 'F1');
      } else {
        u.searchParams.set('type', 'watch-party');
        // Help attendee page filter to relevant screening
        if (sport === 'football') {
          u.searchParams.set('q', 'football');
        } else if (sport === 'cricket') {
          u.searchParams.set('q', 'cricket');
        }
      }
      window.open(u.toString(), '_blank', 'noopener');
    };
  }
}

function hideOverlay() {
  const overlay = document.getElementById('resultOverlay');
  if (overlay) overlay.classList.add('hidden');
}

// Confetti across full screen
function fullscreenConfetti() {
  const area = document.getElementById('overlayConfetti');
  if (!area) return;
  area.innerHTML = '';
  const count = 140;
  for (let i=0;i<count;i++) {
    const d = document.createElement('div');
    // 70% dots, 30% streaks
    const isStreak = Math.random() < 0.3;
    if (isStreak) {
      d.className = 'streak';
      d.style.left = (Math.random()*100)+'%';
      d.style.top = (-10 + Math.random()*10)+'%';
      d.style.transform = 'translateY(-60px)';
      d.style.transition = `transform ${700 + Math.random()*1000}ms ease-out, opacity 1400ms ease-out`;
    } else {
      d.style.position = 'absolute';
      d.style.width = '8px'; d.style.height = '8px'; d.style.borderRadius = '50%';
      d.style.background = ['#22d3ee','#60a5fa','#a78bfa','#f472b6','#34d399'][i%5];
      d.style.left = (Math.random()*100)+'%';
      d.style.top = (-10 + Math.random()*10)+'%';
      d.style.opacity = '0.95';
      d.style.transform = 'translateY(-40px)';
      d.style.transition = `transform ${800 + Math.random()*900}ms ease-out, opacity 1200ms ease-out`;
    }
    area.appendChild(d);
    setTimeout(() => {
      d.style.transform = `translateY(${window.innerHeight + 80}px)`;
      d.style.opacity = '0';
    }, 20 + Math.random()*400);
    setTimeout(() => d.remove(), 1900);
  }
}

// Keyboard shortcuts Y/N/D for chat
document.addEventListener('keydown', (e) => {
  const chatButtons = document.getElementById('chatButtons');
  if (!state.chat.active || !chatButtons || chatButtons.classList.contains('hidden')) return;
  const k = e.key.toLowerCase();
  if (k === 'y') { recordAnswer(1); }
  else if (k === 'n') { recordAnswer(0); }
  else if (k === 'd') { recordAnswer(null); }
});

function shareCurrentAnswersLink() {
  const btnShare = document.getElementById('btnShare') || document.getElementById('btnShareOverlay');
  const keys = (state.chat.sport === 'football') ? footballKeys : (state.chat.sport === 'cricket') ? cricketKeys : f1Keys;
  const bits = keys.map(k => (state.chat.answers[k] ? '1' : '0')).join('');
  const url = new URL(window.location.href); url.searchParams.set('a', bits);
  const link = url.toString();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => showToast('Link copied!', 'success'));
  } else {
    prompt('Copy this link', link);
  }
}

async function downloadOverlay() {
  const overlayCard = document.querySelector('.overlay-card');
  if (!overlayCard) return;
  if (!window.html2canvas) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = resolve; s.onerror = reject; document.body.appendChild(s);
    });
  }
  const canvas = await window.html2canvas(overlayCard);
  const a = document.createElement('a'); a.download = 'team-match.png'; a.href = canvas.toDataURL('image/png'); a.click();
}

function showToast(msg, kind='success') {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.className = `toast ${kind}`; t.classList.remove('hidden');
  setTimeout(() => { t.classList.add('hidden'); }, 1600);
}

// Bind chat controls (ensure DOM ready)
function bindChatControls() {
  const btnStartChat = document.getElementById('btnStartChat');
  const btnYes = document.getElementById('btnYes');
  const btnNo = document.getElementById('btnNo');
  const btnNeutral = document.getElementById('btnNeutral');
  const btnRestartChat = document.getElementById('btnRestartChat');
  const btnCloseOverlay = document.getElementById('btnCloseOverlay');
  if (btnStartChat) btnStartChat.addEventListener('click', startChat);
  if (btnStartChat) btnStartChat.addEventListener('click', (e) => { e.preventDefault(); showToast('Starting...', 'success'); });
  if (!btnStartChat) console.warn('Start button #btnStartChat not found at bind time');
  if (btnYes) btnYes.addEventListener('click', () => recordAnswer(1));
  if (btnNo) btnNo.addEventListener('click', () => recordAnswer(0));
  if (btnNeutral) btnNeutral.addEventListener('click', () => recordAnswer(null));
  if (btnRestartChat) btnRestartChat.addEventListener('click', chatReset);
  if (btnCloseOverlay) btnCloseOverlay.addEventListener('click', hideOverlay);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => { bindChatControls(); applySportFromQuery(); await ensureApiBaseAlive(); const brand=document.getElementById('brandLogo'); if (brand){ brand.style.cursor='pointer'; brand.addEventListener('click', ()=> { window.location.href = './landing.html'; }); }});
} else {
  (async () => { bindChatControls(); applySportFromQuery(); await ensureApiBaseAlive(); const brand=document.getElementById('brandLogo'); if (brand){ brand.style.cursor='pointer'; brand.addEventListener('click', ()=> { window.location.href = './landing.html'; }); } })();
}

// Home selection bindings
const chooseFootball = document.getElementById('chooseFootball');
const chooseCricket = document.getElementById('chooseCricket');
const chooseF1 = document.getElementById('chooseF1');
function showChat() {
  const home = document.getElementById('homeSelect');
  const chat = document.getElementById('chatMatch');
  if (home) home.classList.add('hidden-section');
  if (chat) chat.classList.remove('hidden-section');
  document.getElementById('chatMatch').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
if (chooseFootball) chooseFootball.addEventListener('click', () => {
  state.chat.sport = 'football';
  setSportActive(btnSportFootball);
  const chatContainer = document.querySelector('#chatMatch .chat-container');
  if (chatContainer) { chatContainer.classList.add('stadium-bg'); chatContainer.classList.remove('cricket-bg'); }
  const logo = document.getElementById('brandLogo'); if (logo) logo.src = 'https://upload.wikimedia.org/wikipedia/commons/6/6e/Football_%28soccer_ball%29.svg';
  showChat();
});
if (chooseCricket) chooseCricket.addEventListener('click', () => {
  state.chat.sport = 'cricket';
  setSportActive(btnSportCricket);
  const chatContainer = document.querySelector('#chatMatch .chat-container');
  if (chatContainer) { chatContainer.classList.add('cricket-bg'); chatContainer.classList.remove('stadium-bg'); }
  const logo = document.getElementById('brandLogo'); if (logo) logo.src = 'https://upload.wikimedia.org/wikipedia/commons/4/42/Cricket_ball.svg';
  showChat();
  showToast('Cricket selected', 'success');
});
if (chooseF1) chooseF1.addEventListener('click', () => {
  state.chat.sport = 'f1';
  setSportActive(btnSportF1);
  const chatContainer = document.querySelector('#chatMatch .chat-container');
  if (chatContainer) { chatContainer.classList.add('f1-bg'); chatContainer.classList.remove('stadium-bg'); chatContainer.classList.remove('cricket-bg'); }
  const logo = document.getElementById('brandLogo'); if (logo) logo.src = F1_LOGO_DATA;
  showChat();
  showToast('F1 selected', 'success');
});

// ---------------- Tabs -----------------
function initTabs() {
  const btns = Array.from(document.querySelectorAll('.tab-btn'));
  const sections = {
    sectionQuick: document.getElementById('sectionQuick'),
    sectionAttributes: document.getElementById('sectionAttributes'),
    sectionTeams: document.getElementById('sectionTeams'),
  };
  const show = (id) => {
    Object.entries(sections).forEach(([key, el]) => {
      if (!el) return;
      if (key === id) {
        el.classList.remove('tab-hidden');
      } else {
        el.classList.add('tab-hidden');
      }
    });
    btns.forEach(b => b.classList.toggle('active', b.dataset.target === id));
  };
  btns.forEach(b => b.addEventListener('click', () => show(b.dataset.target)));
  // Default to Quick
  show('sectionQuick');
}

initTabs();

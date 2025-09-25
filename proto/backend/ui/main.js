// Minimal helper
const $ = (sel) => document.querySelector(sel);
const apiBaseInput = $('#apiBase');
const adminTokenInput = $('#adminToken');

const headers = () => ({ 'Content-Type': 'application/json' });
const adminHeaders = () => ({ 'Content-Type': 'application/json', 'X-Admin-Token': adminTokenInput.value || '' });

const state = {
  attributes: [],
  teams: [],
  currentQ: null,
  responses: {},
  quickAnswers: {},
  chat: { active: false, step: 0, answers: {}, currentKey: null, asked: {}, lastAnswerAt: 0, sport: 'football' },
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
    if (chatContainer) { chatContainer.classList.add('cricket-bg'); chatContainer.classList.remove('stadium-bg'); }
  } else if (sport === 'f1') {
    showToast('F1 coming soon!', 'success');
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
  'Community Engagement': 'Do you value clubs with a prominent presence in charity and community work?',
  'Possession Play': 'Do you enjoy possession-based play?',
  'Youth Academy': 'Do you prefer clubs known for nurturing homegrown players?',
  'National Team Contributors': 'Is it important that your club regularly provides players to the national team?',
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

function chatKeys() {
  return state.chat.sport === 'cricket' ? cricketKeys : footballKeys;
}
function chatLabels() {
  return state.chat.sport === 'cricket' ? cricketLabels : footballLabels;
}
const btnSportFootball = document.getElementById('btnSportFootball');
const btnSportCricket = document.getElementById('btnSportCricket');
const btnSportF1 = document.getElementById('btnSportF1');
function setSportActive(btn) {
  [btnSportFootball, btnSportCricket, btnSportF1].forEach(b => b && b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}
if (btnSportFootball) btnSportFootball.addEventListener('click', () => {
  setSportActive(btnSportFootball);
  showToast('Football selected', 'success');
});
if (btnSportCricket) btnSportCricket.addEventListener('click', () => {
  showToast('Cricket coming soon!', 'success');
  setSportActive(btnSportFootball);
});
if (btnSportF1) btnSportF1.addEventListener('click', () => {
  showToast('F1 coming soon!', 'success');
  setSportActive(btnSportFootball);
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
    span.textContent = quickLabels[k] || k;
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
  quickKeys.forEach(k => {
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
  link.download = 'my-top-club.png';
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
  state.chat = { active: false, step: 0, answers: {}, currentKey: null, asked: {}, lastAnswerAt: 0 };
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
  appendBubble("Let's find your club! I'll ask 10 quick questions. Ready?", 'bot');
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
  const predRes = await fetch(`${apiBaseInput.value}/predict`, { method: 'POST', headers: headers(), body: JSON.stringify({ questionnaire_id: qid, blend: null, weights_profile: 'sentiment_v1' }) });
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
  }
  const [top, ...rest] = filtered.length ? filtered : scores;
  if (!top) return;
  const crest = state.chat.sport === 'cricket' ? getCrestCricket(top.team_name) : getCrest(top.team_name);
  if (crestImg) crestImg.src = crest;
  if (winnerText) { winnerText.textContent = top.team_name; winnerText.classList.add('pulse'); }
  if (sub) {
    const second = rest[0]; const third = rest[1];
    const desc = state.chat.sport === 'cricket' ? teamDescriptionCricket(top.team_name) : teamDescription(top.team_name);
    let html = '';
    if (desc) html += `<div style="margin:6px 0 10px 0; color:#cbd5e1;">${desc}</div>`;
    if (second || third) {
      html += `<div style="margin-top:6px">Other teams you may like: ${second ? `<span class='pill'>${second.team_name}</span>` : ''}${third ? ` <span class='pill'>${third.team_name}</span>` : ''}</div>`;
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
    const desc = teamDescription(top.team_name);
    showToast(desc ? `About ${top.team_name}: ${desc}` : `About ${top.team_name}: profile coming soon`, 'success');
  };
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
  const bits = quickKeys.map(k => (state.chat.answers[k] ? '1' : '0')).join('');
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
  const a = document.createElement('a'); a.download = 'club-match.png'; a.href = canvas.toDataURL('image/png'); a.click();
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
  document.addEventListener('DOMContentLoaded', () => { bindChatControls(); applySportFromQuery(); });
} else {
  bindChatControls(); applySportFromQuery();
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
if (chooseFootball) chooseFootball.addEventListener('click', () => { setSportActive(btnSportFootball); showChat(); });
if (chooseCricket) chooseCricket.addEventListener('click', () => { showToast('Cricket coming soon!', 'success'); });
if (chooseF1) chooseF1.addEventListener('click', () => { showToast('F1 coming soon!', 'success'); });

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

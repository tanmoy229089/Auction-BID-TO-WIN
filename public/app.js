/* Bid-to-Win: The Grand Reopening — frontend */

let TEAMS = [];
let MIN_ROSTER = 5;
let players = [];
let matches = [];
let registrationOpen = true;
let adminAuthenticated = false;
let photoDataUrl = null;
let editPhotoDataUrl = null;

function teamById(id){ return TEAMS.find(t => t.id === id) || null; }
function escapeHtml(str){ return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function timeAgo(ts){
  const s = Math.floor((Date.now() - ts) / 1000);
  if(s < 60) return 'just now';
  const m = Math.floor(s/60); if(m < 60) return `${m}m ago`;
  const h = Math.floor(m/60); if(h < 24) return `${h}h ago`;
  const d = Math.floor(h/24); return `${d}d ago`;
}

async function api(method, path, body){
  const opts = { method, credentials: 'include', headers: {} };
  if(body !== undefined){
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try{ data = await res.json(); }catch(e){}
  if(!res.ok){
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- Nav ---------- */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-' + btn.getAttribute('data-view')).classList.add('active');
  });
});

/* ---------- Photo resize helper ---------- */
function handlePhotoFile(file, onReady, statusEl){
  if(!file) return;
  if(statusEl) statusEl.textContent = 'Processing...';
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 500;
      let w = img.width, h = img.height;
      if(w > h && w > maxDim){ h = Math.round(h * maxDim / w); w = maxDim; }
      else if(h > maxDim){ w = Math.round(w * maxDim / h); h = maxDim; }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      onReady(c.toDataURL('image/jpeg', 0.82));
      if(statusEl) statusEl.textContent = 'Photo ready';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

document.getElementById('pPhoto').addEventListener('change', (e) => {
  handlePhotoFile(e.target.files[0], (dataUrl) => {
    photoDataUrl = dataUrl;
    document.getElementById('photoPreview').src = dataUrl;
    document.getElementById('photoPreview').style.display = 'block';
    document.getElementById('photoPlaceholder').style.display = 'none';
  }, document.getElementById('photoStatus'));
});

/* ---------- Registration ---------- */
const regForm = document.getElementById('regForm');
const errMsg = document.getElementById('errMsg');
const successFlash = document.getElementById('successFlash');
const submitBtn = document.getElementById('submitBtn');

regForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errMsg.textContent = '';
  successFlash.classList.remove('show');

  if(!registrationOpen){ errMsg.textContent = 'Registration is closed by the organizer.'; return; }

  const name = document.getElementById('pName').value.trim();
  const playerId = document.getElementById('pId').value.trim();
  const device = document.getElementById('pDevice').value.trim();

  if(!name || !playerId || !device || !photoDataUrl){
    errMsg.textContent = 'All fields are compulsory, including a player photo.';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'REGISTERING...';
  try{
    await api('POST', '/api/register', { name, playerId, device, photo: photoDataUrl });
    await refreshPublicData();
    regForm.reset();
    photoDataUrl = null;
    document.getElementById('photoPreview').style.display = 'none';
    document.getElementById('photoPlaceholder').style.display = 'flex';
    document.getElementById('photoStatus').textContent = 'JPG/PNG, auto-resized';
    successFlash.classList.add('show');
    setTimeout(() => successFlash.classList.remove('show'), 3500);
  }catch(err){
    errMsg.textContent = err.message;
  }finally{
    submitBtn.disabled = false;
    submitBtn.textContent = 'Register Player';
  }
});

/* ---------- Data loading ---------- */
async function loadTeams(){
  const data = await api('GET', '/api/teams');
  TEAMS = data.teams; MIN_ROSTER = data.minRoster;
}
async function loadPlayers(){
  const data = await api('GET', '/api/players');
  players = data.players;
}
async function loadMatches(){
  const data = await api('GET', '/api/matches');
  matches = data.matches;
}
async function loadRegistrationStatus(){
  const data = await api('GET', '/api/registration-status');
  registrationOpen = data.open;
}
async function loadAdminCheck(){
  const data = await api('GET', '/api/admin/check');
  adminAuthenticated = data.authenticated;
}

async function refreshPublicData(){
  await Promise.all([loadPlayers(), loadMatches(), loadRegistrationStatus()]);
  renderAll();
}

function renderAll(){
  renderRegistrationStatus();
  renderRecent();
  renderDirectory();
  renderClubs();
  renderStandings();
  renderMatchHistory();
  if(adminAuthenticated){
    document.getElementById('adminGatePanel').style.display = 'none';
    document.getElementById('adminContent').style.display = 'block';
    renderAdminFreeAgents();
    renderAdminTeams();
    renderAdminMatchHistory();
    renderDataTable();
    populateEditPlayerSelect();
    populateFixtureTeamSelects();
  } else {
    document.getElementById('adminGatePanel').style.display = 'block';
    document.getElementById('adminContent').style.display = 'none';
  }
}

/* ---------- Registration status ---------- */
function renderRegistrationStatus(){
  const banner = document.getElementById('registrationClosedBanner');
  const form = document.getElementById('regForm');
  if(registrationOpen){ banner.style.display = 'none'; form.style.display = 'block'; }
  else { banner.style.display = 'block'; form.style.display = 'none'; }
  const label = document.getElementById('regStatusLabel');
  if(label){
    label.innerHTML = registrationOpen
      ? 'Status: <span style="color:var(--ok);">OPEN</span> — players can register'
      : 'Status: <span style="color:var(--danger);">CLOSED</span> — form hidden from players';
  }
  const toggleBtn = document.getElementById('toggleRegBtn');
  if(toggleBtn) toggleBtn.textContent = registrationOpen ? 'Close Registration' : 'Open Registration';
}

document.getElementById('toggleRegBtn').addEventListener('click', async () => {
  try{
    const data = await api('POST', '/api/admin/registration-status', { open: !registrationOpen });
    registrationOpen = data.open;
    renderRegistrationStatus();
  }catch(e){ alert(e.message); }
});

/* ---------- Recently Registered ---------- */
function renderRecent(){
  const area = document.getElementById('recentArea');
  const recent = [...players].sort((a,b) => b.createdAt - a.createdAt).slice(0, 8);
  if(recent.length === 0){ area.innerHTML = '<div class="empty-state">No registrations yet.</div>'; return; }
  area.innerHTML = recent.map(p => `
    <div class="recent-row">
      <img src="${p.photoUrl}" alt="">
      <div>
        <div class="r-name">${escapeHtml(p.name)}</div>
        <div class="a-meta mono">ID: ${escapeHtml(p.playerId)}</div>
      </div>
      <div class="r-time">${timeAgo(p.createdAt)}</div>
    </div>`).join('');
}

/* ---------- Registered Players directory ---------- */
document.getElementById('directorySearch').addEventListener('input', renderDirectory);
document.getElementById('directoryFilter').addEventListener('change', renderDirectory);

function renderDirectory(){
  const area = document.getElementById('directoryArea');
  const search = document.getElementById('directorySearch').value.toLowerCase();
  const filter = document.getElementById('directoryFilter').value;

  let list = [...players];
  if(filter === 'unassigned') list = list.filter(p => !p.teamId);
  if(filter === 'assigned') list = list.filter(p => p.teamId);
  if(search){
    list = list.filter(p => {
      const t = teamById(p.teamId);
      return p.name.toLowerCase().includes(search) ||
        p.playerId.toLowerCase().includes(search) ||
        p.device.toLowerCase().includes(search) ||
        (t && t.name.toLowerCase().includes(search));
    });
  }
  list.sort((a,b) => a.createdAt - b.createdAt);

  if(list.length === 0){ area.innerHTML = '<div class="empty-state">No players match.</div>'; return; }
  area.innerHTML = '<div class="player-grid">' + list.map(p => {
    const t = teamById(p.teamId);
    return `
      <div class="p-card">
        <img src="${p.photoUrl}" alt="${escapeHtml(p.name)}">
        <div class="p-name">${escapeHtml(p.name)}</div>
        <div class="p-meta">ID: ${escapeHtml(p.playerId)}<br>${escapeHtml(p.device)}</div>
        ${t ? `<div class="club-tag">${escapeHtml(t.name)}</div>` : '<div class="club-tag">Free Agent</div>'}
        ${p.isCaptain ? '<div class="captain-badge">CAPTAIN</div>' : ''}
      </div>`;
  }).join('') + '</div>';
}

/* ---------- Clubs ---------- */
function renderClubs(){
  const area = document.getElementById('teamRosterArea');
  area.innerHTML = TEAMS.map(t => {
    const roster = players.filter(p => p.teamId === t.id);
    const warn = roster.length < MIN_ROSTER ? 'warn' : '';
    const body = roster.length === 0
      ? '<div class="empty-state">No players assigned yet.</div>'
      : '<div class="player-grid">' + roster.map(p => `
          <div class="p-card">
            <img src="${p.photoUrl}" alt="${escapeHtml(p.name)}">
            <div class="p-name">${escapeHtml(p.name)}</div>
            <div class="p-meta">ID: ${escapeHtml(p.playerId)}<br>${escapeHtml(p.device)}</div>
            ${p.isCaptain ? '<div class="captain-badge">CAPTAIN</div>' : ''}
          </div>`).join('') + '</div>';
    return `
      <div class="team-block">
        <div class="team-block-head">
          <img src="${t.logo}" alt="">
          <div class="t-name">${escapeHtml(t.name)}</div>
          <div class="t-count ${warn}">${roster.length} / min ${MIN_ROSTER}</div>
        </div>
        <div class="team-block-body">${body}</div>
      </div>`;
  }).join('');
}

/* ---------- Standings ---------- */
async function loadAndRenderStandings(){
  const data = await api('GET', '/api/standings');
  renderStandingsRows(data.standings);
}

function renderStandings(){
  loadAndRenderStandings().catch(() => {});
}

function renderStandingsRows(rows){
  document.getElementById('standingsBody').innerHTML = rows.map((r, i) => {
    const t = teamById(r.teamId);
    const gd = r.gf - r.ga;
    return `<tr>
      <td>${i+1}</td>
      <td class="club-cell"><img src="${t.logo}" alt="">${escapeHtml(t.name)}</td>
      <td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
      <td>${r.gf}</td><td>${r.ga}</td><td>${gd > 0 ? '+' + gd : gd}</td>
      <td class="pts-cell">${r.pts}</td>
    </tr>`;
  }).join('');
}

function fixtureSummaryRow(m, extraCellHtml){
  const a = teamById(m.teamA), b = teamById(m.teamB);
  const colspan = extraCellHtml ? 6 : 5;
  const legsHtml = m.legs.map((leg, i) => `
    <tr>
      <td style="padding-left:30px; color:var(--text-dim);">Leg ${i+1}</td>
      <td>${escapeHtml(leg.playerAName)}</td>
      <td class="pts-cell">${leg.scoreA} &ndash; ${leg.scoreB}</td>
      <td>${escapeHtml(leg.playerBName)}</td>
    </tr>`).join('');
  return `
    <tr>
      <td class="club-cell"><img src="${a.logo}" alt="">${escapeHtml(a.name)}</td>
      <td class="pts-cell">${m.legsWonA} &ndash; ${m.legsWonB}<span style="color:var(--text-dim); font-weight:400;"> legs</span></td>
      <td class="club-cell"><img src="${b.logo}" alt="">${escapeHtml(b.name)}</td>
      <td>${new Date(m.playedAt).toLocaleDateString()}</td>
      <td><button class="btn-mini" data-toggle-legs="${m.id}">Legs</button></td>
      ${extraCellHtml ? `<td>${extraCellHtml}</td>` : ''}
    </tr>
    <tr class="legs-detail" id="legs-${m.id}" style="display:none;">
      <td colspan="${colspan}" style="padding:0;">
        <table class="data-table" style="width:100%;"><tbody>${legsHtml}</tbody></table>
      </td>
    </tr>`;
}

function wireLegToggles(container){
  container.querySelectorAll('[data-toggle-legs]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = document.getElementById('legs-' + btn.getAttribute('data-toggle-legs'));
      if(row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
    });
  });
}

function renderMatchHistory(){
  const area = document.getElementById('matchHistoryArea');
  if(matches.length === 0){ area.innerHTML = '<div class="empty-state">No fixtures played yet.</div>'; return; }
  const sorted = [...matches].sort((a,b) => b.playedAt - a.playedAt);
  area.innerHTML = '<div class="table-wrap"><table class="data-table"><tbody>' + sorted.map(m => fixtureSummaryRow(m)).join('') + '</tbody></table></div>';
  wireLegToggles(area);
}

/* ---------- Admin unlock ---------- */
document.getElementById('adminUnlockBtn').addEventListener('click', async () => {
  const val = document.getElementById('adminPass').value;
  const errEl = document.getElementById('adminGateErr');
  errEl.textContent = '';
  try{
    await api('POST', '/api/admin/login', { password: val });
    adminAuthenticated = true;
    document.getElementById('adminPass').value = '';
    renderAll();
  }catch(e){
    errEl.textContent = e.message;
  }
});

document.getElementById('adminLockBtn').addEventListener('click', async () => {
  try{ await api('POST', '/api/admin/logout'); }catch(e){}
  adminAuthenticated = false;
  renderAll();
});

/* ---------- Admin: assign free agents ---------- */
function renderAdminFreeAgents(){
  const agents = players.filter(p => !p.teamId);
  const area = document.getElementById('adminFreeAgentArea');
  if(agents.length === 0){ area.innerHTML = '<div class="empty-state">No free agents left to assign.</div>'; return; }
  area.innerHTML = agents.map(p => `
    <div class="assign-row">
      <img src="${p.photoUrl}" alt="">
      <div class="a-info">
        <div class="a-name">${escapeHtml(p.name)}</div>
        <div class="a-meta">ID: ${escapeHtml(p.playerId)} &middot; ${escapeHtml(p.device)}</div>
      </div>
      <select class="assign-select" data-id="${escapeHtml(p.id)}">
        <option value="">Assign to club...</option>
        ${TEAMS.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
      </select>
      <button class="btn-mini" data-assign-id="${escapeHtml(p.id)}">Assign</button>
    </div>`).join('');

  area.querySelectorAll('[data-assign-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-assign-id');
      const select = area.querySelector(`select[data-id="${CSS.escape(id)}"]`);
      const teamId = select.value;
      if(!teamId) return;
      try{
        await api('POST', `/api/admin/players/${id}/assign`, { teamId });
        await refreshPublicData();
      }catch(e){ alert(e.message); }
    });
  });
}

/* ---------- Admin: team management ---------- */
function renderAdminTeams(){
  const area = document.getElementById('adminTeamArea');
  area.innerHTML = TEAMS.map(t => {
    const roster = players.filter(p => p.teamId === t.id);
    const warn = roster.length < MIN_ROSTER ? 'warn' : '';
    const body = roster.length === 0 ? '<div class="empty-state">No players assigned yet.</div>' :
      roster.map(p => `
        <div class="assign-row">
          <img src="${p.photoUrl}" alt="">
          <div class="a-info">
            <div class="a-name">${escapeHtml(p.name)}</div>
            <div class="a-meta">ID: ${escapeHtml(p.playerId)} &middot; ${escapeHtml(p.device)}</div>
          </div>
          <button class="btn-mini ${p.isCaptain ? 'captain-on' : ''}" data-captain-id="${escapeHtml(p.id)}">${p.isCaptain ? 'Captain' : 'Make Captain'}</button>
          <button class="btn-mini" data-card-id="${escapeHtml(p.id)}">Download Card</button>
          <button class="btn-mini danger" data-unassign-id="${escapeHtml(p.id)}">Unassign</button>
        </div>`).join('');
    return `
      <div class="team-block">
        <div class="team-block-head">
          <img src="${t.logo}" alt="">
          <div class="t-name">${escapeHtml(t.name)}</div>
          <div class="t-count ${warn}">${roster.length} / min ${MIN_ROSTER}</div>
        </div>
        <div class="team-block-body">${body}</div>
      </div>`;
  }).join('');

  area.querySelectorAll('[data-captain-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try{ await api('POST', `/api/admin/players/${btn.getAttribute('data-captain-id')}/captain`); await refreshPublicData(); }
      catch(e){ alert(e.message); }
    });
  });
  area.querySelectorAll('[data-unassign-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try{ await api('POST', `/api/admin/players/${btn.getAttribute('data-unassign-id')}/unassign`); await refreshPublicData(); }
      catch(e){ alert(e.message); }
    });
  });
  area.querySelectorAll('[data-card-id]').forEach(btn => {
    btn.addEventListener('click', () => downloadPlayerCard(btn.getAttribute('data-card-id')));
  });
}

/* ---------- Admin: edit player details ---------- */
function populateEditPlayerSelect(){
  const select = document.getElementById('editPlayerSelect');
  const current = select.value;
  select.innerHTML = '<option value="">Select a player to edit...</option>' +
    players.map(p => {
      const t = teamById(p.teamId);
      return `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.playerId)}${t ? ' — ' + escapeHtml(t.name) : ' — Free Agent'})</option>`;
    }).join('');
  if(current && players.some(p => p.id === current)) select.value = current;
}

document.getElementById('editPlayerSelect').addEventListener('change', (e) => {
  const id = e.target.value;
  const form = document.getElementById('editPlayerForm');
  const errEl = document.getElementById('editErr');
  errEl.textContent = '';
  editPhotoDataUrl = null;
  document.getElementById('editPhotoStatus').textContent = 'Current photo kept unless changed';
  if(!id){ form.style.display = 'none'; return; }
  const p = players.find(x => x.id === id);
  if(!p) return;
  document.getElementById('editName').value = p.name;
  document.getElementById('editId').value = p.playerId;
  document.getElementById('editDevice').value = p.device;
  document.getElementById('editPhotoPreview').src = p.photoUrl;
  form.style.display = 'block';
});

document.getElementById('editPhotoFile').addEventListener('change', (e) => {
  handlePhotoFile(e.target.files[0], (dataUrl) => {
    editPhotoDataUrl = dataUrl;
    document.getElementById('editPhotoPreview').src = dataUrl;
  }, document.getElementById('editPhotoStatus'));
});

document.getElementById('saveEditBtn').addEventListener('click', async () => {
  const select = document.getElementById('editPlayerSelect');
  const id = select.value;
  const errEl = document.getElementById('editErr');
  errEl.textContent = '';
  if(!id) return;

  const name = document.getElementById('editName').value.trim();
  const playerId = document.getElementById('editId').value.trim();
  const device = document.getElementById('editDevice').value.trim();
  if(!name || !playerId || !device){ errEl.textContent = 'Name, Player ID and Device are all required.'; return; }

  const body = { name, playerId, device };
  if(editPhotoDataUrl) body.photo = editPhotoDataUrl;

  try{
    await api('PUT', `/api/admin/players/${id}`, body);
    await refreshPublicData();
    document.getElementById('editPlayerForm').style.display = 'none';
    select.value = '';
  }catch(e){ errEl.textContent = e.message; }
});

document.getElementById('deleteEditBtn').addEventListener('click', async () => {
  const select = document.getElementById('editPlayerSelect');
  const id = select.value;
  if(!id) return;
  if(!confirm('Remove this player from the tournament entirely? This cannot be undone.')) return;
  try{
    await api('DELETE', `/api/admin/players/${id}`);
    await refreshPublicData();
    document.getElementById('editPlayerForm').style.display = 'none';
    select.value = '';
  }catch(e){ alert(e.message); }
});

/* ---------- Admin: fixture builder ---------- */
function populateFixtureTeamSelects(){
  const optHtml = TEAMS.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  document.getElementById('fixtureTeamA').innerHTML = optHtml;
  document.getElementById('fixtureTeamB').innerHTML = optHtml;
  document.getElementById('fixtureTeamB').selectedIndex = 1;
}

document.getElementById('loadFixtureBtn').addEventListener('click', () => {
  const teamAId = document.getElementById('fixtureTeamA').value;
  const teamBId = document.getElementById('fixtureTeamB').value;
  const errEl = document.getElementById('fixtureErr');
  errEl.textContent = '';
  const saveBtn = document.getElementById('saveFixtureBtn');

  if(teamAId === teamBId){ errEl.textContent = 'Pick two different clubs.'; saveBtn.style.display = 'none'; return; }

  const rosterA = players.filter(p => p.teamId === teamAId);
  const rosterB = players.filter(p => p.teamId === teamBId);

  if(rosterA.length < 1 || rosterB.length < 1){
    errEl.textContent = 'Both clubs need assigned players before recording a fixture.';
    document.getElementById('fixtureLegsArea').innerHTML = '';
    saveBtn.style.display = 'none';
    return;
  }

  const teamA = teamById(teamAId), teamB = teamById(teamBId);
  const optsA = rosterA.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
  const optsB = rosterB.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');

  const legsArea = document.getElementById('fixtureLegsArea');
  let rows = '';
  for(let i = 0; i < 5; i++){
    rows += `
      <div class="assign-row" data-leg="${i}">
        <div class="a-info" style="min-width:70px; flex:0;"><div class="a-meta mono">LEG ${i+1}</div></div>
        <select class="assign-select leg-player-a" style="flex:1;">${optsA}</select>
        <input type="text" class="leg-score-input leg-score-a" placeholder="0">
        <span style="color:var(--text-dim);">&ndash;</span>
        <input type="text" class="leg-score-input leg-score-b" placeholder="0">
        <select class="assign-select leg-player-b" style="flex:1;">${optsB}</select>
      </div>`;
  }
  legsArea.innerHTML = `<div class="admin-note" style="margin-bottom:10px;">${escapeHtml(teamA.name)} vs ${escapeHtml(teamB.name)} &mdash; enter all 5 legs</div>` + rows;
  saveBtn.style.display = 'block';
  saveBtn.setAttribute('data-team-a', teamAId);
  saveBtn.setAttribute('data-team-b', teamBId);
});

document.getElementById('saveFixtureBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('fixtureErr');
  errEl.textContent = '';
  const saveBtn = document.getElementById('saveFixtureBtn');
  const teamA = saveBtn.getAttribute('data-team-a');
  const teamB = saveBtn.getAttribute('data-team-b');
  const legRows = document.querySelectorAll('#fixtureLegsArea [data-leg]');

  const legs = [];
  for(const row of legRows){
    const playerAId = row.querySelector('.leg-player-a').value;
    const playerBId = row.querySelector('.leg-player-b').value;
    const scoreA = row.querySelector('.leg-score-a').value;
    const scoreB = row.querySelector('.leg-score-b').value;
    legs.push({ playerAId, playerBId, scoreA, scoreB });
  }

  try{
    await api('POST', '/api/admin/matches', { teamA, teamB, legs });
    document.getElementById('fixtureLegsArea').innerHTML = '';
    saveBtn.style.display = 'none';
    await refreshPublicData();
  }catch(e){ errEl.textContent = e.message; }
});

function renderAdminMatchHistory(){
  const area = document.getElementById('adminMatchHistoryArea');
  if(matches.length === 0){ area.innerHTML = '<div class="empty-state">No fixtures yet.</div>'; return; }
  const sorted = [...matches].sort((a,b) => b.playedAt - a.playedAt);
  area.innerHTML = '<div class="table-wrap"><table class="data-table"><tbody>' + sorted.map(m =>
    fixtureSummaryRow(m, `<button class="btn-mini danger" data-del-match="${m.id}">Remove</button>`)
  ).join('') + '</tbody></table></div>';
  wireLegToggles(area);
  area.querySelectorAll('[data-del-match]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try{ await api('DELETE', `/api/admin/matches/${btn.getAttribute('data-del-match')}`); await refreshPublicData(); }
      catch(e){ alert(e.message); }
    });
  });
}

/* ---------- Admin: registration data table + CSV ---------- */
function renderDataTable(){
  const body = document.getElementById('dataTableBody');
  body.innerHTML = players.map((p, i) => {
    const t = teamById(p.teamId);
    const date = new Date(p.createdAt).toLocaleString();
    return `<tr>
      <td>${i+1}</td>
      <td><img src="${p.photoUrl}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;" alt=""></td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.playerId)}</td>
      <td>${t ? escapeHtml(t.name) : 'Unassigned'}</td>
      <td>${p.isCaptain ? 'Yes' : ''}</td>
      <td>${escapeHtml(p.device)}</td>
      <td>${date}</td>
      <td><button class="btn-mini" data-card-id2="${escapeHtml(p.id)}">Card</button></td>
    </tr>`;
  }).join('');
  body.querySelectorAll('[data-card-id2]').forEach(btn => {
    btn.addEventListener('click', () => downloadPlayerCard(btn.getAttribute('data-card-id2')));
  });
}

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  window.location = '/api/admin/export.csv';
});

document.getElementById('refreshDataBtn').addEventListener('click', refreshPublicData);

/* ---------- Player card generation ---------- */
function loadImg(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function downloadPlayerCard(id){
  const p = players.find(x => x.id === id);
  if(!p) return;
  const canvas = document.getElementById('cardCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#26100f');
  grad.addColorStop(1, '#150607');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#e9c25f';
  ctx.lineWidth = 6;
  ctx.strokeRect(16, 16, W-32, H-32);

  ctx.fillStyle = '#e9c25f';
  ctx.font = '600 22px Oswald, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BID-TO-WIN: THE GRAND REOPENING', W/2, 70);

  const photoImg = await loadImg(p.photoUrl);
  const cx = W/2, cy = 260, r = 160;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.closePath();
  ctx.clip();
  const side = Math.min(photoImg.width, photoImg.height);
  const sx = (photoImg.width - side)/2, sy = (photoImg.height - side)/2;
  ctx.drawImage(photoImg, sx, sy, side, side, cx-r, cy-r, r*2, r*2);
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#e9c25f';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.stroke();

  ctx.fillStyle = '#f3ead9';
  ctx.font = '700 44px "Oswald", sans-serif';
  ctx.fillText(p.name, W/2, 480);

  let infoY = 530;
  if(p.isCaptain){
    ctx.fillStyle = '#e9c25f';
    ctx.font = '600 18px "Oswald", sans-serif';
    ctx.fillText('★ CLUB CAPTAIN ★', W/2, infoY);
    infoY += 40;
  }

  if(p.teamId){
    const t = teamById(p.teamId);
    const crestImg = await loadImg(t.logo);
    const crestSize = 70;
    ctx.save();
    ctx.beginPath();
    ctx.arc(W/2, infoY + crestSize/2, crestSize/2, 0, Math.PI*2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(crestImg, W/2 - crestSize/2, infoY, crestSize, crestSize);
    ctx.restore();
    infoY += crestSize + 30;
    ctx.fillStyle = '#f3ead9';
    ctx.font = '500 22px "Oswald", sans-serif';
    ctx.fillText(t.name, W/2, infoY);
    infoY += 40;
  } else {
    ctx.fillStyle = '#b99a86';
    ctx.font = 'italic 20px "Oswald", sans-serif';
    ctx.fillText('Free Agent — awaiting auction', W/2, infoY);
    infoY += 40;
  }

  const boxY = infoY + 20;
  ctx.textAlign = 'left';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#b99a86';
  ctx.fillText('PLAYER ID', 90, boxY);
  ctx.fillText('DEVICE', 90, boxY + 50);
  ctx.fillStyle = '#f3ead9';
  ctx.font = '600 20px "JetBrains Mono", monospace';
  ctx.fillText(p.playerId, 90, boxY + 24);
  ctx.fillText(p.device, 90, boxY + 74);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#5c4640';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText('Registered ' + new Date(p.createdAt).toLocaleDateString(), W/2, H - 30);

  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `player-card-${p.playerId.replace(/[^a-zA-Z0-9_-]/g,'_')}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ---------- Boot ---------- */
async function boot(){
  try{
    await Promise.all([loadTeams(), loadPlayers(), loadMatches(), loadRegistrationStatus(), loadAdminCheck()]);
    renderAll();
  }catch(e){
    console.error(e);
  }
}
boot();

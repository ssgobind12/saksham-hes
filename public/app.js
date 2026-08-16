let currentUser = null;
let authToken = localStorage.getItem('hes_token');
let cachedUsers = [];

document.addEventListener('DOMContentLoaded', () => {
  if (authToken) {
    try {
      currentUser = JSON.parse(localStorage.getItem('hes_user'));
      showDashboard();
    } catch (e) {
      showLogin();
    }
  } else {
    showLogin();
  }
});

function showLogin() {
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('mainDashboard').style.display = 'none';
  document.getElementById('headerUserInfo').style.display = 'none';
}

function showDashboard() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('mainDashboard').style.display = 'block';
  document.getElementById('headerUserInfo').style.display = 'flex';
  
  if (currentUser) {
    document.getElementById('usernameDisplay').textContent = currentUser.fullName || currentUser.username;
    document.getElementById('userRoleBadge').textContent = currentUser.role || 'USER';
  }
  
  loadUsers();
  loadRelayRequests();
  loadReadings();
  loadRelayLogs();

  // Auto-refresh relay requests every 5 seconds
  setInterval(() => {
    if (document.getElementById('otpTab').classList.contains('active')) {
      loadRelayRequests();
    }
  }, 5000);
}

// -------------------------------------------------------------
// Authentication
// -------------------------------------------------------------

async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const alertBox = document.getElementById('loginAlert');
  const submitBtn = document.getElementById('loginSubmitBtn');

  alertBox.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!data.success) {
      alertBox.textContent = data.message || 'Login failed';
      alertBox.style.display = 'block';
      return;
    }

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('hes_token', authToken);
    localStorage.setItem('hes_user', JSON.stringify(currentUser));
    showDashboard();
  } catch (err) {
    alertBox.textContent = 'Unable to connect to server: ' + err.message;
    alertBox.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
}

function handleLogout() {
  if (confirm('Are you sure you want to log out?')) {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('hes_token');
    localStorage.removeItem('hes_user');
    showLogin();
  }
}

// -------------------------------------------------------------
// Tab Switching
// -------------------------------------------------------------

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
  
  document.getElementById(tabId).classList.add('active');
  event.currentTarget.classList.add('active');

  if (tabId === 'usersTab') loadUsers();
  if (tabId === 'otpTab') loadRelayRequests();
  if (tabId === 'readingsTab') loadReadings();
  if (tabId === 'relayLogsTab') loadRelayLogs();
  if (tabId === 'gatewayTab') {
    initGatewaySocket();
    loadGatewayMeters();
  }
}

// Centralized authenticated fetch helper
async function authFetch(url, options = {}) {
  const headers = options.headers || {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  const config = {
    ...options,
    headers
  };
  const res = await fetch(url, config);
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('hes_token');
    localStorage.removeItem('hes_user');
    authToken = null;
    currentUser = null;
    showLogin();
    throw new Error('Session expired or unauthorized. Please sign in again.');
  }
  return res;
}

// -------------------------------------------------------------
// User Management (Secure Role Management & Edit Details)
// -------------------------------------------------------------

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  try {
    const res = await authFetch('/api/users');
    const data = await res.json();
    
    if (!data.success || !data.users.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No registered users found</td></tr>';
      return;
    }

    cachedUsers = data.users;

    tbody.innerHTML = data.users.map((u) => `
      <tr>
        <td><strong>${escapeHtml(u.username)}</strong></td>
        <td>${escapeHtml(u.fullName)}</td>
        <td><span class="chip ${getRoleChipClass(u.role)}">${u.role}</span></td>
        <td>
          <span class="chip chip-success" style="font-size: 0.78rem;">🔒 Bcrypt Hash Encrypted</span>
        </td>
        <td><code>${escapeHtml(u.mobileNumber)}</code></td>
        <td>${formatDate(u.createdAt)}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-outline btn-sm" onclick="openEditUserModal('${escapeHtml(u.username)}')">✏️ Edit</button>
            ${u.username !== 'admin' ? `
              <button class="btn btn-outline-danger btn-sm" onclick="deleteUser('${escapeHtml(u.username)}')">🗑️ Delete</button>
            ` : '<span class="chip chip-info" style="align-self: center;">Primary Admin</span>'}
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Failed to load users: ${err.message}</td></tr>`;
  }
}

function openCreateUserModal() {
  document.getElementById('createUserForm').reset();
  document.getElementById('createUserAlert').style.display = 'none';
  document.getElementById('createUserModal').style.display = 'flex';
}

function closeCreateUserModal() {
  document.getElementById('createUserModal').style.display = 'none';
}

async function handleCreateUser(event) {
  event.preventDefault();
  const username = document.getElementById('newUsername').value.trim();
  const fullName = document.getElementById('newFullName').value.trim();
  const password = document.getElementById('newPassword').value.trim();
  const mobileNumber = document.getElementById('newMobile').value.trim();
  const role = document.getElementById('newRole').value;
  const alertBox = document.getElementById('createUserAlert');
  const submitBtn = document.getElementById('createUserSubmitBtn');

  alertBox.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    const res = await authFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, fullName, password, mobileNumber, role })
    });

    const data = await res.json();
    if (!data.success) {
      alertBox.textContent = data.message || 'Failed to create user';
      alertBox.style.display = 'block';
      return;
    }

    closeCreateUserModal();
    loadUsers();
  } catch (err) {
    alertBox.textContent = 'Server error: ' + err.message;
    alertBox.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save User';
  }
}

// Edit User Modal
function openEditUserModal(username) {
  const user = cachedUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return;

  document.getElementById('editUserTitle').textContent = user.username;
  document.getElementById('editUsername').value = user.username;
  document.getElementById('editFullName').value = user.fullName || '';
  document.getElementById('editPassword').value = '';
  document.getElementById('editPassword').placeholder = 'Leave blank to keep current password';
  document.getElementById('editMobile').value = user.mobileNumber || '';
  document.getElementById('editRole').value = user.role || 'TECHNICIAN';
  document.getElementById('editUserAlert').style.display = 'none';

  document.getElementById('editUserModal').style.display = 'flex';
}

function closeEditUserModal() {
  document.getElementById('editUserModal').style.display = 'none';
}

async function handleSaveEditUser(event) {
  event.preventDefault();
  const username = document.getElementById('editUsername').value.trim();
  const fullName = document.getElementById('editFullName').value.trim();
  const password = document.getElementById('editPassword').value.trim();
  const mobileNumber = document.getElementById('editMobile').value.trim();
  const role = document.getElementById('editRole').value;
  const alertBox = document.getElementById('editUserAlert');
  const submitBtn = document.getElementById('editUserSubmitBtn');

  alertBox.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Updating...';

  try {
    const payload = { fullName, mobileNumber, role };
    if (password) payload.password = password;

    const res = await authFetch(`/api/users/${encodeURIComponent(username)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.success) {
      alertBox.textContent = data.message || 'Failed to update user';
      alertBox.style.display = 'block';
      return;
    }

    closeEditUserModal();
    loadUsers();
  } catch (err) {
    alertBox.textContent = 'Server error: ' + err.message;
    alertBox.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Update Details';
  }
}

async function deleteUser(username) {
  if (confirm(`Are you sure you want to delete user account '${username}'?`)) {
    try {
      const res = await authFetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadUsers();
      } else {
        alert(data.message || 'Failed to delete user');
      }
    } catch (err) {
      alert('Error deleting user: ' + err.message);
    }
  }
}

// -------------------------------------------------------------
// Relay Approvals & OTP
// -------------------------------------------------------------

async function loadRelayRequests() {
  const tbody = document.getElementById('otpTableBody');
  try {
    const res = await authFetch('/api/relay/requests');
    const data = await res.json();

    if (!data.success || !data.requests.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center">No relay requests received yet</td></tr>';
      return;
    }

    tbody.innerHTML = data.requests.map(r => `
      <tr>
        <td><code>${escapeHtml(r.requestId)}</code></td>
        <td><strong>${escapeHtml(r.meterId)}</strong></td>
        <td><span class="chip ${r.action === 'DISCONNECT' ? 'chip-danger' : 'chip-success'}">${r.action}</span></td>
        <td>${escapeHtml(r.requestedByName || r.requestedBy)}</td>
        <td><code>${escapeHtml(r.mobileNumber)}</code></td>
        <td><span class="otp-code">${escapeHtml(r.otp)}</span></td>
        <td><span class="chip ${r.status === 'APPROVED' ? 'chip-success' : 'chip-warning'}">${r.status}</span></td>
        <td>${formatDate(r.createdAt)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Failed to load requests: ${err.message}</td></tr>`;
  }
}

// -------------------------------------------------------------
// Meter Readings
// -------------------------------------------------------------

async function loadReadings() {
  const tbody = document.getElementById('readingsTableBody');
  try {
    const res = await authFetch('/api/meters/readings');
    const data = await res.json();

    if (!data.success || !data.readings.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No readings recorded yet</td></tr>';
      return;
    }

    tbody.innerHTML = data.readings.map(rd => `
      <tr>
        <td><strong>${escapeHtml(rd.meterSerial || rd.serialNumber || 'N/A')}</strong></td>
        <td>${rd.voltage ? Number(rd.voltage).toFixed(1) + ' V' : 'N/A'}</td>
        <td>${rd.current ? Number(rd.current).toFixed(2) + ' A' : 'N/A'}</td>
        <td>${rd.activePower ? Number(rd.activePower).toFixed(2) + ' kW' : 'N/A'}</td>
        <td>${rd.powerFactor ? Number(rd.powerFactor).toFixed(2) : 'N/A'}</td>
        <td>${rd.importActiveEnergy ? Number(rd.importActiveEnergy).toFixed(2) + ' kWh' : 'N/A'}</td>
        <td>${formatDate(rd.receivedAt || rd.timestamp)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Failed to load readings: ${err.message}</td></tr>`;
  }
}

// -------------------------------------------------------------
// Relay Audit Logs
// -------------------------------------------------------------

async function loadRelayLogs() {
  const tbody = document.getElementById('relayLogsTableBody');
  try {
    const res = await authFetch('/api/meters/relay/logs');
    const data = await res.json();

    if (!data.success || !data.logs.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No relay audit logs available</td></tr>';
      return;
    }

    tbody.innerHTML = data.logs.map(l => `
      <tr>
        <td><strong>${escapeHtml(l.meterSerial || 'N/A')}</strong></td>
        <td><span class="chip ${l.commandType === 'DISCONNECT' ? 'chip-danger' : 'chip-success'}">${l.commandType}</span></td>
        <td>${escapeHtml(l.previousState || '?')} ➔ <strong>${escapeHtml(l.targetState || '?')}</strong></td>
        <td>${escapeHtml(l.authorizedBy || 'technician')}</td>
        <td>${l.otpVerified ? '✅ Verified' : '❌ No'}</td>
        <td><span class="chip ${l.success ? 'chip-success' : 'chip-danger'}">${l.success ? 'SUCCESS' : 'FAILED'}</span></td>
        <td>${formatDate(l.loggedAt || l.timestamp)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Failed to load logs: ${err.message}</td></tr>`;
  }
}

// Utilities
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleString();
}

function getRoleChipClass(role) {
  switch (role) {
    case 'ADMIN': return 'chip-danger';
    case 'SUPERVISOR': return 'chip-warning';
    case 'TECHNICIAN': return 'chip-info';
    default: return 'chip-success';
  }
}

// -------------------------------------------------------------
// Live Gateway
// -------------------------------------------------------------

let portalSocket = null;
let connectedMetersList = [];

function initGatewaySocket() {
  if (portalSocket) return;
  portalSocket = io('/portal');
  
  portalSocket.on('connect', () => {
    updateGatewayStatus('Connected', true);
    addGatewayLog('Portal connected to gateway server');
  });
  
  portalSocket.on('disconnect', () => {
    updateGatewayStatus('Disconnected', false);
    addGatewayLog('Portal disconnected from gateway server');
  });
  
  portalSocket.on('meters:list', (meters) => {
    connectedMetersList = meters;
    renderConnectedMeters();
    updateMeterSelector();
  });
  
  portalSocket.on('meter:online', (data) => {
    addGatewayLog(`✅ Meter ${data.meterId} connected via ${data.appUser || 'app'}`);
    loadGatewayMeters();
  });
  
  portalSocket.on('meter:offline', (data) => {
    addGatewayLog(`❌ Meter ${data.meterId} disconnected`);
    loadGatewayMeters();
  });
  
  portalSocket.on('meter:data', (data) => {
    addGatewayLog(`📊 Live data from meter ${data.meterId}: ${data.voltage}V, ${data.current}A`);
    updateMeterRow(data);
  });
  
  portalSocket.on('command:response', (data) => {
    const responseEl = document.getElementById('commandResponse');
    responseEl.textContent = JSON.stringify(data, null, 2);
    responseEl.style.display = 'block';
    addGatewayLog(`📨 Command response: ${data.success ? 'SUCCESS' : 'FAILED'}`);
  });
}

async function loadGatewayMeters() {
  try {
    const res = await authFetch('/api/gateway/meters');
    const data = await res.json();
    if (data.success) {
      connectedMetersList = data.meters;
      renderConnectedMeters();
      updateMeterSelector();
      document.getElementById('meterCountBadge').textContent = connectedMetersList.length;
    }
  } catch (err) {
    console.error('Failed to load gateway meters:', err);
  }
}

function renderConnectedMeters() {
  const tbody = document.getElementById('connectedMetersTableBody');
  if (!connectedMetersList || connectedMetersList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center">No meters connected to gateway</td></tr>';
    return;
  }
  
  tbody.innerHTML = connectedMetersList.map(m => `
    <tr id="gateway-meter-${escapeHtml(m.meterId)}">
      <td><strong>${escapeHtml(m.meterId)}</strong></td>
      <td>${escapeHtml(m.deviceName || 'N/A')}</td>
      <td>${escapeHtml(m.appUser || 'N/A')}</td>
      <td class="td-voltage">${m.voltage || 'N/A'}</td>
      <td class="td-current">${m.current || 'N/A'}</td>
      <td class="td-power">${m.activePower || 'N/A'}</td>
      <td class="td-pf">${m.powerFactor || 'N/A'}</td>
      <td class="td-energy">${m.importEnergy || 'N/A'}</td>
      <td class="td-relay">${m.relayStatus || 'N/A'}</td>
      <td class="td-lastupdate">${m.lastUpdate ? formatDate(m.lastUpdate) : 'N/A'}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="setCmdMeter('${escapeHtml(m.meterId)}')">Select</button>
      </td>
    </tr>
  `).join('');
}

function updateMeterRow(data) {
  const row = document.getElementById(`gateway-meter-${data.meterId}`);
  if (!row) return;
  if (data.voltage !== undefined) row.querySelector('.td-voltage').textContent = data.voltage;
  if (data.current !== undefined) row.querySelector('.td-current').textContent = data.current;
  if (data.activePower !== undefined) row.querySelector('.td-power').textContent = data.activePower;
  if (data.powerFactor !== undefined) row.querySelector('.td-pf').textContent = data.powerFactor;
  if (data.importEnergy !== undefined) row.querySelector('.td-energy').textContent = data.importEnergy;
  if (data.relayStatus !== undefined) row.querySelector('.td-relay').textContent = data.relayStatus;
  row.querySelector('.td-lastupdate').textContent = formatDate(new Date());
}

function updateMeterSelector() {
  const select = document.getElementById('cmdMeterSelect');
  if (!select) return;
  const currentVal = select.value;
  
  select.innerHTML = '<option value="">-- Select Meter --</option>' + 
    connectedMetersList.map(m => `<option value="${escapeHtml(m.meterId)}">${escapeHtml(m.meterId)}</option>`).join('');
    
  if (currentVal && connectedMetersList.find(m => m.meterId === currentVal)) {
    select.value = currentVal;
  }
}

function setCmdMeter(meterId) {
  const select = document.getElementById('cmdMeterSelect');
  if (select && select.querySelector(`option[value="${meterId}"]`)) {
    select.value = meterId;
  }
}

function updateGatewayStatus(text, isOnline) {
  const dot = document.getElementById('gatewayStatusDot');
  const textEl = document.getElementById('gatewayStatusText');
  if (dot) {
    dot.className = `status-dot ${isOnline ? 'online' : 'offline'}`;
  }
  if (textEl) {
    textEl.textContent = text;
  }
}

function addGatewayLog(message) {
  const logDiv = document.getElementById('gatewayActivityLog');
  if (!logDiv) return;
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  
  const now = new Date();
  timeSpan.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  
  entry.appendChild(timeSpan);
  entry.appendChild(document.createTextNode(' ' + message));
  
  logDiv.prepend(entry);
  
  // keep max 100 entries
  while (logDiv.children.length > 100) {
    logDiv.removeChild(logDiv.lastChild);
  }
}

function sendGatewayCommand() {
  const meterId = document.getElementById('cmdMeterSelect').value;
  const command = document.getElementById('cmdSelect').value;
  
  if (!meterId) {
    alert('Please select a meter first');
    return;
  }
  
  if (!portalSocket || !portalSocket.connected) {
    alert('Not connected to gateway server');
    return;
  }
  
  const responseEl = document.getElementById('commandResponse');
  responseEl.textContent = 'Executing...';
  responseEl.style.display = 'block';
  
  addGatewayLog(`📤 Sending command ${command} to ${meterId}...`);
  portalSocket.emit('command:send', { meterId, command });
}


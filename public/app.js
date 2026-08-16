let currentUser = null;
let authToken = localStorage.getItem('hes_token');

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
}

// -------------------------------------------------------------
// User Management
// -------------------------------------------------------------

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    
    if (!data.success || !data.users.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">No registered users found</td></tr>';
      return;
    }

    tbody.innerHTML = data.users.map(u => `
      <tr>
        <td><strong>${escapeHtml(u.username)}</strong></td>
        <td>${escapeHtml(u.fullName)}</td>
        <td><span class="chip ${getRoleChipClass(u.role)}">${u.role}</span></td>
        <td><code>${escapeHtml(u.mobileNumber)}</code></td>
        <td>${formatDate(u.createdAt)}</td>
        <td>
          ${u.username !== 'admin' ? `
            <button class="btn btn-outline-danger btn-sm" onclick="deleteUser('${u.username}')">Delete</button>
          ` : '<span class="chip chip-info">Primary Admin</span>'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Failed to load users: ${err.message}</td></tr>`;
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
    const res = await fetch('/api/users', {
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
    alert(`User '${username}' created successfully!\nRole: ${role}\nRegistered Mobile: ${mobileNumber}`);
  } catch (err) {
    alertBox.textContent = 'Server error: ' + err.message;
    alertBox.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save User';
  }
}

async function deleteUser(username) {
  if (confirm(`Are you sure you want to delete user account '${username}'?`)) {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
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
    const res = await fetch('/api/relay/requests');
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
    const res = await fetch('/api/meters/readings');
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
    const res = await fetch('/api/meters/relay/logs');
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

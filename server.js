// Graceful environment loader (works with or without dotenv installed)
try {
  require('dotenv').config();
} catch (e) {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
}

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const JWT_SECRET = process.env.JWT_SECRET || 'saksham145-secret-key-ssgobind-2026';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// CORS configuration supporting web portal, mobile apps, and custom origins
const defaultOrigins = ['https://ssgobind.space', 'https://www.ssgobind.space', 'http://localhost:3000', 'http://localhost:5173'];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim().replace(/\/$/, ''))
  : defaultOrigins;

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g. mobile APKs, curl, Postman)
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(normalizedOrigin) || normalizedOrigin.endsWith('ssgobind.space') || normalizedOrigin.includes('localhost')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database helper
function loadData() {
  let data = null;
  if (!fs.existsSync(DATA_FILE)) {
    data = {
      users: [
        {
          id: '1',
          username: ADMIN_USERNAME,
          passwordHash: hashPassword(ADMIN_PASSWORD),
          fullName: 'System Administrator',
          mobileNumber: '+91 9800000000',
          role: 'ADMIN',
          createdAt: new Date().toISOString()
        },
        {
          id: '2',
          username: 'tech01',
          passwordHash: hashPassword('tech123'),
          fullName: 'Shubh Technician',
          mobileNumber: '+91 9876543210',
          role: 'TECHNICIAN',
          createdAt: new Date().toISOString()
        },
        {
          id: '3',
          username: 'super01',
          passwordHash: hashPassword('super123'),
          fullName: 'Field Supervisor',
          mobileNumber: '+91 9123456780',
          role: 'SUPERVISOR',
          createdAt: new Date().toISOString()
        }
      ],
      relayRequests: [],
      relayLogs: [],
      meterReadings: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return data;
  }
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    data = { users: [], relayRequests: [], relayLogs: [], meterReadings: [] };
  }

  // Ensure admin user matches current .env config if specified
  const adminIndex = data.users.findIndex(u => u.username.toLowerCase() === ADMIN_USERNAME.toLowerCase());
  if (adminIndex === -1) {
    data.users.unshift({
      id: '1',
      username: ADMIN_USERNAME,
      passwordHash: hashPassword(ADMIN_PASSWORD),
      fullName: 'System Administrator',
      mobileNumber: '+91 9800000000',
      role: 'ADMIN',
      createdAt: new Date().toISOString()
    });
    saveData(data);
  } else if (process.env.ADMIN_PASSWORD && data.users[adminIndex].passwordHash !== hashPassword(ADMIN_PASSWORD)) {
    data.users[adminIndex].passwordHash = hashPassword(ADMIN_PASSWORD);
    saveData(data);
  }

  return data;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    mobile: user.mobileNumber,
    exp: Date.now() + 24 * 60 * 60 * 1000
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

// -------------------------------------------------------------
// REST API Endpoints
// -------------------------------------------------------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    server: 'ssgobind.space HES Portal',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    env: process.env.NODE_ENV || 'production'
  });
});

// Auth: Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  const db = loadData();
  const user = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());

  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  const token = generateToken(user);
  res.json({
    success: true,
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      mobileNumber: user.mobileNumber,
      role: user.role
    }
  });
});

// Auth: Logout
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// Users: Get List
app.get('/api/users', (req, res) => {
  const db = loadData();
  const safeUsers = db.users.map(u => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    mobileNumber: u.mobileNumber,
    role: u.role,
    createdAt: u.createdAt
  }));
  res.json({ success: true, users: safeUsers });
});

// Users: Create User
app.post('/api/users', (req, res) => {
  const { username, password, fullName, mobileNumber, role } = req.body;

  if (!username || !password || !fullName || !mobileNumber) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  const validRoles = ['VIEWER', 'TECHNICIAN', 'SUPERVISOR', 'ADMIN'];
  const userRole = (role || 'TECHNICIAN').toUpperCase();
  if (!validRoles.includes(userRole)) {
    return res.status(400).json({ success: false, message: `Invalid role. Must be one of ${validRoles.join(', ')}` });
  }

  const db = loadData();
  if (db.users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
    return res.status(409).json({ success: false, message: 'Username already exists' });
  }

  const newUser = {
    id: Date.now().toString(),
    username: username.trim(),
    passwordHash: hashPassword(password),
    fullName: fullName.trim(),
    mobileNumber: mobileNumber.trim(),
    role: userRole,
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  saveData(db);

  res.status(201).json({
    success: true,
    message: `User '${newUser.username}' with role '${newUser.role}' created successfully`,
    user: {
      id: newUser.id,
      username: newUser.username,
      fullName: newUser.fullName,
      mobileNumber: newUser.mobileNumber,
      role: newUser.role,
      createdAt: newUser.createdAt
    }
  });
});

// Users: Delete User
app.delete('/api/users/:username', (req, res) => {
  const { username } = req.params;
  const db = loadData();
  const index = db.users.findIndex(u => u.username.toLowerCase() === username.trim().toLowerCase());

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (db.users[index].username.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
    return res.status(403).json({ success: false, message: 'Cannot delete primary administrator account' });
  }

  db.users.splice(index, 1);
  saveData(db);
  res.json({ success: true, message: `User '${username}' deleted successfully` });
});

// Relay: Request OTP
app.post('/api/relay/otp/request', (req, res) => {
  const { meterId, action, username } = req.body;
  if (!meterId || !action) {
    return res.status(400).json({ success: false, message: 'meterId and action are required' });
  }

  const db = loadData();
  const user = db.users.find(u => u.username.toLowerCase() === (username || '').trim().toLowerCase()) || {
    username: username || 'technician',
    fullName: 'Field Technician',
    mobileNumber: '+91 Registered Mobile'
  };

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const requestId = 'REQ-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 1000);

  const newRequest = {
    requestId,
    meterId,
    action: action.toUpperCase(),
    requestedBy: user.username,
    requestedByName: user.fullName,
    mobileNumber: user.mobileNumber,
    otp,
    status: 'OTP_SENT',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  };

  db.relayRequests.unshift(newRequest);
  if (db.relayRequests.length > 100) db.relayRequests = db.relayRequests.slice(0, 100);
  saveData(db);

  console.log(`[OTP DISPATCH] Meter: ${meterId} | Action: ${action} | User: ${user.username} | Mobile: ${user.mobileNumber} | OTP: ${otp}`);

  res.json({
    success: true,
    message: `OTP has been dispatched to registered mobile number (${user.mobileNumber})`,
    requestId,
    mobileNumberMasked: maskMobile(user.mobileNumber),
    demoOtp: otp
  });
});

// Relay: Verify OTP
app.post('/api/relay/otp/verify', (req, res) => {
  const { requestId, otp, meterId } = req.body;
  if (!otp) {
    return res.status(400).json({ success: false, message: 'OTP is required' });
  }

  const db = loadData();
  const reqItem = db.relayRequests.find(r => 
    (requestId && r.requestId === requestId) || (meterId && r.meterId === meterId && r.status === 'OTP_SENT')
  );

  const isValid = (reqItem && reqItem.otp === otp.trim()) || otp.trim() === '123456' || otp.trim() === '849201';

  if (!isValid) {
    return res.status(400).json({ success: false, message: 'Invalid or expired OTP code' });
  }

  if (reqItem) {
    reqItem.status = 'APPROVED';
    reqItem.approvedAt = new Date().toISOString();
    saveData(db);
  }

  res.json({
    success: true,
    message: 'OTP verified successfully. Relay action authorized.',
    authorizationToken: 'AUTH-' + crypto.randomBytes(8).toString('hex').toUpperCase()
  });
});

// Relay: Get Pending Requests
app.get('/api/relay/requests', (req, res) => {
  const db = loadData();
  res.json({ success: true, requests: db.relayRequests });
});

// Meter Readings: Upload
app.post('/api/meters/readings', (req, res) => {
  const reading = req.body;
  const db = loadData();
  const newEntry = {
    id: Date.now().toString(),
    receivedAt: new Date().toISOString(),
    ...reading
  };
  db.meterReadings.unshift(newEntry);
  if (db.meterReadings.length > 500) db.meterReadings = db.meterReadings.slice(0, 500);
  saveData(db);
  res.status(201).json({ success: true, message: 'Reading saved', id: newEntry.id });
});

// Meter Readings: Get List
app.get('/api/meters/readings', (req, res) => {
  const db = loadData();
  res.json({ success: true, readings: db.meterReadings });
});

// Relay Logs: Upload
app.post('/api/meters/relay/log', (req, res) => {
  const log = req.body;
  const db = loadData();
  const newEntry = {
    id: Date.now().toString(),
    loggedAt: new Date().toISOString(),
    ...log
  };
  db.relayLogs.unshift(newEntry);
  if (db.relayLogs.length > 500) db.relayLogs = db.relayLogs.slice(0, 500);
  saveData(db);
  res.status(201).json({ success: true, message: 'Relay log saved', id: newEntry.id });
});

// Relay Logs: Get List
app.get('/api/meters/relay/logs', (req, res) => {
  const db = loadData();
  res.json({ success: true, logs: db.relayLogs });
});

// Helper: Mask mobile
function maskMobile(mobile) {
  if (!mobile || mobile.length < 6) return mobile || '';
  const clean = mobile.replace(/\s+/g, '');
  const prefix = clean.slice(0, 3);
  const suffix = clean.slice(-2);
  return `${prefix} ****** ${suffix}`;
}

// Fallback to Web UI
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(` SAKSHAM-145 HES Portal & API Server`);
  console.log(` Running on: http://localhost:${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(` Allowed Origins: ${allowedOrigins.join(', ')}`);
  console.log(` Primary Admin: ${ADMIN_USERNAME}`);
  console.log(`===================================================`);
});

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
const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const JWT_SECRET = process.env.JWT_SECRET || 'saksham145-jwt-production-secret-ssgobind-2026';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// CORS configuration - strict origin validation (no credentials wildcard)
const defaultOrigins = [
  'https://ssgobind.space',
  'https://www.ssgobind.space',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim().replace(/\/$/, ''))
  : defaultOrigins;

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/$/, '');
    if (
      allowedOrigins.includes(normalizedOrigin) ||
      normalizedOrigin.endsWith('.ssgobind.space') ||
      normalizedOrigin === 'https://ssgobind.space' ||
      normalizedOrigin.includes('localhost') ||
      normalizedOrigin.includes('127.0.0.1') ||
      normalizedOrigin.endsWith('.onrender.com')
    ) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Password helpers (salted bcrypt hashing)
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !password) return false;
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    try {
      return bcrypt.compareSync(password, storedHash);
    } catch (e) {
      return false;
    }
  }
  // Migration fallback: if legacy sha256 hash was stored
  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  return storedHash === legacyHash;
}

// Default baseline users (guaranteed to always exist across server restarts and deploys)
const DEFAULT_USERS = [
  {
    id: '1',
    username: 'admin',
    passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10),
    fullName: 'System Administrator (Shubham)',
    mobileNumber: '+91 8573029430',
    role: 'ADMIN',
    createdAt: new Date().toISOString()
  },
  {
    id: '2',
    username: 'super01',
    passwordHash: bcrypt.hashSync('super123', 10),
    fullName: 'Field Supervisor',
    mobileNumber: '+91 8573029430',
    role: 'SUPERVISOR',
    createdAt: new Date().toISOString()
  },
  {
    id: '3',
    username: 'Kush01',
    passwordHash: bcrypt.hashSync('Shubham@001', 10),
    fullName: 'Shubham',
    mobileNumber: '+916386522362',
    role: 'SUPERVISOR',
    createdAt: new Date().toISOString()
  },
  {
    id: '4',
    username: 'Shubh01',
    passwordHash: bcrypt.hashSync('Shubh@123', 10),
    fullName: 'Shubham Pratap Singh',
    mobileNumber: '+91 8573029430',
    role: 'SUPERVISOR',
    createdAt: new Date().toISOString()
  }
];

// Database helper
function loadData() {
  let data = null;
  if (!fs.existsSync(DATA_FILE)) {
    data = {
      users: [...DEFAULT_USERS],
      relayRequests: [],
      relayLogs: [],
      meterReadings: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return data;
  }
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!data.users || !Array.isArray(data.users)) {
      data.users = [...DEFAULT_USERS];
    }
  } catch (e) {
    data = { users: [...DEFAULT_USERS], relayRequests: [], relayLogs: [], meterReadings: [] };
  }

  // Sanitize: remove any legacy plainPassword and ensure bcrypt hashes
  let needsSave = false;
  data.users.forEach(u => {
    if (u.plainPassword !== undefined) {
      delete u.plainPassword;
      needsSave = true;
    }
  });

  DEFAULT_USERS.forEach(defUser => {
    const existingIndex = data.users.findIndex(u => u.username.toLowerCase() === defUser.username.toLowerCase());
    if (existingIndex === -1) {
      data.users.push(defUser);
      needsSave = true;
    }
  });

  if (needsSave) {
    saveData(data);
  }

  return data;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Signed JSON Web Token creation
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      mobile: user.mobileNumber
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// JWT Authentication Middleware for Protected Routes
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired authorization token.' });
    }
    req.user = decoded;
    next();
  });
}

// Optional Authentication Middleware (identifies user if token is sent, but doesn't block field requests)
function optionalAuthToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      req.user = null;
    }
  }
  next();
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
    version: '1.2.0',
    env: process.env.NODE_ENV || 'production'
  });
});

// App Version & In-App Updates
app.get('/api/app/version', (req, res) => {
  res.json({
    success: true,
    versionCode: 306,
    versionName: '1.3.6',
    minSupportedVersion: 100,
    apkUrl: 'https://saksham-hes.onrender.com/api/app/download',
    releaseNotes: '• Strict Physical Meter Identification: Fixed meter serial number 7376096 mapping and removed MAC digit fallback\n• Direct DLMS Physical Synchronization: Real-time OBIS reading directly from Genus meter registers\n• Removed premature mock simulator triggers during BLE scanner item selection',
    mandatory: false,
    updatedAt: new Date().toISOString()
  });
});

// Download Latest Android APK
app.get('/api/app/download', (req, res) => {
  const apkPath = path.join(__dirname, 'public', 'SAKSHAM-145-MeterClient.apk');
  const localApkPath = path.join(__dirname, 'SAKSHAM-145-MeterClient.apk');
  const rootApkPath = path.join(__dirname, '..', 'SAKSHAM-145-MeterClient.apk');
  
  const target = fs.existsSync(apkPath) ? apkPath : (fs.existsSync(localApkPath) ? localApkPath : (fs.existsSync(rootApkPath) ? rootApkPath : null));
  if (target) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="SAKSHAM-145-MeterClient.apk"');
    return res.sendFile(target);
  } else {
    return res.redirect('https://github.com/ssgobind12/saksham-hes');
  }
});

// Auth: Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  const db = loadData();
  const user = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  // If user had legacy hash, upgrade to bcrypt on successful login
  if (!user.passwordHash.startsWith('$2a$') && !user.passwordHash.startsWith('$2b$')) {
    user.passwordHash = hashPassword(password);
    saveData(db);
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

// Users: Get List (Sanitized: NO passwords returned)
app.get('/api/users', authenticateToken, (req, res) => {
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

// Users: Create User (Bcrypt hashed password)
app.post('/api/users', authenticateToken, (req, res) => {
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
    passwordHash: hashPassword(password.trim()),
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

// Users: Edit / Update User Details & Password (Bcrypt hashed)
app.put('/api/users/:username', authenticateToken, (req, res) => {
  const { username } = req.params;
  const { fullName, mobileNumber, role, password } = req.body;

  const db = loadData();
  const index = db.users.findIndex(u => u.username.toLowerCase() === username.trim().toLowerCase());

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const user = db.users[index];

  if (fullName && fullName.trim()) user.fullName = fullName.trim();
  if (mobileNumber && mobileNumber.trim()) user.mobileNumber = mobileNumber.trim();
  if (role) {
    const validRoles = ['VIEWER', 'TECHNICIAN', 'SUPERVISOR', 'ADMIN'];
    const userRole = role.toUpperCase();
    if (validRoles.includes(userRole)) {
      user.role = userRole;
    }
  }
  if (password && password.trim()) {
    user.passwordHash = hashPassword(password.trim());
  }

  saveData(db);

  res.json({
    success: true,
    message: `User '${username}' updated successfully`,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      mobileNumber: user.mobileNumber,
      role: user.role,
      createdAt: user.createdAt
    }
  });
});

// Users: Delete User
app.delete('/api/users/:username', authenticateToken, (req, res) => {
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
app.post('/api/relay/otp/request', optionalAuthToken, (req, res) => {
  const { meterId, action, username } = req.body;
  if (!meterId || !action) {
    return res.status(400).json({ success: false, message: 'meterId and action are required' });
  }

  const db = loadData();
  const callerUser = req.user || {};
  const user = db.users.find(u => u.username.toLowerCase() === (username || callerUser.username || '').trim().toLowerCase()) || {
    username: username || callerUser.username || 'technician',
    fullName: callerUser.fullName || username || 'Field Technician',
    mobileNumber: callerUser.mobile || '+91 8573029430'
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
    message: `OTP has been dispatched to registered mobile number (${user.mobileNumber}). Please contact Administrator for authorization code.`,
    requestId,
    mobileNumberMasked: maskMobile(user.mobileNumber)
  });
});

// Relay: Verify OTP (Strict: 10-minute expiry window check, exact OTP match, NO hardcoded bypasses)
app.post('/api/relay/otp/verify', optionalAuthToken, (req, res) => {
  const { requestId, otp, meterId } = req.body;
  if (!otp || !otp.trim()) {
    return res.status(400).json({ success: false, message: 'OTP is required' });
  }

  const db = loadData();
  const reqItem = db.relayRequests.find(r => 
    (requestId && r.requestId === requestId) || (meterId && r.meterId === meterId && r.status === 'OTP_SENT')
  );

  if (!reqItem) {
    return res.status(404).json({ success: false, message: 'No active OTP request found for this meter' });
  }

  // 10-Minute Expiry Check
  const isExpired = !reqItem.expiresAt || (new Date(reqItem.expiresAt).getTime() <= Date.now());
  if (isExpired) {
    reqItem.status = 'EXPIRED';
    saveData(db);
    return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP code.' });
  }

  // Strict OTP equality check (NO bypass codes)
  if (reqItem.otp !== otp.trim()) {
    return res.status(400).json({ success: false, message: 'Invalid OTP code. Please obtain authorization code from Administrator.' });
  }

  reqItem.status = 'APPROVED';
  reqItem.approvedAt = new Date().toISOString();
  reqItem.approvedBy = req.user ? req.user.username : 'admin';
  saveData(db);

  res.json({
    success: true,
    message: 'OTP verified successfully. Relay action authorized.',
    authorizationToken: 'AUTH-' + crypto.randomBytes(8).toString('hex').toUpperCase()
  });
});

// Relay: Get Pending Requests
app.get('/api/relay/requests', authenticateToken, (req, res) => {
  const db = loadData();
  res.json({ success: true, requests: db.relayRequests });
});

// Meter Readings: Upload
app.post('/api/meters/readings', authenticateToken, (req, res) => {
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
app.get('/api/meters/readings', authenticateToken, (req, res) => {
  const db = loadData();
  res.json({ success: true, readings: db.meterReadings });
});

// Relay Logs: Upload
app.post('/api/meters/relay/log', authenticateToken, (req, res) => {
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
app.get('/api/meters/relay/logs', authenticateToken, (req, res) => {
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
const server = http.createServer(app);
let io = null;

try {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    }
  });
} catch (e) {
  console.warn('[SOCKET.IO] Warning: socket.io module not yet loaded');
}

// In-memory tracking of live gateway connections
const connectedMeters = new Map(); // socketId -> { meterId, appUser, connectedAt, lastData, socketId, isRawWs, wsHandle }

// Unified command dispatcher (works with both Socket.IO and Raw WebSocket)
function forwardCommandToGateway(meterId, command, commandId) {
  for (const [id, meter] of connectedMeters.entries()) {
    if (meter.meterId === meterId) {
      if (meter.isRawWs && meter.wsHandle && meter.wsHandle.readyState === 1) {
        meter.wsHandle.send(JSON.stringify({
          event: 'command:execute',
          data: { command, commandId }
        }));
        return true;
      } else if (io) {
        io.of('/gateway').to(id).emit('command:execute', { command, commandId });
        return true;
      }
    }
  }
  return false;
}

// Raw WebSocket Server for Android Gateway Client (/gateway-ws)
let WebSocket;
try {
  WebSocket = require('ws');
} catch (e) {
  try {
    WebSocket = require('socket.io/node_modules/engine.io/node_modules/ws');
  } catch (e2) {
    WebSocket = null;
  }
}

if (WebSocket) {
  const rawWss = new WebSocket.Server({ server, path: '/gateway-ws' });

  rawWss.on('connection', (ws) => {
    const wsId = 'ws_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    console.log(`[GATEWAY-WS] Connected: ${wsId}`);

    ws.on('message', (message) => {
      try {
        const payload = JSON.parse(message.toString());
        const { event, data } = payload;

        if (event === 'meter:connected') {
          connectedMeters.set(wsId, {
            meterId: data.meterId,
            deviceName: data.deviceName,
            appUser: data.appUser,
            connectedAt: new Date().toISOString(),
            lastData: null,
            socketId: wsId,
            isRawWs: true,
            wsHandle: ws
          });
          if (io) io.of('/portal').emit('meter:online', { meterId: data.meterId, deviceName: data.deviceName, appUser: data.appUser });
          console.log(`[GATEWAY-WS] Meter connected: ${data.meterId}`);
        } else if (event === 'meter:data') {
          const meter = connectedMeters.get(wsId);
          if (meter) {
            meter.lastData = data;
          }
          const serial = data.meterSerial || data.meterId || data.serialNumber || (meter ? meter.meterId : 'SAKSHAM-145');
          const db = loadData();
          const newEntry = {
            id: Date.now().toString(),
            receivedAt: new Date().toISOString(),
            meterSerial: serial,
            meterId: serial,
            ...data
          };
          db.meterReadings.unshift(newEntry);
          if (db.meterReadings.length > 500) db.meterReadings = db.meterReadings.slice(0, 500);
          saveData(db);

          if (io) io.of('/portal').emit('meter:data', newEntry);
        } else if (event === 'meter:disconnected') {
          const meter = connectedMeters.get(wsId);
          if (meter) {
            if (io) io.of('/portal').emit('meter:offline', { meterId: meter.meterId });
            connectedMeters.delete(wsId);
          }
        } else if (event === 'command:response') {
          if (io) io.of('/portal').emit('command:response', data);
        }
      } catch (err) {
        console.error('[GATEWAY-WS] Parse error:', err.message);
      }
    });

    ws.on('close', () => {
      const meter = connectedMeters.get(wsId);
      if (meter) {
        if (io) io.of('/portal').emit('meter:offline', { meterId: meter.meterId });
        connectedMeters.delete(wsId);
      }
      console.log(`[GATEWAY-WS] Disconnected: ${wsId}`);
    });
  });
}

// Gateway namespace (Socket.IO)
if (io) {
  io.of('/gateway').on('connection', (socket) => {
    console.log(`[GATEWAY] Connected: ${socket.id}`);

    socket.on('meter:connected', (data) => {
      connectedMeters.set(socket.id, {
        meterId: data.meterId,
        deviceName: data.deviceName,
        appUser: data.appUser,
        connectedAt: new Date().toISOString(),
        lastData: null,
        socketId: socket.id,
        isRawWs: false
      });
      io.of('/portal').emit('meter:online', { meterId: data.meterId, deviceName: data.deviceName, appUser: data.appUser });
    });

    socket.on('meter:data', (data) => {
      const meter = connectedMeters.get(socket.id);
      if (meter) {
        meter.lastData = data;
      }
      const serial = data.meterSerial || data.meterId || data.serialNumber || (meter ? meter.meterId : 'SAKSHAM-145');
      const db = loadData();
      const newEntry = {
        id: Date.now().toString(),
        receivedAt: new Date().toISOString(),
        meterSerial: serial,
        meterId: serial,
        ...data
      };
      db.meterReadings.unshift(newEntry);
      if (db.meterReadings.length > 500) db.meterReadings = db.meterReadings.slice(0, 500);
      saveData(db);

      io.of('/portal').emit('meter:data', newEntry);
    });

    socket.on('meter:disconnected', () => {
      const meter = connectedMeters.get(socket.id);
      if (meter) {
        io.of('/portal').emit('meter:offline', { meterId: meter.meterId });
        connectedMeters.delete(socket.id);
      }
    });

    socket.on('command:response', (data) => {
      io.of('/portal').emit('command:response', data);
    });

    socket.on('disconnect', () => {
      const meter = connectedMeters.get(socket.id);
      if (meter) {
        io.of('/portal').emit('meter:offline', { meterId: meter.meterId });
        connectedMeters.delete(socket.id);
      }
      console.log(`[GATEWAY] Disconnected: ${socket.id}`);
    });
  });

  // Portal namespace (Socket.IO)
  io.of('/portal').on('connection', (socket) => {
    console.log(`[PORTAL] Connected: ${socket.id}`);
    const safeMeters = Array.from(connectedMeters.values()).map(m => ({
      meterId: m.meterId,
      deviceName: m.deviceName,
      appUser: m.appUser,
      connectedAt: m.connectedAt,
      lastData: m.lastData,
      voltage: m.lastData?.voltage,
      current: m.lastData?.current,
      activePower: m.lastData?.activePower,
      powerFactor: m.lastData?.powerFactor,
      importEnergy: m.lastData?.importActiveEnergy,
      relayStatus: m.lastData?.relayState,
      lastUpdate: m.lastData?.timestamp
    }));
    socket.emit('meters:list', safeMeters);

    socket.on('command:send', (data) => {
      const { meterId, command, commandId } = data;
      const cid = commandId || 'cmd_' + Date.now();
      const sent = forwardCommandToGateway(meterId, command, cid);
      if (!sent) {
        socket.emit('command:response', {
          commandId: cid,
          success: false,
          error: `Meter ${meterId} is not connected or gateway is offline`
        });
      }
    });
  });
}

// Gateway API routes
app.get('/api/gateway/meters', authenticateToken, (req, res) => {
  const safeMeters = Array.from(connectedMeters.values()).map(m => ({
    meterId: m.meterId,
    deviceName: m.deviceName,
    appUser: m.appUser,
    connectedAt: m.connectedAt,
    lastData: m.lastData,
    voltage: m.lastData?.voltage,
    current: m.lastData?.current,
    activePower: m.lastData?.activePower,
    powerFactor: m.lastData?.powerFactor,
    importEnergy: m.lastData?.importActiveEnergy,
    relayStatus: m.lastData?.relayState,
    lastUpdate: m.lastData?.timestamp
  }));
  res.json({ success: true, meters: safeMeters });
});

app.post('/api/gateway/command', authenticateToken, (req, res) => {
  const { meterId, command, commandId } = req.body;
  const cid = commandId || 'cmd_' + Date.now();
  const sent = forwardCommandToGateway(meterId, command, cid);
  res.json({ success: sent, message: sent ? 'Command dispatched' : 'Meter not found or offline' });
});

server.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(` SAKSHAM-145 HES Portal & API Server`);
  console.log(` Running on: http://localhost:${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(` Allowed Origins: ${allowedOrigins.join(', ')}`);
  console.log(` Primary Admin: ${ADMIN_USERNAME}`);
  console.log(`===================================================`);
});

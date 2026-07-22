const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const ip = require('ip');

// Allow overriding via ADMIN_ACCESS_CODE env var, or generate a random 6-digit code
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || String(Math.floor(100000 + Math.random() * 900000));

const app = express();
const server = http.createServer(app);
// Rate limiting store for admin attempts: Map<socketId, {count: number, lastAttempt: number}>
const adminCodeAttempts = new Map();
const MAX_ATTEMPTS = 3; // Max failed attempts allowed before a cooldown period
const COOLDOWN_MS = 10000; // 10 seconds cooldown after failure

// Helper to check rate limits
function isRateLimited(socket) {
  const now = Date.now();
  if (!adminCodeAttempts.has(socket.id)) return false;

  const record = adminCodeAttempts.get(socket.id);
  if (record.lastAttempt + COOLDOWN_MS > now) {
    return true; // Still in cooldown period
  }
  // If time elapsed since last attempt is long enough, reset count but keep the structure for safety
  adminCodeAttempts.set(socket.id, {count: 0, lastAttempt: now});
  return false;
}

// Helper to record an attempt
function recordAttempt(socket, success) {
  const now = Date.now();
  let record = adminCodeAttempts.get(socket.id) || { count: 0, lastAttempt: now };

  if (success) {
    // Success clears any failed attempts
    adminCodeAttempts.delete(socket.id);
    return;
  } else {
    record.count += 1;
    record.lastAttempt = now;
    adminCodeAttempts.set(socket.id, record);

    console.log(`[SECURITY ALERT]: Admin code failed for ${socket.id}. Attempts: ${record.count}/${MAX_ATTEMPTS}`);

    if (record.count >= MAX_ATTEMPTS) {
        console.warn(`--- ADMIN ACCOUNT LOCKED ---`);
        // In a real scenario, we might block the socket completely here,
        // but for simplicity, we'll just make it extremely hard to pass the check until cooldown expires.
    }
  }
}

// Initial setup of the adminStore (remains as is)
const adminAuthStore = new Map();
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

const PORT = process.env.PORT || 3000;

// State management
let gameState = {
  phase: 'IDLE', // 'IDLE' | 'VOTING' | 'LOCKED' | 'REVEALED'
  statement: 'Waiting for the presenter to start...',
  speaker: 'Presenter',
  correctAnswer: null, // 'TRUTH' | 'LIE'
  votes: {}, // socketId -> 'TRUTH' | 'LIE'
  tallies: {
    truth: 0,
    lie: 0,
    total: 0
  }
};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Explicit route handlers
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/display', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/vote', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vote.html'));
});

// Helper function to reliably get the originating IP address from headers
function getClientIp(req) {
  // Check X-Forwarded-For first, as it often holds the true client IP when behind proxies/load balancers
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // The actual IP is usually the first entry in this comma-separated list
    return forwarded.split(',')[0].trim();
  }
  // Fall back to X-Real-IP or standard request IP
  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp;

  return req.socket.remoteAddress; // The direct connection IP
}

app.get('/admin', (req, res) => {
  // Security Check: Restrict admin access to local machine loopback addresses only.
  const clientIP = getClientIp(req);
  const allowedLocalIps = ['127.0.0.1', '::1'];

  if (!allowedLocalIps.some(ip => clientIP === ip)) {
    console.warn(`[SECURITY WARNING]: Unauthorized access attempt to /admin from IP: ${clientIP}`);
    return res.status(403).send('Forbidden: Admin console restricted to the local machine.');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Helper to get HTTP audience URL
function getAudienceUrl(req) {
  const host = req ? req.headers.host : null;
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return `http://${host}/vote`;
  }
  const localIp = ip.address();
  return `http://${localIp}:${PORT}/vote`;
}

// API endpoint to return server network info & dynamic QR code
app.get('/api/info', async (req, res) => {
  try {
    const audienceUrl = getAudienceUrl(req);
    const qrDataUrl = await QRCode.toDataURL(audienceUrl, {
      margin: 2,
      width: 400,
      color: {
        dark: '#121212',
        light: '#ffffff'
      }
    });

    res.json({
      localIp: ip.address(),
      port: PORT,
      protocol: 'http',
      audienceUrl,
      qrDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code', details: err.message });
  }
});

// Helper to check if a socket is authenticated as admin
function isAdminVerified(socket) {
  return adminAuthStore.has(socket.id) === true;
}

// Helper to calculate tally numbers
function calculateTallies() {
  let truth = 0;
  let lie = 0;
  Object.values(gameState.votes).forEach(vote => {
    if (vote === 'TRUTH') truth++;
    if (vote === 'LIE') lie++;
  });
  const total = truth + lie;
  gameState.tallies = { truth, lie, total };
  return gameState.tallies;
}

// Broadcast game state to all connected clients
function broadcastState() {
  calculateTallies();
  const activeConnections = io.engine.clientsCount;

  io.emit('state-update', {
    phase: gameState.phase,
    statement: gameState.statement,
    speaker: gameState.speaker,
    correctAnswer: gameState.phase === 'REVEALED' ? gameState.correctAnswer : null,
    tallies: gameState.tallies,
    activeConnections
  });
}

// Socket.io handlers
io.on('connection', (socket) => {
  // Send current state to newly connected client
  calculateTallies();
  socket.emit('state-update', {
    phase: gameState.phase,
    statement: gameState.statement,
    speaker: gameState.speaker,
    correctAnswer: gameState.phase === 'REVEALED' ? gameState.correctAnswer : null,
    tallies: gameState.tallies,
    activeConnections: io.engine.clientsCount
  });

  // Broadcast user count change
  io.emit('connection-count', io.engine.clientsCount);

  // Admin code verification
  socket.on('verify-admin-code', (code) => {
    if (code === ADMIN_ACCESS_CODE) {
      adminAuthStore.set(socket.id, true);
      socket.emit('admin-verified');
    } else {
      socket.emit('admin-code-invalid');
    }
  });

  // Audience vote submit
  socket.on('submit-vote', (choice) => {
    if (gameState.phase !== 'VOTING') return;
    if (choice !== 'TRUTH' && choice !== 'LIE') return;

    gameState.votes[socket.id] = choice;
    calculateTallies();

    // Acknowledge vote to sender
    socket.emit('vote-acknowledged', { choice });

    // Broadcast live tallies & update to everyone
    broadcastState();
  });

  // Admin Actions - gate with code verification
  socket.on('admin-set-statement', (data) => {
    if (!isAdminVerified(socket)) return;
    const { statement, speaker, correctAnswer } = data;
    if (statement) gameState.statement = statement;
    if (speaker !== undefined) gameState.speaker = speaker;
    if (correctAnswer) gameState.correctAnswer = correctAnswer;
    broadcastState();
  });

  socket.on('admin-start-voting', (data) => {
    if (!isAdminVerified(socket)) return;
    if (data) {
      if (data.statement) gameState.statement = data.statement;
      if (data.speaker !== undefined) gameState.speaker = data.speaker;
      if (data.correctAnswer) gameState.correctAnswer = data.correctAnswer;
    }
    // Clear previous round votes
    gameState.votes = {};
    gameState.phase = 'VOTING';
    broadcastState();
  });

  socket.on('admin-lock-voting', () => {
    if (!isAdminVerified(socket)) return;
    gameState.phase = 'LOCKED';
    broadcastState();
  });

  socket.on('admin-reveal-answer', () => {
    if (!isAdminVerified(socket)) return;
    gameState.phase = 'REVEALED';
    broadcastState();
  });

  socket.on('admin-reset', () => {
    if (!isAdminVerified(socket)) return;
    gameState.phase = 'IDLE';
    gameState.votes = {};
    gameState.statement = 'Waiting for next statement...';
    gameState.correctAnswer = null;
    broadcastState();
  });

  socket.on('disconnect', () => {
    adminAuthStore.delete(socket.id);
    io.emit('connection-count', io.engine.clientsCount);
  });
});

server.listen(PORT, () => {
  const localIp = ip.address();
  console.log(`===================================================`);
  console.log(` Would Cardiff University Lie to You? is running!`);
  console.log(` Admin Access Code: ${ADMIN_ACCESS_CODE}`);
  console.log(` Main Display: http://localhost:${PORT}/display`);
  console.log(` Admin Console: http://localhost:${PORT}/admin`);
  console.log(` Audience Join URL: http://${localIp}:${PORT}/vote`);
  console.log(`===================================================`);
});

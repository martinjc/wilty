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
// Map of socketId -> true for verified admins
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
  statement: 'Welcome to Would Cardiff University Lie to You? Waiting for the presenter to start...',
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

app.get('/admin', (req, res) => {
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

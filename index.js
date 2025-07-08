// index.js (Complete)
require('dotenv').config();
const express = require('express');
const http = require('http'); // Import http module
const { Server } = require("socket.io"); // Import Server class from socket.io
const bcrypt = require('bcrypt');
const path = require('path');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app); // Create an HTTP server from the Express app
const io = new Server(server); // Attach socket.io to the HTTP server

const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- Server-side State ---
const matchmakingQueue = [];
const activeMatchStatus = new Map();
const MATCH_SIZE = 10;
const MATCHMAKING_TIMEOUT = 10000;
let matchmakingTimer = null;

// --- Middleware ---
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const socketAuthMiddleware = (socket, next) => {
    // For real-time auth, the token is passed in the handshake
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error("Authentication error: Token not provided"));
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return next(new Error("Authentication error: Invalid token"));
        }
        socket.user = user; // Attach user payload to the socket object
        next();
    });
};

// --- Helper Functions ---
const createMatch = async (players) => {
    console.log('Creating match for players:', players.map(p => p.userId));
    try {
        const end_time = new Date(Date.now() + 3 * 60000); // 3 minutes from now
        const matchQuery = `INSERT INTO matches (start_price, current_price, status, end_time) VALUES (100.00, 100.00, 'active', $1) RETURNING id;`;
        const matchResult = await pool.query(matchQuery, [end_time]);
        const matchId = matchResult.rows[0].id;
        console.log(`Match ${matchId} created in the database.`);

        const shuffledPlayers = players.sort(() => 0.5 - Math.random());
        const bullCount = Math.ceil(shuffledPlayers.length / 2);

        const playerInsertPromises = shuffledPlayers.map((player, index) => {
            const faction = index < bullCount ? 'BULLS' : 'BEARS';
            const playerQuery = `INSERT INTO match_players (match_id, user_id, faction) VALUES ($1, $2, $3);`;
            return pool.query(playerQuery, [matchId, player.userId, faction]);
        });
        await Promise.all(playerInsertPromises);
        console.log(`All players for match ${matchId} have been inserted.`);

        players.forEach(player => {
            // Bots might have negative or non-user IDs; only update real players
            if (player.userId > 0) {
                activeMatchStatus.set(player.userId, { status: 'found', matchId: matchId });
            }
        });
    } catch (error) {
        console.error('Error creating match:', error);
    }
};

// --- Socket.IO Real-Time Logic ---
io.use(socketAuthMiddleware); // Secure all incoming socket connections

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username} (Socket ID: ${socket.id})`);

    socket.on('joinMatch', async ({ matchId }) => {
        try {
            const query = 'SELECT * FROM match_players WHERE match_id = $1 AND user_id = $2';
            const { rows } = await pool.query(query, [matchId, socket.user.userId]);
            const playerInfo = rows[0];

            if (playerInfo) {
                socket.join(matchId.toString());
                console.log(`User ${socket.user.username} joined match room ${matchId}`);
                socket.emit('matchJoined', { faction: playerInfo.faction });
            } else {
                socket.emit('error', { message: 'You are not a player in this match.' });
            }
        } catch (error) {
            console.error('Error joining match room:', error);
            socket.emit('error', { message: 'Server error while joining match.' });
        }
    });

    socket.on('playerTap', async ({ matchId }) => {
        try {
            const playerQuery = 'SELECT faction FROM match_players WHERE match_id = $1 AND user_id = $2';
            const { rows } = await pool.query(playerQuery, [matchId, socket.user.userId]);
            const playerInfo = rows[0];

            if (!playerInfo) return;

            await pool.query('UPDATE match_players SET tap_count = tap_count + 1 WHERE match_id = $1 AND user_id = $2', [matchId, socket.user.userId]);
            
            const pressure = playerInfo.faction === 'BULLS' ? 0.01 : -0.01;

            const priceUpdateQuery = 'UPDATE matches SET current_price = current_price + $1 WHERE id = $2 RETURNING current_price';
            const priceResult = await pool.query(priceUpdateQuery, [pressure, matchId]);
            const newPrice = priceResult.rows[0].current_price;

            io.to(matchId.toString()).emit('priceUpdate', { newPrice });

        } catch (error) {
            console.error('Error processing player tap:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.user.username}`);
    });
});

// --- API ROUTES ---

app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: 'All fields are required.' });
    try {
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUserQuery = `INSERT INTO users (username, email, hashed_password, verification_token) VALUES ($1, $2, $3, $4) RETURNING id;`;
        const { rows } = await pool.query(newUserQuery, [username, email, hashedPassword, verificationToken]);
        await pool.query('INSERT INTO wallets (user_id) VALUES ($1)', [rows[0].id]);
        const verificationUrl = `https://${req.headers.host}/api/verify?token=${verificationToken}`;
        await transporter.sendMail({ from: `"Orium.fun" <${process.env.EMAIL_USER}>`, to: email, subject: 'Verify Your Email Address', html: `<b>Please click the link to verify your email:</b> <a href="${verificationUrl}">${verificationUrl}</a>` });
        res.status(201).json({ message: 'Registration successful! Please check your email (and spam folder) to verify your account.' });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Username or email already exists.' });
        console.error(error);
        res.status(500).json({ message: 'Server error.' });
    }
});
app.get('/api/verify', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send('Verification token is missing.');
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE verification_token = $1', [token]);
        const user = rows[0];
        if (!user) return res.status(400).send('Invalid verification token.');
        await pool.query('UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = $1', [user.id]);
        res.redirect('/verified.html');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error.');
    }
});
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = rows[0];
        if (!user) return res.status(401).json({ message: 'Invalid credentials.' });
        if (!user.is_verified) return res.status(403).json({ message: 'Please verify your email address before logging in.' });
        const isMatch = await bcrypt.compare(password, user.hashed_password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials.' });
        const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ message: 'Login successful!', token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error.' });
    }
});
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = rows[0];
        if (!user) return res.json({ message: 'If a user with that email exists, a password reset link has been sent.' });
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000); // 1 hour
        await pool.query('UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE email = $3', [resetToken, expires, email]);
        const resetUrl = `https://${req.headers.host}/reset-password.html?token=${resetToken}`;
        await transporter.sendMail({ from: `"Orium.fun" <${process.env.EMAIL_USER}>`, to: email, subject: 'Password Reset Request', html: `<b>You requested a password reset. Click the link to set a new password:</b> <a href="${resetUrl}">${resetUrl}</a>` });
        res.json({ message: 'If a user with that email exists, a password reset link has been sent.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error.' });
    }
});
app.post('/api/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'Token and new password are required.' });
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()', [token]);
        const user = rows[0];
        if (!user) return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await pool.query('UPDATE users SET hashed_password = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2', [hashedPassword, user.id]);
        res.json({ message: 'Password has been reset successfully.' });
    } catch (error)_ {
        console.error(error);
        res.status(500).json({ message: 'Server error.' });
    }
});
app.get('/api/user/me', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                u.username, 
                u.email, 
                w.hype_token_balance, 
                w.orium_shard_balance 
            FROM users u
            JOIN wallets w ON u.id = w.user_id
            WHERE u.id = $1;
        `;
        const { rows } = await pool.query(query, [req.user.userId]);
        if (rows.length === 0) return res.status(404).json({ message: "User not found." });
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});
app.post('/api/matchmaking/join', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    if (matchmakingQueue.find(p => p.userId === userId) || activeMatchStatus.has(userId)) {
        return res.status(409).json({ message: 'You are already in queue or in a match.' });
    }
    matchmakingQueue.push({ userId });
    activeMatchStatus.set(userId, { status: 'waiting' });
    console.log(`User ${userId} joined queue. Size: ${matchmakingQueue.length}`);
    if (matchmakingQueue.length >= MATCH_SIZE) {
        clearTimeout(matchmakingTimer);
        matchmakingTimer = null;
        const playersToStart = matchmakingQueue.splice(0, MATCH_SIZE);
        await createMatch(playersToStart);
    } else if (matchmakingQueue.length === 1) {
        matchmakingTimer = setTimeout(async () => {
            console.log('Matchmaking timeout reached. Filling with bots.');
            const spotsToFill = MATCH_SIZE - matchmakingQueue.length;
            const botQuery = `SELECT id FROM users WHERE username LIKE 'bot%' LIMIT $1;`;
            const { rows } = await pool.query(botQuery, [spotsToFill]);
            const botPlayers = rows.map(bot => ({ userId: bot.id }));
            const playersToStart = [...matchmakingQueue, ...botPlayers];
            matchmakingQueue.length = 0;
            await createMatch(playersToStart);
            matchmakingTimer = null;
        }, MATCHMAKING_TIMEOUT);
    }
    res.json({ message: 'You have joined the queue.' });
});
app.get('/api/matchmaking/status', verifyToken, (req, res) => {
    const userId = req.user.userId;
    const userStatus = activeMatchStatus.get(userId);
    if (userStatus && userStatus.status === 'found') {
        res.json(userStatus);
        activeMatchStatus.delete(userId);
    } else {
        res.json({ status: 'waiting' });
    }
});
app.post('/api/matchmaking/leave', verifyToken, (req, res) => {
    const userId = req.user.userId;
    const playerIndex = matchmakingQueue.findIndex(p => p.userId === userId);
    if (playerIndex > -1) {
        matchmakingQueue.splice(playerIndex, 1);
        activeMatchStatus.delete(userId);
        console.log(`User ${userId} left the queue. Current queue size: ${matchmakingQueue.length}`);
        if (matchmakingQueue.length === 0) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }
        return res.json({ message: "You have left the queue." });
    } else {
        return res.status(404).json({ message: "You were not in the queue." });
    }
});

// --- CATCH-ALL ROUTE ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Server Startup ---
server.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
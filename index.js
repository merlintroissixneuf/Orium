require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const bcrypt = require('bcrypt');
const path = require('path');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

const matchmakingQueue = [];
const activeMatchStatus = new Map();
const activeMatchTimers = new Map();
const botIntervals = new Map();
const MATCH_SIZE = 10;
const MATCHMAKING_TIMEOUT = 10000;
const MATCH_DURATION_SECONDS = 60;
const MAX_PRICE_SWING = 15.00;
let matchmakingTimer = null;

// Initialize bot users if they don't exist
const initializeBots = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const botCountQuery = await client.query('SELECT COUNT(*) FROM users WHERE username LIKE $1', ['bot%']);
        const botCount = parseInt(botCountQuery.rows[0].count);
        if (botCount < MATCH_SIZE) {
            const botsToCreate = MATCH_SIZE - botCount;
            for (let i = 0; i < botsToCreate; i++) {
                const botUsername = `bot${botCount + i + 1}`;
                const botEmail = `${botUsername}@orium.fun`;
                const hashedPassword = await bcrypt.hash('botpassword', 10);
                const newBotQuery = `INSERT INTO users (username, email, hashed_password, is_verified) VALUES ($1, $2, $3, TRUE) RETURNING id`;
                const botResult = await client.query(newBotQuery, [botUsername, botEmail, hashedPassword]);
                if (botResult.rows.length > 0) {
                    const botId = botResult.rows[0].id;
                    await client.query('INSERT INTO wallets (user_id) VALUES ($1)', [botId]);
                    console.log(`Created bot: ${botUsername} (ID: ${botId})`);
                }
            }
            await client.query('COMMIT');
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error initializing bots:', error);
    } finally {
        client.release();
    }
};

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
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error: Token not provided"));
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return next(new Error("Authentication error: Invalid token"));
        socket.user = user;
        next();
    });
};

const handleTap = async (matchId, userId, faction) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const tapUpdate = await client.query('UPDATE match_players SET tap_count = tap_count + 1 WHERE match_id = $1 AND user_id = $2 RETURNING tap_count', [matchId, userId]);
        if (tapUpdate.rows.length === 0) {
            console.error(`No match_player found for matchId: ${matchId}, userId: ${userId}`);
            await client.query('ROLLBACK');
            return;
        }
        const pressure = faction === 'BULLS' ? 0.01 : -0.01;
        const priceResult = await client.query(
            'UPDATE matches SET current_price = GREATEST($1, LEAST($2, current_price + $3)) WHERE id = $4 RETURNING current_price',
            [-MAX_PRICE_SWING, MAX_PRICE_SWING, pressure, matchId]
        );
        if (priceResult.rows.length === 0) {
            console.error(`No match found for matchId: ${matchId}`);
            await client.query('ROLLBACK');
            return;
        }
        const newPrice = priceResult.rows[0].current_price;
        const factionTapsQuery = `
            SELECT 
                SUM(CASE WHEN faction = 'BULLS' THEN tap_count ELSE 0 END) as bull_taps,
                SUM(CASE WHEN faction = 'BEARS' THEN tap_count ELSE 0 END) as bear_taps
            FROM match_players WHERE match_id = $1;
        `;
        const factionTapsResult = await client.query(factionTapsQuery, [matchId]);
        await client.query('COMMIT');
        const { bull_taps, bear_taps } = factionTapsResult.rows[0];
        io.to(matchId.toString()).emit('gameStateUpdate', { newPrice, bullTaps: bull_taps || 0, bearTaps: bear_taps || 0 });
        console.log(`Tap processed: matchId=${matchId}, userId=${userId}, faction=${faction}, newPrice=${newPrice}`);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error in handleTap transaction:", e);
    } finally {
        client.release();
    }
};

const createMatch = async (players, realPlayersInQueue) => {
    try {
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + MATCH_DURATION_SECONDS * 1000);
        const startPrice = 0.00;
        const matchQuery = `INSERT INTO matches (start_price, current_price, status, start_time, end_time) VALUES ($1, $1, 'active', $2, $3) RETURNING id;`;
        const matchResult = await pool.query(matchQuery, [startPrice, startTime, endTime]);
        const matchId = matchResult.rows[0].id;
        console.log(`Match ${matchId} created.`);

        const shuffledPlayers = players.sort(() => 0.5 - Math.random());
        const bullCount = Math.ceil(shuffledPlayers.length / 2);
        for (const [index, player] of shuffledPlayers.entries()) {
            player.faction = index < bullCount ? 'BULLS' : 'BEARS';
            const insertResult = await pool.query(
                `INSERT INTO match_players (match_id, user_id, faction) VALUES ($1, $2, $3) RETURNING *;`,
                [matchId, player.userId, player.faction]
            );
            if (insertResult.rows.length === 0) {
                console.error(`Failed to insert player: userId=${player.userId}, matchId=${matchId}`);
            } else {
                console.log(`Inserted player: userId=${player.userId}, faction=${player.faction}, matchId=${matchId}`);
            }
        }
        
        console.log('--- Factions Assigned ---');
        shuffledPlayers.forEach(p => console.log(`Player ${p.userId}: ${p.faction}`));
        const bullPlayers = shuffledPlayers.filter(p => p.faction === 'BULLS').length;
        const bearPlayers = shuffledPlayers.length - bullPlayers;
        console.log(`Faction distribution: ${bullPlayers} Bulls, ${bearPlayers} Bears`);
        console.log('-------------------------');

        const bots = shuffledPlayers.filter(p => !realPlayersInQueue.some(rp => rp.userId === p.userId));
        console.log(`Bots in match ${matchId}:`, bots.map(b => ({ userId: b.userId, faction: b.faction })));
        const matchBotIntervals = [];
        bots.forEach(bot => {
            if (!bot.faction) {
                console.error(`Bot ${bot.userId} has no faction assigned`);
                return;
            }
            const interval = setInterval(() => {
                console.log(`Bot ${bot.userId} (Faction: ${bot.faction}) is tapping in match ${matchId}.`);
                handleTap(matchId, bot.userId, bot.faction);
            }, 200 + Math.random() * 300);
            matchBotIntervals.push(interval);
        });
        if (matchBotIntervals.length > 0) {
            botIntervals.set(matchId, matchBotIntervals);
            console.log(`Started ${matchBotIntervals.length} bot intervals for match ${matchId}`);
        } else {
            console.log(`No bot intervals started for match ${matchId}`);
        }

        let remainingTime = MATCH_DURATION_SECONDS;
        const matchTimer = setInterval(async () => {
            io.to(matchId.toString()).emit('timeUpdate', { remainingTime });
            remainingTime--;
            if (remainingTime < 0) {
                clearInterval(matchTimer);
                activeMatchTimers.delete(matchId);
                if (botIntervals.has(matchId)) {
                    botIntervals.get(matchId).forEach(clearInterval);
                    botIntervals.delete(matchId);
                    console.log(`Cleared bot intervals for match ${matchId}`);
                }
                const endPriceRes = await pool.query('SELECT current_price, start_price FROM matches WHERE id = $1', [matchId]);
                if (endPriceRes.rows.length === 0) {
                    console.error(`Match ${matchId} not found at end`);
                    return;
                }
                const { current_price, start_price } = endPriceRes.rows[0];
                const winningFaction = current_price > start_price ? 'BULLS' : 'BEARS';
                await pool.query('UPDATE matches SET status = $1, winning_faction = $2 WHERE id = $3', ['completed', winningFaction, matchId]);
                const leaderboardQuery = `
                    SELECT u.username, mp.tap_count
                    FROM match_players mp
                    JOIN users u ON mp.user_id = u.id
                    WHERE mp.match_id = $1
                    ORDER BY mp.tap_count DESC
                `;
                const leaderboardResult = await pool.query(leaderboardQuery, [matchId]);
                const leaderboard = leaderboardResult.rows;
                const playerIds = await pool.query('SELECT user_id FROM match_players WHERE match_id = $1', [matchId]);
                playerIds.rows.forEach(({ user_id }) => activeMatchStatus.delete(user_id));
                console.log(`Cleared activeMatchStatus for match ${matchId}`);
                io.to(matchId.toString()).emit('matchEnd', { message: 'Match Over!', winningFaction, leaderboard });
                console.log(`Match ${matchId} has ended. Winner: ${winningFaction}`);
            }
        }, 1000);
        activeMatchTimers.set(matchId, matchTimer);

        realPlayersInQueue.forEach(player => {
            activeMatchStatus.set(player.userId, { status: 'found', matchId });
        });
    } catch (error) {
        console.error('Error creating match:', error);
    }
};

io.use(socketAuthMiddleware);
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username}`);
    socket.on('joinMatch', async ({ matchId }) => {
        try {
            const { rows } = await pool.query('SELECT mp.faction, m.start_price FROM match_players mp JOIN matches m ON mp.match_id = m.id WHERE mp.match_id = $1 AND mp.user_id = $2', [matchId, socket.user.userId]);
            if (rows[0]) {
                socket.join(matchId.toString());
                socket.emit('matchJoined', rows[0]);
            } else {
                console.error(`User ${socket.user.userId} not found in match ${matchId}`);
                socket.emit('error', { message: 'Not authorized for this match.' });
            }
        } catch (error) {
            console.error('Error joining match:', error);
            socket.emit('error', { message: 'Server error while joining match.' });
        }
    });
    socket.on('playerTap', async ({ matchId }) => {
        try {
            const { rows } = await pool.query('SELECT faction FROM match_players WHERE match_id = $1 AND user_id = $2', [matchId, socket.user.userId]);
            if (rows[0]) {
                await handleTap(matchId, socket.user.userId, rows[0].faction);
            } else {
                console.error(`Player tap rejected: userId=${socket.user.userId}, matchId=${matchId}`);
            }
        } catch (error) {
            console.error('Error processing player tap:', error);
        }
    });
    socket.on('disconnect', () => console.log(`User disconnected: ${socket.user.username}`));
});

app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: 'All fields are required.' });
    try {
        const verificationToken = crypto.randomBytes(32).toString('hex');
        console.log('Generated verification token:', verificationToken);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUserQuery = `INSERT INTO users (username, email, hashed_password, verification_token, is_verified) VALUES ($1, $2, $3, $4, FALSE) RETURNING id, verification_token;`;
        const { rows } = await pool.query(newUserQuery, [username, email, hashedPassword, verificationToken]);
        if (rows.length === 0) {
            throw new Error('Failed to insert user');
        }
        const userId = rows[0].id;
        const storedToken = rows[0].verification_token;
        if (storedToken !== verificationToken) {
            console.error('Stored token mismatch:', { storedToken, generated: verificationToken });
            throw new Error('Token storage mismatch');
        }
        console.log('User inserted:', { userId, storedToken });
        await pool.query('INSERT INTO wallets (user_id) VALUES ($1)', [userId]);
        const verificationUrl = `https://${req.headers.host}/api/verify?token=${verificationToken}`;
        console.log('Sending verification email to:', email, 'with URL:', verificationUrl);
        try {
            await transporter.sendMail({
                from: `"Orium.fun" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Verify Your Email Address',
                html: `<b>Please click the link to verify your email:</b> <a href="${verificationUrl}">${verificationUrl}</a>`
            });
            console.log('Email sent successfully');
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            // Proceed without email for now, log for debugging
        }
        res.status(201).json({ message: 'Registration successful! Please check your email (and spam folder) to verify your account.' });
    } catch (error) {
        if (error.code === '23505') {
            console.error('Duplicate username or email:', error);
            return res.status(409).json({ message: 'Username or email already exists.' });
        }
        console.error('Registration error:', error.stack);
        res.status(500).json({ message: 'Server error during registration. Please try again.' });
    }
});

app.get('/api/verify', async (req, res) => {
    const { token } = req.query;
    console.log('Received verification token:', token);
    if (!token) {
        console.error('Missing verification token');
        return res.status(400).send('Verification token is missing.');
    }
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT * FROM users WHERE verification_token = $1 FOR UPDATE', [token]);
        const user = rows[0];
        if (!user) {
            console.error('Invalid verification token:', token);
            await client.query('ROLLBACK');
            return res.status(400).send('Invalid verification token.');
        }
        // Check if already verified or used
        if (user.is_verified || user.verification_used) {
            console.log('Token already used or user verified:', { userId: user.id, is_verified: user.is_verified, verification_used: user.verification_used });
            await client.query('ROLLBACK');
            return res.status(400).send('This verification token has already been used.');
        }
        // Verify token before update
        if (user.verification_token !== token) {
            console.error('Token mismatch in database:', { dbToken: user.verification_token, received: token });
            await client.query('ROLLBACK');
            return res.status(400).send('Token mismatch detected.');
        }
        await client.query('UPDATE users SET is_verified = TRUE, verification_token = NULL, verification_used = NOW() WHERE id = $1', [user.id]);
        // Confirm update
        const updatedUser = await client.query('SELECT is_verified, verification_token, verification_used FROM users WHERE id = $1', [user.id]);
        console.log('Post-update state:', updatedUser.rows[0]);
        await client.query('COMMIT');
        res.set('Content-Type', 'text/html');
        res.sendFile(path.join(__dirname, 'public', 'verified.html'));
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Verification error:', error.stack);
        res.status(500).send('Server error during verification. Please try again or contact support.');
    } finally {
        if (client) client.release();
    }
});

app.post('/api/login', async (req, res) => {
    const { identifier, password, remember } = req.body;
    if (!identifier || !password) return res.status(400).json({ message: 'Identifier and password are required.' });
    try {
        const { rows } = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR username = $1',
            [identifier]
        );
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
        const expires = new Date(Date.now() + 3600000);
        await pool.query('UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE email = $3', [resetToken, expires, email]);
        const resetUrl = `https://${req.headers.host}/api/reset-password?token=${resetToken}`;
        await transporter.sendMail({ from: `"Orium.fun" <${process.env.EMAIL_USER}>`, to: email, subject: 'Password Reset Request', html: `<b>You requested a password reset. Click the link to set a new password:</b> <a href="${resetUrl}">${resetUrl}</a>` });
        res.json({ message: 'If a user with that email exists, a password reset link has been sent.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error.' });
    }
});

app.get('/api/reset-password', async (req, res) => {
    const { token } = req.query;
    if (!token) {
        console.error('Missing reset token');
        return res.status(400).send('Reset token is missing.');
    }
    res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.post('/api/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'Token and new password are required.' });
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW() FOR UPDATE', [token]);
        const user = rows[0];
        if (!user) return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
        // Check if already reset
        if (user.reset_used) {
            console.log('Reset token already used:', { userId: user.id, reset_used: user.reset_used });
            return res.status(400).json({ message: 'This reset token has already been used.' });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await pool.query('UPDATE users SET hashed_password = $1, password_reset_token = NULL, password_reset_expires = NULL, reset_used = NOW() WHERE id = $2', [hashedPassword, user.id]);
        const updatedUser = await pool.query('SELECT password_reset_token, reset_used FROM users WHERE id = $1', [user.id]);
        console.log('Post-reset state:', updatedUser.rows[0]);
        res.json({ message: 'Password has been reset successfully.', redirect: '/login' });
    } catch (error) {
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
        await createMatch(playersToStart, playersToStart);
    } else {
        const realPlayersInQueue = [...matchmakingQueue];
        const spotsToFill = MATCH_SIZE - realPlayersInQueue.length;
        if (spotsToFill > 0) {
            const botQuery = `SELECT id FROM users WHERE username LIKE 'bot%' LIMIT $1;`;
            const { rows } = await pool.query(botQuery, [spotsToFill]);
            const botPlayers = rows.map(bot => ({ userId: bot.id }));
            console.log(`Fetched ${botPlayers.length} bots for match`);
            const playersToStart = [...realPlayersInQueue, ...botPlayers];
            if (playersToStart.length >= MATCH_SIZE) {
                matchmakingQueue.splice(0, realPlayersInQueue.length);
                await createMatch(playersToStart, realPlayersInQueue);
            }
        }
        if (matchmakingQueue.length > 0 && matchmakingQueue.length < MATCH_SIZE) {
            matchmakingTimer = setTimeout(async () => {
                console.log('Matchmaking timeout reached. Filling with remaining bots.');
                const realPlayersInQueue = [...matchmakingQueue];
                const spotsToFill = MATCH_SIZE - realPlayersInQueue.length;
                const botQuery = `SELECT id FROM users WHERE username LIKE 'bot%' LIMIT $1;`;
                const { rows } = await pool.query(botQuery, [spotsToFill]);
                const botPlayers = rows.map(bot => ({ userId: bot.id }));
                console.log(`Fetched ${botPlayers.length} bots for match`);
                const playersToStart = [...realPlayersInQueue, ...botPlayers];
                matchmakingQueue.length = 0;
                await createMatch(playersToStart, realPlayersInQueue);
                matchmakingTimer = null;
            }, MATCHMAKING_TIMEOUT);
        }
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
        if (matchmakingQueue.length === 0 && matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }
        return res.json({ message: "You have left the queue." });
    } else {
        activeMatchStatus.delete(userId);
        console.log(`User ${userId} was not in queue but cleared from activeMatchStatus`);
        return res.json({ message: "You were not in the queue, but state has been reset." });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize bots on server startup
initializeBots().then(() => {
    server.listen(port, () => {
        console.log(`🚀 Server listening on port ${port}`);
    });
});
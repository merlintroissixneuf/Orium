require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
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
const MATCH_SIZE = 10;

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
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error.' });
    }
});
app.post('/api/matchmaking/join', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    if (matchmakingQueue.find(p => p.userId === userId)) {
        return res.status(409).json({ message: 'You are already in the queue.' });
    }
    matchmakingQueue.push({ userId });
    console.log(`User ${userId} joined the queue. Current queue size: ${matchmakingQueue.length}`);
    if (matchmakingQueue.length >= MATCH_SIZE) {
        console.log(`MATCH FOUND! Players: ${matchmakingQueue.map(p => p.userId).join(', ')}`);
        matchmakingQueue.length = 0;
        return res.json({ message: 'Match found! Get ready to play.' });
    }
    res.json({ message: `You have joined the queue. Waiting for ${MATCH_SIZE - matchmakingQueue.length} more players.` });
});

// ### This is the route that is missing on your server ###
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

        if (rows.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        res.json(rows[0]);

    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});


// --- CATCH-ALL ROUTE ---
// This must come AFTER all other API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
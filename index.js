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

// Nodemailer Transporter for Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// User Registration
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUserQuery = `
            INSERT INTO users (username, email, hashed_password, verification_token) 
            VALUES ($1, $2, $3, $4) 
            RETURNING id, username, email;
        `;
        await pool.query(newUserQuery, [username, email, hashedPassword, verificationToken]);

        const verificationUrl = `https://${req.headers.host}/api/verify?token=${verificationToken}`;
        await transporter.sendMail({
            from: `"Orium.fun" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Verify Your Email Address',
            html: `<b>Please click the link to verify your email:</b> <a href="${verificationUrl}">${verificationUrl}</a>`
        });

        res.status(201).json({ message: 'Registration successful! Please check your email to verify your account.' });

    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Username or email already exists.' });
        }
        console.error('Error during registration:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

// Email Verification
app.get('/api/verify', async (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).send('Verification token is missing.');
    }

    try {
        const userQuery = 'SELECT * FROM users WHERE verification_token = $1';
        const userResult = await pool.query(userQuery, [token]);
        const user = userResult.rows[0];

        if (!user) {
            return res.status(400).send('Invalid verification token.');
        }

        const updateQuery = 'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = $1';
        await pool.query(updateQuery, [user.id]);

        res.redirect('/verified.html');

    } catch (error) {
        console.error('Error during verification:', error);
        res.status(500).send('Server error during verification.');
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const userQuery = 'SELECT * FROM users WHERE email = $1';
        const userResult = await pool.query(userQuery, [email]);
        const user = userResult.rows[0];

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        if (!user.is_verified) {
            return res.status(403).json({ message: 'Please verify your email address before logging in.' });
        }

        const isMatch = await bcrypt.compare(password, user.hashed_password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ message: 'Login successful!', token });

    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

// Catch-All Route to serve the main page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
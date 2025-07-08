// index.js (Main File)
require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const jwt = require('jsonwebtoken'); // Import jsonwebtoken
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// === MIDDLEWARE ===
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});


// === API ROUTES ===

// User Registration Endpoint
app.post('/api/register', async (req, res) => {
  // ... (existing registration code is unchanged)
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'All fields are required.' });
  }
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUserQuery = `INSERT INTO users (username, email, hashed_password) VALUES ($1, $2, $3) RETURNING id, username, email;`;
    const userResult = await pool.query(newUserQuery, [username, email, hashedPassword]);
    const newUser = userResult.rows[0];
    await pool.query('INSERT INTO wallets (user_id) VALUES ($1)', [newUser.id]);
    res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Username or email already exists.' });
    }
    console.error('Error during registration:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// === NEW: User Login Endpoint ===
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        // Find user by email
        const userQuery = 'SELECT * FROM users WHERE email = $1';
        const userResult = await pool.query(userQuery, [email]);
        const user = userResult.rows[0];

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // Compare password with the hashed version
        const isMatch = await bcrypt.compare(password, user.hashed_password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // Create JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '1h' } // Token expires in 1 hour
        );

        // Send token back to the client
        res.json({ message: 'Login successful!', token });

    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});


// === CATCH-ALL ROUTE ===
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
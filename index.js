// index.js (Main File)
require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path'); // Import the path module
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// === MIDDLEWARE ===
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});


// === API ROUTES ===
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required.' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUserQuery = `
      INSERT INTO users (username, email, hashed_password) 
      VALUES ($1, $2, $3) 
      RETURNING id, username, email;
    `;
    const userResult = await pool.query(newUserQuery, [username, email, hashedPassword]);
    const newUser = userResult.rows[0];

    await pool.query('INSERT INTO wallets (user_id) VALUES ($1)', [newUser.id]);

    res.status(201).json({ 
      message: 'User created successfully', 
      user: newUser 
    });

  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Username or email already exists.' });
    }
    console.error('Error during registration:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});


// === CATCH-ALL ROUTE ===
// This route serves your index.html for any request that doesn't match an API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
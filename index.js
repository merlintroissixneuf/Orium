// index.js

require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

// Setup Express app
const app = express();
const port = 3000;
// Middleware to parse JSON bodies
app.use(express.json());

// Create a new pool of connections to the database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // This is necessary for Render's managed database
    rejectUnauthorized: false
  }
});

// A simple test route
app.get('/', (req, res) => {
  res.send('Orium.fun backend is running!');
});

// === NEW: User Registration Endpoint ===
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  // 1. Basic Validation
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required.' });
  }

  try {
    // 2. Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Insert user into the database
    const newUserQuery = `
      INSERT INTO users (username, email, hashed_password) 
      VALUES ($1, $2, $3) 
      RETURNING id, username, email;
    `;
    const userResult = await pool.query(newUserQuery, [username, email, hashedPassword]);
    const newUser = userResult.rows[0];

    // 4. Create a wallet for the new user
    await pool.query('INSERT INTO wallets (user_id) VALUES ($1)', [newUser.id]);

    // 5. Send success response
    res.status(201).json({ 
      message: 'User created successfully', 
      user: newUser 
    });

  } catch (error) {
    // Handle potential errors, like a duplicate username/email
    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({ message: 'Username or email already exists.' });
    }
    console.error('Error during registration:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});


app.listen(port, () => {
  console.log(`🚀 Server listening at http://localhost:${port}`);
});
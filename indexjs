// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');

// Setup Express app
const app = express();
const port = 3000;

// Create a new pool of connections to the database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test the database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error connecting to the database', err.stack);
  } else {
    console.log('✅ Database connected successfully. Server time:', res.rows[0].now);
  }
});

// A simple test route
app.get('/', (req, res) => {
  res.send('Orium.fun backend is running!');
});

app.listen(port, () => {
  console.log(`🚀 Server listening at http://localhost:${port}`);
});
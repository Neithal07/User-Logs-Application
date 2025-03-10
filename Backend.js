// This is a Node.js Express backend for the Daily Log Tracker
// You would need to install these packages:
// npm install express cors mysql2 body-parser

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files

// Database connection
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'your_password', // Change this
  database: 'daily_logs'
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Initialize database and tables
async function initializeDatabase() {
  try {
    // Create database if it doesn't exist
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });
    
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
    await connection.query(`USE ${dbConfig.database}`);
    
    // Create users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create logs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        mood VARCHAR(20),
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    
    // Create tags table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE
      )
    `);
    
    // Create log_tags junction table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS log_tags (
        log_id INT NOT NULL,
        tag_id INT NOT NULL,
        PRIMARY KEY (log_id, tag_id),
        FOREIGN KEY (log_id) REFERENCES logs(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);
    
    console.log('Database initialized successfully');
    await connection.end();
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

initializeDatabase();

// API Routes

// User Registration
app.post('/api/users/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    // In a real app, you'd hash the password before storing it
    const connection = await pool.getConnection();
    await connection.query(
      'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
      [username, password, email]
    );
    
    connection.release();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User Login
app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const connection = await pool.getConnection();
    const [rows] = await connection.query(
      'SELECT id, username FROM users WHERE username = ? AND password = ?',
      [username, password]
    );
    
    connection.release();
    
    if (rows.length > 0) {
      // In a real app, you'd use sessions or JWT for auth
      res.json({
        message: 'Login successful',
        user: { id: rows[0].id, username: rows[0].username }
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all logs for a user
app.get('/api/logs/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const connection = await pool.getConnection();
    
    // Get logs with their tags
    const [logs] = await connection.query(
      `SELECT l.id, l.title, l.content, l.mood, l.timestamp, 
      GROUP_CONCAT(t.name) as tags
      FROM logs l
      LEFT JOIN log_tags lt ON l.id = lt.log_id
      LEFT JOIN tags t ON lt.tag_id = t.id
      WHERE l.user_id = ?
      GROUP BY l.id
      ORDER BY l.timestamp DESC`,
      [userId]
    );
    
    // Process the results to format tags as arrays
    const formattedLogs = logs.map(log => ({
      ...log,
      tags: log.tags ? log.tags.split(',') : []
    }));
    
    connection.release();
    res.json(formattedLogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new log
app.post('/api/logs', async (req, res) => {
  try {
    const { userId, title, content, mood, tags } = req.body;
    const connection = await pool.getConnection();
    
    // Start transaction
    await connection.beginTransaction();
    
    // Insert log
    const [logResult] = await connection.query(
      'INSERT INTO logs (user_id, title, content, mood) VALUES (?, ?, ?, ?)',
      [userId, title, content, mood]
    );
    
    const logId = logResult.insertId;
    
    // Process tags
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        // Find or create tag
        let tagId;
        const [existingTags] = await connection.query(
          'SELECT id FROM tags WHERE name = ?',
          [tagName]
        );
        
        if (existingTags.length > 0) {
          tagId = existingTags[0].id;
        } else {
          const [newTag] = await connection.query(
            'INSERT INTO tags (name) VALUES (?)',
            [tagName]
          );
          tagId = newTag.insertId;
        }
        
        // Link tag to log
        await connection.query(
          'INSERT INTO log_tags (log_id, tag_id) VALUES (?, ?)',
          [logId, tagId]
        );
      }
    }
    
    // Commit transaction
    await connection.commit();
    connection.release();
    
    res.status(201).json({
      message: 'Log created successfully',
      logId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search logs
app.get('/api/logs/:userId/search', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { term } = req.query;
    
    const connection = await pool.getConnection();
    
    const [logs] = await connection.query(
      `SELECT DISTINCT l.id, l.title, l.content, l.mood, l.timestamp,
      GROUP_CONCAT(t.name) as tags
      FROM logs l
      LEFT JOIN log_tags lt ON l.id = lt.log_id
      LEFT JOIN tags t ON lt.tag_id = t.id
      WHERE l.user_id = ? AND (
        l.title LIKE ? OR
        l.content LIKE ? OR
        t.name LIKE ?
      )
      GROUP BY l.id
      ORDER BY l.timestamp DESC`,
      [userId, `%${term}%`, `%${term}%`, `%${term}%`]
    );
    
    // Process the results to format tags as arrays
    const formattedLogs = logs.map(log => ({
      ...log,
      tags: log.tags ? log.tags.split(',') : []
    }));
    
    connection.release();
    res.json(formattedLogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a log
app.put('/api/logs/:logId', async (req, res) => {
  try {
    const logId = req.params.logId;
    const { title, content, mood, tags } = req.body;
    
    const connection = await pool.getConnection();
    
    // Start transaction
    await connection.beginTransaction();
    
    // Update log
    await connection.query(
      'UPDATE logs SET title = ?, content = ?, mood = ? WHERE id = ?',
      [title, content, mood, logId]
    );
    
    // Delete existing tag associations
    await connection.query('DELETE FROM log_tags WHERE log_id = ?', [logId]);
    
    // Process new tags
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        // Find or create tag
        let tagId;
        const [existingTags] = await connection.query(
          'SELECT id FROM tags WHERE name = ?',
          [tagName]
        );
        
        if (existingTags.length > 0) {
          tagId = existingTags[0].id;
        } else {
          const [newTag] = await connection.query(
            'INSERT INTO tags (name) VALUES (?)',
            [tagName]
          );
          tagId = newTag.insertId;
        }
        
        // Link tag to log
        await connection.query(
          'INSERT INTO log_tags (log_id, tag_id) VALUES (?, ?)',
          [logId, tagId]
        );
      }
    }
    
    // Commit transaction
    await connection.commit();
    connection.release();
    
    res.json({ message: 'Log updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a log
app.delete('/api/logs/:logId', async (req, res) => {
  try {
    const logId = req.params.logId;
    
    const connection = await pool.getConnection();
    await connection.query('DELETE FROM logs WHERE id = ?', [logId]);
    connection.release();
    
    res.json({ message: 'Log deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
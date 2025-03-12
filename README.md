# Daily Log Tracker

A minimalist, dark-themed web application for tracking your daily activities, thoughts, and moods. Uses a JSON file as a lightweight database with SQL-like query capabilities and a REST API.

## Features

- Create, search, edit, and delete daily logs
- Tag and categorize entries by mood
- SQL-like queries for filtering logs
- Simple REST API for programmatic access
- Responsive design for all devices

## Getting Started

1. Clone the repository:
```bash
git clone https://github.com/yourusername/daily-log-tracker.git
cd daily-log-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser to `http://localhost:3000`

## Backend Overview

The application uses a simple JSON file (`logs.json`) as the database with a Node.js backend providing:

### SQL-like Queries

Filter your logs with familiar SQL-inspired syntax:

```
GET /api/query?q=SELECT * FROM logs WHERE mood = 'great'
GET /api/query?q=SELECT * FROM logs WHERE tags CONTAINS 'coding'
```

### REST API

Basic CRUD operations:

- `GET /api/logs` - Get all logs
- `GET /api/logs/:id` - Get a specific log
- `POST /api/logs` - Create a new log
- `PUT /api/logs/:id` - Update a log
- `DELETE /api/logs/:id` - Delete a log

## Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

This project is licensed as open source

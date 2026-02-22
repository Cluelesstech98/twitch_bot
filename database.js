const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'bot_database.db'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS user_iq (
        username TEXT PRIMARY KEY,
        iq_value INTEGER,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS violations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        violation_type TEXT,
        duration INTEGER,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS spam_tracking (
        username TEXT PRIMARY KEY,
        spam_count INTEGER DEFAULT 0,
        last_spam DATETIME
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS warnings (
        username TEXT PRIMARY KEY,
        warn_count INTEGER DEFAULT 0,
        last_warn DATETIME
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS stream_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stream_id TEXT UNIQUE NOT NULL,
        started_at DATETIME NOT NULL,
        current_game TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS stream_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        game_name TEXT NOT NULL,
        started_at DATETIME NOT NULL,
        ended_at DATETIME,
        FOREIGN KEY (session_id) REFERENCES stream_sessions(id) ON DELETE CASCADE
    )`);
    
    db.run(`CREATE INDEX IF NOT EXISTS idx_stream_sessions_stream_id ON stream_sessions(stream_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_stream_categories_session_id ON stream_categories(session_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_stream_categories_ended ON stream_categories(ended_at)`);
});

const database = {
    getUserIQ: (username) => new Promise((resolve, reject) => {
        db.get("SELECT iq_value FROM user_iq WHERE username = ?", [username], (err, row) => {
            if (err) reject(err);
            resolve(row ? row.iq_value : null);
        });
    }),
    
    updateUserIQ: (username, iq) => new Promise((resolve, reject) => {
        db.run(`INSERT OR REPLACE INTO user_iq (username, iq_value) VALUES (?, ?)`, 
            [username, iq], 
            function(err) {
                if (err) reject(err);
                resolve(this.lastID);
            }
        );
    }),
    
    addViolation: (username, type, duration, reason) => new Promise((resolve, reject) => {
        db.run(`INSERT INTO violations (username, violation_type, duration, reason) VALUES (?, ?, ?, ?)`,
            [username, type, duration, reason],
            function(err) {
                if (err) reject(err);
                resolve(this.lastID);
            }
        );
    }),
    
    getSpamCount: (username) => new Promise((resolve, reject) => {
        db.get("SELECT spam_count FROM spam_tracking WHERE username = ?", [username], (err, row) => {
            if (err) reject(err);
            resolve(row ? row.spam_count : 0);
        });
    }),
    
    updateSpamCount: (username, count) => new Promise((resolve, reject) => {
        db.run(`INSERT OR REPLACE INTO spam_tracking (username, spam_count, last_spam) VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [username, count],
            function(err) {
                if (err) reject(err);
                resolve(this.changes);
            }
        );
    }),
    
    resetSpamCount: (username) => new Promise((resolve, reject) => {
        db.run("DELETE FROM spam_tracking WHERE username = ?", [username], function(err) {
            if (err) reject(err);
            resolve(this.changes);
        });
    }),
    
    getWarningCount: (username) => new Promise((resolve, reject) => {
        db.get("SELECT warn_count FROM warnings WHERE username = ?", [username], (err, row) => {
            if (err) reject(err);
            resolve(row ? row.warn_count : 0);
        });
    }),
    
    addWarning: (username) => new Promise((resolve, reject) => {
        db.run(`INSERT OR REPLACE INTO warnings (username, warn_count, last_warn) 
                VALUES (?, COALESCE((SELECT warn_count FROM warnings WHERE username = ?), 0) + 1, CURRENT_TIMESTAMP)`,
            [username, username],
            function(err) {
                if (err) reject(err);
                resolve(this.changes);
            }
        );
    }),
    
    resetWarnings: (username) => new Promise((resolve, reject) => {
        db.run("DELETE FROM warnings WHERE username = ?", [username], function(err) {
            if (err) reject(err);
            resolve(this.changes);
        });
    }),
    
    getStreamSession: (streamId) => new Promise((resolve, reject) => {
        db.get("SELECT * FROM stream_sessions WHERE stream_id = ?", [streamId], (err, row) => {
            if (err) reject(err);
            resolve(row || null);
        });
    }),
    
    createStreamSession: (sessionData) => new Promise((resolve, reject) => {
        const { stream_id, started_at, current_game } = sessionData;
        db.run(`INSERT INTO stream_sessions (stream_id, started_at, current_game) VALUES (?, ?, ?)`,
            [stream_id, started_at, current_game],
            function(err) {
                if (err) reject(err);
                resolve({ id: this.lastID, stream_id, started_at, current_game });
            }
        );
    }),
    
    updateStreamSessionGame: (sessionId, currentGame) => new Promise((resolve, reject) => {
        db.run(`UPDATE stream_sessions SET current_game = ? WHERE id = ?`,
            [currentGame, sessionId],
            function(err) {
                if (err) reject(err);
                resolve(this.changes);
            }
        );
    }),
    
    addCategoryToSession: (sessionId, categoryData) => new Promise((resolve, reject) => {
        const { game_name, started_at } = categoryData;
        db.run(`INSERT INTO stream_categories (session_id, game_name, started_at) VALUES (?, ?, ?)`,
            [sessionId, game_name, started_at],
            function(err) {
                if (err) reject(err);
                resolve(this.lastID);
            }
        );
    }),
    
    updateCategoryEndTime: (sessionId, gameName, endTime) => new Promise((resolve, reject) => {
        db.run(`UPDATE stream_categories SET ended_at = ? WHERE session_id = ? AND game_name = ? AND ended_at IS NULL`,
            [endTime, sessionId, gameName],
            function(err) {
                if (err) reject(err);
                resolve(this.changes);
            }
        );
    }),
    
    getStreamCategories: (sessionId) => new Promise((resolve, reject) => {
        db.all("SELECT * FROM stream_categories WHERE session_id = ? ORDER BY started_at", [sessionId], (err, rows) => {
            if (err) reject(err);
            resolve(rows || []);
        });
    }),
    
    getLastCategory: (sessionId) => new Promise((resolve, reject) => {
        db.get("SELECT * FROM stream_categories WHERE session_id = ? ORDER BY started_at DESC LIMIT 1", [sessionId], (err, row) => {
            if (err) reject(err);
            resolve(row || null);
        });
    }),
    
    cleanupOldSessions: (daysOld = 30) => new Promise((resolve, reject) => {
        const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
        db.run("DELETE FROM stream_sessions WHERE started_at < ?", [cutoffDate], function(err) {
            if (err) reject(err);
            resolve(this.changes);
        });
    }),
    
    close: () => new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) reject(err);
            resolve(true);
        });
    }),
    
    getStats: () => new Promise((resolve, reject) => {
        const stats = {};
        const queries = [
            { key: 'user_iq', query: 'SELECT COUNT(*) as count FROM user_iq' },
            { key: 'violations', query: 'SELECT COUNT(*) as count FROM violations' },
            { key: 'spam_tracking', query: 'SELECT COUNT(*) as count FROM spam_tracking' },
            { key: 'warnings', query: 'SELECT COUNT(*) as count FROM warnings' },
            { key: 'stream_sessions', query: 'SELECT COUNT(*) as count FROM stream_sessions' },
            { key: 'stream_categories', query: 'SELECT COUNT(*) as count FROM stream_categories' }
        ];
        
        let completed = 0;
        
        queries.forEach(({ key, query }) => {
            db.get(query, [], (err, row) => {
                if (err) {
                    stats[key] = { error: err.message };
                } else {
                    stats[key] = row.count;
                }
                
                completed++;
                if (completed === queries.length) {
                    resolve(stats);
                }
            });
        });
    })
};

module.exports = database;
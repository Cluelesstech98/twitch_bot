const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../data/bot_database.db');
const db = new sqlite3.Database(dbPath);

function columnExists(table, column) {
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${table})`, (err, rows) => {
            if (err) return reject(err);
            resolve(rows.some(row => row.name === column));
        });
    });
}

db.serialize(async () => {
    db.run(`CREATE TABLE IF NOT EXISTS user_iq (
        username TEXT PRIMARY KEY,
        iq INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS violations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        type TEXT,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS spam_tracking (
        username TEXT PRIMARY KEY,
        last_message TEXT,
        count INTEGER,
        last_time INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS stream_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stream_id TEXT UNIQUE,
        started_at DATETIME,
        current_game TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS stream_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        game_name TEXT,
        started_at DATETIME,
        ended_at DATETIME,
        FOREIGN KEY(session_id) REFERENCES stream_sessions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS stream_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stream_id TEXT,
        game_name TEXT,
        proposed_by TEXT,
        UNIQUE(stream_id, game_name)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stream_id TEXT,
        game_name TEXT,
        username TEXT,
        UNIQUE(stream_id, username)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bot_points (
        username TEXT PRIMARY KEY,
        points INTEGER DEFAULT 0,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS proverbs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template TEXT UNIQUE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS jokes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT UNIQUE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS fortunes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT UNIQUE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        reason TEXT,
        banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        banned_until DATETIME,
        is_active BOOLEAN DEFAULT 1,
        UNIQUE(username, banned_at)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS daily_bonus (
        username TEXT PRIMARY KEY,
        last_bonus DATE DEFAULT CURRENT_DATE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS daily_fortune (
        username TEXT PRIMARY KEY,
        last_fortune DATE DEFAULT CURRENT_DATE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS duels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenger TEXT,
        opponent TEXT,
        amount INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporter TEXT,
        offender TEXT,
        reason TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS unban_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ban_id INTEGER,
        message_id TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(ban_id) REFERENCES bans(id)
    )`);

    try {
        const hasIq = await columnExists('user_iq', 'iq');
        if (!hasIq) {
            db.run("ALTER TABLE user_iq ADD COLUMN iq INTEGER");
        }
        const hasUpdatedAt = await columnExists('user_iq', 'updated_at');
        if (!hasUpdatedAt) {
            db.run("ALTER TABLE user_iq ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
        }
    } catch (err) {
        console.error('Ошибка при проверке структуры БД:', err);
    }
});

function getUserIQ(username) {
    return new Promise((resolve, reject) => {
        db.get('SELECT iq FROM user_iq WHERE username = ?', [username], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.iq : null);
        });
    });
}

function updateUserIQ(username, iq) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO user_iq (username, iq, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(username) DO UPDATE SET iq = excluded.iq, updated_at = CURRENT_TIMESTAMP`,
            [username, iq],
            function (err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function getStreamSession(streamId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM stream_sessions WHERE stream_id = ?', [streamId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function createStreamSession({ stream_id, started_at, current_game }) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO stream_sessions (stream_id, started_at, current_game) VALUES (?, ?, ?)',
            [stream_id, started_at, current_game],
            function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, stream_id, started_at, current_game });
            }
        );
    });
}

function updateStreamSessionGame(sessionId, game) {
    return new Promise((resolve, reject) => {
        db.run('UPDATE stream_sessions SET current_game = ? WHERE id = ?', [game, sessionId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function addCategoryToSession(sessionId, { game_name, started_at }) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO stream_categories (session_id, game_name, started_at) VALUES (?, ?, ?)',
            [sessionId, game_name, started_at],
            function (err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function getLastCategory(sessionId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM stream_categories WHERE session_id = ? ORDER BY started_at DESC LIMIT 1',
            [sessionId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

function updateCategoryEndTime(sessionId, game_name, ended_at) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE stream_categories SET ended_at = ? WHERE session_id = ? AND game_name = ? AND ended_at IS NULL',
            [ended_at, sessionId, game_name],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function getStreamCategories(sessionId) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT game_name, started_at, ended_at FROM stream_categories WHERE session_id = ? ORDER BY started_at',
            [sessionId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

function addGameProposal(streamId, gameName, username) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR IGNORE INTO stream_games (stream_id, game_name, proposed_by) VALUES (?, ?, ?)',
            [streamId, gameName, username],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes > 0);
            }
        );
    });
}

function voteForGame(streamId, gameName, username) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR IGNORE INTO votes (stream_id, game_name, username) VALUES (?, ?, ?)',
            [streamId, gameName, username],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes > 0);
            }
        );
    });
}

function getVotingResults(streamId) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT sg.game_name, COUNT(v.username) as votes
             FROM stream_games sg
             LEFT JOIN votes v ON sg.stream_id = v.stream_id AND sg.game_name = v.game_name
             WHERE sg.stream_id = ?
             GROUP BY sg.game_name
             ORDER BY votes DESC`,
            [streamId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

function resetVoting(streamId) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM votes WHERE stream_id = ?', [streamId], (err) => {
            if (err) reject(err);
            else {
                db.run('DELETE FROM stream_games WHERE stream_id = ?', [streamId], (err2) => {
                    if (err2) reject(err2);
                    else resolve();
                });
            }
        });
    });
}

function getUserPoints(username) {
    return new Promise((resolve, reject) => {
        db.get('SELECT points FROM bot_points WHERE username = ?', [username], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.points : 0);
        });
    });
}

function addUserPoints(username, amount) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO bot_points (username, points, last_seen) VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(username) DO UPDATE SET points = points + ?, last_seen = CURRENT_TIMESTAMP`,
            [username, amount, amount],
            function (err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function spendUserPoints(username, amount) {
    return new Promise((resolve, reject) => {
        db.get('SELECT points FROM bot_points WHERE username = ?', [username], (err, row) => {
            if (err) return reject(err);
            if (!row || row.points < amount) return reject(new Error('Недостаточно очков'));
            db.run(
                'UPDATE bot_points SET points = points - ?, last_seen = CURRENT_TIMESTAMP WHERE username = ?',
                [amount, username],
                function (err2) {
                    if (err2) reject(err2);
                    else resolve();
                }
            );
        });
    });
}

function getRandomProverb() {
    return new Promise((resolve, reject) => {
        db.get('SELECT template FROM proverbs ORDER BY RANDOM() LIMIT 1', (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.template : null);
        });
    });
}

function addProverb(template) {
    return new Promise((resolve, reject) => {
        db.run('INSERT OR IGNORE INTO proverbs (template) VALUES (?)', [template], function (err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

function getStreamStats(streamId) {
    return Promise.resolve(null);
}

function getTopPoints(limit) {
    return new Promise((resolve, reject) => {
        db.all('SELECT username, points FROM bot_points ORDER BY points DESC LIMIT ?', [limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getTopIQ(limit) {
    return new Promise((resolve, reject) => {
        db.all('SELECT username, iq FROM user_iq ORDER BY iq DESC LIMIT ?', [limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getTopWarns(limit) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT username, COUNT(*) as warns FROM violations GROUP BY username ORDER BY warns DESC LIMIT ?`,
            [limit],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

function getTopBans(limit) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT username, COUNT(*) as bans FROM bans WHERE is_active = 1 GROUP BY username ORDER BY bans DESC LIMIT ?`,
            [limit],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

function getUserWarns(username) {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as warns FROM violations WHERE username = ?', [username], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.warns : 0);
        });
    });
}

function getRandomJoke() {
    return new Promise((resolve, reject) => {
        db.get('SELECT text FROM jokes ORDER BY RANDOM() LIMIT 1', (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.text : null);
        });
    });
}

function addJoke(text) {
    return new Promise((resolve, reject) => {
        db.run('INSERT OR IGNORE INTO jokes (text) VALUES (?)', [text], function (err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

function getRandomFortune() {
    return new Promise((resolve, reject) => {
        db.get('SELECT text FROM fortunes ORDER BY RANDOM() LIMIT 1', (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.text : null);
        });
    });
}

function addFortune(text) {
    return new Promise((resolve, reject) => {
        db.run('INSERT OR IGNORE INTO fortunes (text) VALUES (?)', [text], function (err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

function checkDailyBonus(username) {
    return new Promise((resolve, reject) => {
        db.get('SELECT last_bonus FROM daily_bonus WHERE username = ?', [username], (err, row) => {
            if (err) return reject(err);
            const today = new Date().toISOString().split('T')[0];
            if (!row || row.last_bonus !== today) {
                db.run(
                    'INSERT OR REPLACE INTO daily_bonus (username, last_bonus) VALUES (?, ?)',
                    [username, today],
                    function (err2) {
                        if (err2) reject(err2);
                        else resolve(true);
                    }
                );
            } else {
                resolve(false);
            }
        });
    });
}

function checkDailyFortune(username) {
    return new Promise((resolve, reject) => {
        db.get('SELECT last_fortune FROM daily_fortune WHERE username = ?', [username], (err, row) => {
            if (err) return reject(err);
            const today = new Date().toISOString().split('T')[0];
            if (!row || row.last_fortune !== today) {
                db.run(
                    'INSERT OR REPLACE INTO daily_fortune (username, last_fortune) VALUES (?, ?)',
                    [username, today],
                    function (err2) {
                        if (err2) reject(err2);
                        else resolve(true);
                    }
                );
            } else {
                resolve(false);
            }
        });
    });
}

function createBan(username, reason, durationDays = null) {
    return new Promise((resolve, reject) => {
        const bannedUntil = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;
        db.run(
            'INSERT INTO bans (username, reason, banned_until, is_active) VALUES (?, ?, ?, 1)',
            [username, reason, bannedUntil ? bannedUntil.toISOString() : null],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

function unbanUser(username) {
    return new Promise((resolve, reject) => {
        db.run('UPDATE bans SET is_active = 0 WHERE username = ? AND is_active = 1', [username], function (err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

function getExpiredBans() {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.all(
            'SELECT * FROM bans WHERE is_active = 1 AND banned_until IS NOT NULL AND banned_until <= ?',
            [now],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

function createUnbanRequest(banId, messageId) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO unban_requests (ban_id, message_id) VALUES (?, ?)',
            [banId, messageId],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

function resolveUnbanRequest(messageId, status) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE unban_requests SET status = ? WHERE message_id = ?',
            [status, messageId],
            function (err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function createReport(reporter, offender, reason) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO reports (reporter, offender, reason) VALUES (?, ?, ?)',
            [reporter, offender, reason],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

function createDuel(challenger, opponent, amount, expiresAt) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO duels (challenger, opponent, amount, expires_at) VALUES (?, ?, ?, ?)',
            [challenger, opponent, amount, expiresAt.toISOString()],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

function getPendingDuelByOpponent(opponent) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM duels WHERE opponent = ? AND status = "pending" AND expires_at > CURRENT_TIMESTAMP',
            [opponent],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

function updateDuelStatus(duelId, status) {
    return new Promise((resolve, reject) => {
        db.run('UPDATE duels SET status = ? WHERE id = ?', [status, duelId], function (err) {
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = {
    getUserIQ,
    updateUserIQ,
    getStreamSession,
    createStreamSession,
    updateStreamSessionGame,
    addCategoryToSession,
    getLastCategory,
    updateCategoryEndTime,
    getStreamCategories,
    addGameProposal,
    voteForGame,
    getVotingResults,
    resetVoting,
    getUserPoints,
    addUserPoints,
    spendUserPoints,
    getRandomProverb,
    addProverb,
    getStreamStats,
    getTopPoints,
    getTopIQ,
    getTopWarns,
    getTopBans,
    getUserWarns,
    getRandomJoke,
    addJoke,
    getRandomFortune,
    addFortune,
    checkDailyBonus,
    checkDailyFortune,
    createBan,
    unbanUser,
    getExpiredBans,
    createUnbanRequest,
    resolveUnbanRequest,
    createReport,
    createDuel,
    getPendingDuelByOpponent,
    updateDuelStatus,
};
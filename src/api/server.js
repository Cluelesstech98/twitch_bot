// закинул удочку на android-приложение

const express = require('express');
const database = require('../services/database');
const moderation = require('../commands/moderation');
const points = require('../services/points');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../config/.env') });

const app = express();
const PORT = process.env.API_PORT || 3000;
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    console.error('❌ API_KEY не задан в .env');
    process.exit(1);
}

app.use(express.json());

app.use((req, res, next) => {
    const key = req.headers['x-api-key'];
    if (key !== API_KEY) {
        return res.status(401).json({ error: 'Неверный API ключ' });
    }
    next();
});

app.get('/stats/top', async (req, res) => {
    const { type, limit = 10 } = req.query;
    if (!type || !['points', 'iq', 'warns'].includes(type)) {
        return res.status(400).json({ error: 'Неверный тип. Допустимо: points, iq, warns' });
    }
    try {
        let data;
        if (type === 'points') {
            data = await database.getTopPoints(parseInt(limit));
        } else if (type === 'iq') {
            data = await database.getTopIQ(parseInt(limit));
        } else if (type === 'warns') {
            data = await database.getTopWarns(parseInt(limit));
        }
        res.json(data);
    } catch (err) {
        console.error('Ошибка получения топа:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.get('/stats/user/:username', async (req, res) => {
    const username = req.params.username.toLowerCase();
    try {
        const iq = await database.getUserIQ(username);
        const points = await database.getUserPoints(username);
        const warns = await database.getUserWarns(username);
        res.json({ username, iq, points, warns });
    } catch (err) {
        console.error('Ошибка получения статистики пользователя:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.post('/command/ban', async (req, res) => {
    const { username, reason } = req.body;
    if (!username) return res.status(400).json({ error: 'Не указан username' });
    try {
        await moderation.handleBan(null, `#${process.env.CHANNEL_NAME}`, username, reason || 'Перманентный бан');
        res.json({ success: true, message: `Пользователь ${username} забанен` });
    } catch (err) {
        console.error('Ошибка бана:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/command/timeout', async (req, res) => {
    const { username, duration, reason } = req.body;
    if (!username || !duration) return res.status(400).json({ error: 'Не указан username или duration' });
    try {
        await moderation.handleTimeout(null, `#${process.env.CHANNEL_NAME}`, username, duration, reason || 'Нарушение правил');
        res.json({ success: true, message: `Пользователь ${username} получил таймаут на ${duration} сек` });
    } catch (err) {
        console.error('Ошибка таймаута:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/command/warn', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Не указан username' });
    try {
        const result = await moderation.handleWarn(username);
        res.json({ success: true, message: result });
    } catch (err) {
        console.error('Ошибка выдачи варна:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/points/add', async (req, res) => {
    const { username, amount } = req.body;
    if (!username || !amount || amount <= 0) return res.status(400).json({ error: 'Неверные параметры' });
    try {
        await points.addPoints(username, amount);
        res.json({ success: true, message: `Пользователю ${username} начислено ${amount} очков` });
    } catch (err) {
        console.error('Ошибка начисления очков:', err);
        res.status(500).json({ error: err.message });
    }
});

function startApiServer() {
    app.listen(PORT, () => {
        console.log(`📱 API сервер запущен на порту ${PORT}`);
    });
}

module.exports = { startApiServer };
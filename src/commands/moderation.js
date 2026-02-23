const { forbiddenWords, wordTimeoutMap } = require('./bannedWords');
const { timeoutUser, banUser } = require('../services/api');

const spamCache = new Map();
const warnCache = new Map();
const capsWarnCache = new Map();

const BOT_NAMES = [                                         // лучше удалить лишних
    'streamelements', 'nightbot', 'moobot', 'wizebot',
    'deepbot', 'streamlabs', 'fossabot'
];

function hasForbiddenWords(message) {
    const lower = message.toLowerCase();
    return forbiddenWords.some(word => lower.includes(word));
}

function getTimeoutDuration(message) {
    const lower = message.toLowerCase();
    for (const [word, duration] of Object.entries(wordTimeoutMap)) {
        if (lower.includes(word)) return duration;
    }
    return 600;
}

function checkCaps(message, username) {
    if (message.length < 5) return null;
    const letters = message.replace(/[^a-zA-Zа-яА-Я]/g, '');
    if (!letters.length) return null;
    const upperCount = (message.match(/[A-ZА-Я]/g) || []).length;
    const upperRatio = upperCount / letters.length;
    if (upperRatio > 0.7 && letters.length > 4) {
        const warnings = capsWarnCache.get(username) || 0;
        if (warnings === 0) {
            capsWarnCache.set(username, 1);
            return { timeout: false, warning: `@${username}, не капси, я дурак, могу и забанить` };
        } else {
            capsWarnCache.delete(username);
            return { timeout: true, duration: 600, reason: 'А я предупреждал' };
        }
    }
    return null;
}

async function checkSpam(username, message) {
    const now = Date.now();
    const userData = spamCache.get(username) || { lastMessage: '', count: 0, lastTime: now };
    if (userData.lastMessage === message && now - userData.lastTime < 10000) {
        userData.count += 1;
        if (userData.count >= 3) {
            spamCache.delete(username);
            return { timeout: true, duration: 300, reason: 'Спам (повтор сообщений)' };
        } else {
            userData.lastTime = now;
            spamCache.set(username, userData);
            return { timeout: false, warning: `Повторение - мать учения, но ты не наглей @${username}` };
        }
    } else {
        spamCache.set(username, { lastMessage: message, count: 1, lastTime: now });
        return null;
    }
}

async function handleTimeout(client, channel, username, duration, reason) {
    if (!username || !duration || duration <= 0) throw new Error('Invalid parameters');
    const lowerUsername = username.toLowerCase();
    if (BOT_NAMES.includes(lowerUsername)) {
        const error = new Error(`Невозможно затаймить бота ${username}`);
        error.code = 'BOT_MODERATION';
        throw error;
    }
    const channelName = channel.startsWith('#') ? channel.slice(1) : channel;

    try {
        await timeoutUser(channelName, username, duration, reason);
    } catch (error) {
        if (error.message.includes('400') && error.message.includes('may not be banned/timed out')) {
            console.log(`⚠️ API не может затаймить ${username}, пробуем raw-команду...`);
            try {
                const command = `/timeout @${username} ${duration}`;
                await client.say(channel, command);
                console.log(`✅ Raw-таймаут отправлен для ${username}`);
                return;
            } catch (rawErr) {
                console.error(`❌ Не удалось отправить raw-таймаут для ${username}:`, rawErr);
                throw new Error(`Не удалось выдать таймаут ни через API, ни через raw-команду. Оригинальная ошибка: ${error.message}`);
            }
        } else {
            throw error;
        }
    }
}

async function handleBan(client, channel, username, reason) {
    if (!username) throw new Error('Invalid parameters');
    const lowerUsername = username.toLowerCase();
    if (BOT_NAMES.includes(lowerUsername)) {
        const error = new Error(`Невозможно забанить бота ${username}`);
        error.code = 'BOT_MODERATION';
        throw error;
    }
    const channelName = channel.startsWith('#') ? channel.slice(1) : channel;
    await banUser(channelName, username, reason);
}

function handleWarn(username) {
    const warnings = (warnCache.get(username) || 0) + 1;
    warnCache.set(username, warnings);
    if (warnings === 1) return { type: 'message', text: `ч Аккуратнее с выражениями, пожалуйста @${username}` };
    if (warnings === 2) return { type: 'message', text: `ч Повторяю последний раз, без глупостей @${username}` };
    warnCache.delete(username);
    return { type: 'timeout', duration: 600, reason: 'А я предупреждал' };
}

module.exports = {
    hasForbiddenWords,
    getTimeoutDuration,
    checkCaps,
    checkSpam,
    handleTimeout,
    handleBan,
    handleWarn,
};
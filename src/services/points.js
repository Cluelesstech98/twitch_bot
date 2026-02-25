const database = require('./database');

const lastPointsTime = new Map();

async function awardActivityPoints(username) {
    const now = Date.now();
    const last = lastPointsTime.get(username) || 0;
    if (now - last < 5 * 60 * 1000) return;
    lastPointsTime.set(username, now);
    await database.addUserPoints(username, 1);
}

async function getPoints(username) {
    return await database.getUserPoints(username);
}

async function spendPoints(username, amount) {
    await database.spendUserPoints(username, amount);
}

async function addPoints(username, amount) {
    await database.addUserPoints(username, amount);
}

async function transferPoints(from, to, amount) {
    if (from === to) return 'Нельзя переводить очки самому себе.';
    const balance = await getPoints(from);
    if (balance < amount) return 'Недостаточно очков.';
    await spendPoints(from, amount);
    await addPoints(to, amount);
    return `Переведено ${amount} очков от @${from} к @${to}.`;
}

module.exports = { awardActivityPoints, getPoints, spendPoints, addPoints, transferPoints };
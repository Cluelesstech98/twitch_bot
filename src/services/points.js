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

module.exports = { awardActivityPoints, getPoints, spendPoints, addPoints };
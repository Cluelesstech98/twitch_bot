const database = require('./database');

async function createReport(reporter, offender, reason) {
    await database.createReport(reporter, offender, reason);
    return `@${reporter} ваша жалоба на @${offender} принята. Модераторы рассмотрят её в ближайшее время.`;
}

async function getPendingReports() {
    return [];
}

module.exports = { createReport, getPendingReports };
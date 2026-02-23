const database = require('./database');

async function proposeGame(streamId, gameName, username) {
    if (!streamId || !gameName || !username) return 'Неверные параметры';
    const added = await database.addGameProposal(streamId, gameName, username);
    return added ? `Игра "${gameName}" добавлена!` : `Игра "${gameName}" уже была`;
}

async function voteGame(streamId, gameName, username) {
    if (!streamId || !gameName || !username) return 'Неверные параметры';
    const voted = await database.voteForGame(streamId, gameName, username);
    if (!voted) return `Вы уже голосовали сегодня`;
    return `Ваш голос за "${gameName}" учтён!`;
}

async function getResults(streamId) {
    const results = await database.getVotingResults(streamId);
    if (!results.length) return 'Голосование ещё не началось или нет голосов';
    const lines = results.map(r => `${r.game_name}: ${r.votes} голос(ов)`);
    return 'Результаты голосования:\n' + lines.join('\n');
}

module.exports = { proposeGame, voteGame, getResults };
const emojis = ['🍒', '🍋', '🍊', '🍇', 'э', '💎', '🎰'];

function spin() {
    const results = [];
    for (let i = 0; i < 3; i++) {
        results.push(emojis[Math.floor(Math.random() * emojis.length)]);
    }
    return results;
}

function getWinnings(results) {
    return (results[0] === results[1] && results[1] === results[2]) ? 10 : 0;
}

module.exports = { spin, getWinnings };
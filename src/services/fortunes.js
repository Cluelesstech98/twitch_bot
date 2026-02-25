const database = require('./database');

const defaultFortunes = [
    'Сегодня ты встретишь человека, который изменит твою жизнь. Или просто кота.',
    'Звёзды говорят: лучше не выходить из дома. Но они же не знают, что у тебя доставка.',
    'Тебя ждёт неожиданная прибыль. Проверь карманы старой куртки.',
    'Остерегайся советов от тех, у кого жизнь не сложилась. И от ботов тоже.',
    'Скоро ты получишь важное сообщение. С большой вероятностью от босса.',
    'Твоя карма сегодня чище, чем стекло айфона. Но это пока.',
    'Планета Меркурий в ретрограде – не бери кредит, даже если очень хочется.',
    'Судьба готовит сюрприз. Может быть, даже приятный.',
    'Не верь предсказаниям в интернете, кроме этого.',
    'Тебя ждёт знакомство, которое перерастёт в нечто большее. Например, в дружбу.',
];

async function initFortunes() {
    for (const fortune of defaultFortunes) {
        await database.addFortune(fortune).catch(() => {});
    }
}

async function getRandomFortune() {
    let fortune = await database.getRandomFortune();
    if (!fortune) fortune = defaultFortunes[Math.floor(Math.random() * defaultFortunes.length)];
    return fortune;
}

module.exports = { initFortunes, getRandomFortune };
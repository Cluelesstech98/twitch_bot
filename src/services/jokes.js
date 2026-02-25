const database = require('./database');

const defaultJokes = [
    'Почему программисты путают Хэллоуин и Рождество? Потому что 31 октября = 25 декабря.',
    'Встречаются два друга: – Ты где работаешь? – В IT. – А кем? – Да так, мелким бесом. – Это как? – 1С-ником.',
    'Приходит мужик к врачу, а у него вместо рук клавиатура. Врач говорит: – Давно? – Нет, только сегодня утром заметил, что не могу Ctrl+C Ctrl+V сделать.',
    'Сколько программистов нужно, чтобы вкрутить лампочку? – Ни одного, это硬件 проблема.',
    'Оптимист учит английский, пессимист – китайский. А реалист – язык запросов SQL.',
];

async function initJokes() {
    for (const joke of defaultJokes) {
        await database.addJoke(joke).catch(() => {});
    }
}

async function getRandomJoke() {
    let joke = await database.getRandomJoke();
    if (!joke) joke = defaultJokes[Math.floor(Math.random() * defaultJokes.length)];
    return joke;
}

module.exports = { initJokes, getRandomJoke };
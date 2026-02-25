const database = require('./database');

const defaultTemplates = [
    'Семь раз {word}, один раз Антон',
    'Не имей сто рублей, а имей {word} друзей',
    '{word} маслом не испортишь',
    'Дарёному {word} в зубы не смотрят',
    'В тихом омуте {word} водятся',
];

async function initProverbs() {
    for (const tpl of defaultTemplates) {
        await database.addProverb(tpl).catch(() => {});
    }
}

async function generateProverb(word) {
    let template = await database.getRandomProverb();
    if (!template) template = 'Семь раз {word}, один раз Антон';
    return template.replace(/\{word\}/g, word);
}

module.exports = { initProverbs, generateProverb };
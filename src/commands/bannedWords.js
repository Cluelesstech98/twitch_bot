const forbiddenWords = [                                        // офф данные твича, дополните при необходимости
    'ниггер', 'нига', 'нага', 'nigger', 'nigga', 'naga',
    'хохол', 'хач', 'жид', 'москаль', 'ватник', 'сионист',
    'пидор', 'пидорас', 'педик', 'гомик', 'faggot',
    'даун', 'аутист', 'дебил', 'retard', 'test',
    'cunt', 'пизда', 'вагина',
    'simp', 'симп', 'incel', 'инцел',
    'хиджаб', 'белый', 'натурал', 'гетеросексуал',
    'куколд', 'конча', 'virgin', 'девственник',
    'суицид', 'самоубийство', 'игил', 'талибан', 'насилие'
];

const wordTimeoutMap = {
    'ниггер': 1800, 'нига': 1800, 'nigger': 1800,
    'пидор': 1800, 'пидорас': 1800, 'faggot': 1800,
    'cunt': 1800, 'пизда': 1800,
    'жид': 1800, 'хач': 1800,
    'даун': 600, 'аутист': 600, 'дебил': 600, 'retard': 600,
    'хохол': 600, 'москаль': 600, 'ватник': 600,
    'симп': 600, 'simp': 600,
    'куколд': 600, 'конча': 600,
    'девственник': 300, 'virgin': 300,
    'белый': 300, 'натурал': 300,
    'хиджаб': 300,
    'default': 300
};

const allowedEmojis = [                                        // личные 7tv
    'ага', 'вип', 'вообще-то', 'дада', 'ку', 'модеры', 'молю',
    'нетнет', 'ох', 'погоди', 'саб', 'тише', 'тревога', 'тусим',
    'угу', 'ура', 'хехе', 'хд', 'хмм', 'ч', 'че', 'чел', 'bla',
    'bonkthemods', 'bonkthestreamer', 'catjam', 'chad', 'chel',
    'clean', 'gigamods', 'petthechat', 'svin', 'а', 'ало', 'верим?',
    'долбит', 'молю', 'налево', 'направо', 'понял', 'прив', 'привет',
    'стример', 'чего', 'noooo', 'o7', 'дурка', 'запомнил', 'опа',
    'синема', 'хдд'
];


function hasForbiddenWords(message) {
    const lowerMessage = message.toLowerCase();
    return forbiddenWords.some(word => lowerMessage.includes(word));
}

function getTimeoutDuration(message) {
    const lowerMessage = message.toLowerCase();
    for (const word of forbiddenWords) {
        if (lowerMessage.includes(word)) {
            return wordTimeoutMap[word] || wordTimeoutMap['default'];
        }
    }
    return wordTimeoutMap['default'];
}

function isAllowedEmoji(word) {
    return allowedEmojis.includes(word.toLowerCase());
}

module.exports = {
    forbiddenWords,
    wordTimeoutMap,
    allowedEmojis,
    hasForbiddenWords,
    getTimeoutDuration,
    isAllowedEmoji
};
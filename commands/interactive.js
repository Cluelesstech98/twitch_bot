const database = require('../database');
const {
    getCurrentGame,
    getChannelCreationDate,
    formatTimeDiffExact,
    getCorrectForm,
} = require('../utils');
const axios = require('axios');
const NodeCache = require('node-cache');
require('dotenv').config();

const CLIENT_ID = process.env.CLIENT_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const CHANNEL_NAME = process.env.CHANNEL_NAME;
const BACKUP_CHANNEL_CREATION_DATE = process.env.BACKUP_CHANNEL_CREATION_DATE;

const giftBanCache = new NodeCache({ stdTTL: 60 });
const giftReceivedCache = new NodeCache({ stdTTL: 60 * 60 * 12 });

const textGifts = [
    // нафаршируйте своими +7тв
    'сегодня без подарка Chel ',
    'семь подарков на неделе ох ',
    'лови печеньку дада ',
    'дарю тебе воздушный шарик 🎈 ',
    'получаешь уважение ага ',
    'дарю тебе ответ PETTHECHAT ',
    'лови выходной CHAD ',
    'дарим тебе билет в никуда 🎫 ',
    'получаешь редкий ответ (7%) хехе ',
    'снимаю все проклятья молю ',
];

async function handleIQ(username) {
    try {
        const oldIQ = await database.getUserIQ(username);
        const newIQ = Math.floor(Math.random() * 250) + 1;

        let message = `Ваш IQ = ${newIQ}`;
        if (oldIQ !== null && oldIQ !== undefined) {
            const diff = newIQ - oldIQ;
            message += ` (${diff >= 0 ? '+' : ''}${diff})`;
        }

        await database.updateUserIQ(username, newIQ);
        return message;
    } catch (error) {
        console.error('Ошибка в handleIQ:', error);
        return 'Произошла ошибка при расчете IQ';
    }
}

async function handleGame() {
    try {
        const currentGame = await getCurrentGame(CHANNEL_NAME);
        if (!currentGame) return 'Сейчас стрим не в эфире';

        const lowerGame = currentGame.toLowerCase();
        if (lowerGame.includes('just chatting') || lowerGame.includes('общение')) {
            return 'Пока не играем';
        }

        return `Сейчас играем в ${currentGame}`;
    } catch (error) {
        console.error('Ошибка в handleGame:', error);
        return 'Не удалось получить информацию об игре';
    }
}

async function handleFollowage(tags, isBroadcaster) {
    try {
        const username = tags.username;

        if (isBroadcaster) {
            let creationDate;
            try {
                creationDate = await getChannelCreationDate(CHANNEL_NAME);
                if (!creationDate) {
                    creationDate = new Date(BACKUP_CHANNEL_CREATION_DATE);
                }
            } catch {
                creationDate = new Date(BACKUP_CHANNEL_CREATION_DATE);
            }
            const channelAge = formatTimeDiffExact(creationDate);
            return `Канал создан уже ${channelAge}`;
        }

        const channelResponse = await axios.get(
            `https://api.twitch.tv/helix/users?login=${CHANNEL_NAME}`,
            {
                headers: {
                    'Client-ID': CLIENT_ID,
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                },
            }
        );
        if (!channelResponse.data.data.length) return 'Канал не найден';
        const broadcasterId = channelResponse.data.data[0].id;

        const userResponse = await axios.get(
            `https://api.twitch.tv/helix/users?login=${username}`,
            {
                headers: {
                    'Client-ID': CLIENT_ID,
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                },
            }
        );
        if (!userResponse.data.data.length) return 'Пользователь не найден';
        const userId = userResponse.data.data[0].id;

        const followResponse = await axios.get(
            `https://api.twitch.tv/helix/channels/followers?user_id=${userId}&broadcaster_id=${broadcasterId}`,
            {
                headers: {
                    'Client-ID': CLIENT_ID,
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                },
            }
        );
        if (!followResponse.data.data.length) return 'Вы точно подписаны?';

        const followedAt = new Date(followResponse.data.data[0].followed_at);
        const followDuration = formatFollowageDuration(followedAt);
        return `Вы отслеживаете ${followDuration}`;
    } catch (error) {
        console.error('Ошибка в handleFollowage:', error.response?.data || error.message);
        return 'Ну не';
    }
}

async function handleCategories(channelName) {
    try {
        const streamResponse = await axios.get(
            `https://api.twitch.tv/helix/streams?user_login=${channelName}`,
            {
                headers: {
                    'Client-ID': CLIENT_ID,
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                },
            }
        );
        if (!streamResponse.data.data.length) return 'Э, напиши в онлайне';

        const streamData = streamResponse.data.data[0];
        const streamId = streamData.id;
        const streamStart = new Date(streamData.started_at);
        const currentGame = streamData.game_name || 'Без категории';

        let streamSession = await database.getStreamSession(streamId);
        if (!streamSession) {
            streamSession = await database.createStreamSession({
                stream_id: streamId,
                started_at: streamStart,
                current_game: currentGame,
            });
            await database.addCategoryToSession(streamSession.id, {
                game_name: currentGame,
                started_at: streamStart,
            });
        } else if (streamSession.current_game !== currentGame) {
            const now = new Date();
            const lastCategory = await database.getLastCategory(streamSession.id);
            if (lastCategory && !lastCategory.ended_at) {
                await database.updateCategoryEndTime(
                    streamSession.id,
                    lastCategory.game_name,
                    now
                );
            }
            await database.addCategoryToSession(streamSession.id, {
                game_name: currentGame,
                started_at: now,
            });
            await database.updateStreamSessionGame(streamSession.id, currentGame);
        }

        const categories = await database.getStreamCategories(streamSession.id);
        const now = new Date();

        const formattedCategories = categories
            .map((category, index) => {
                let duration;
                if (category.ended_at) {
                    const startTime = new Date(category.started_at);
                    const endTime = new Date(category.ended_at);
                    duration = Math.floor((endTime - startTime) / (1000 * 60));
                } else if (index === categories.length - 1) {
                    const startTime = new Date(category.started_at);
                    duration = Math.floor((now - startTime) / (1000 * 60));
                } else {
                    duration = 0;
                }
                return `${category.game_name} - ${formatDurationForCheBylo(duration)}`;
            })
            .filter(cat => !cat.includes(' - 00:00'));

        return formattedCategories.length
            ? formattedCategories.join(', ')
            : `${currentGame} - 00:00`;
    } catch (error) {
        console.error('Ошибка в handleCategories:', error.message);
        return 'Э, напиши в онлайне';
    }
}

function handle7tv() {
    // тут тоже свои 7тв, меняй
    return 'Не видишь эти эмоуты? NOOOO SVIN PETTHECHAT GIGAMODS ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ тогда подключай расширение 7TV ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ https://chromewebstore.google.com/detail/7tv/ammjkodgmmoknidbanneddgankgfejfh?hl=ru&utm_source=ext_sidebar ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ есть в тёмной теме https://chromewebstore.google.com/detail/7tv-nightly/fphegifdehlodcepfkgofelcenelpedj?hl=ru&utm_source=ext_sidebar';
}

function handlePing(receivedTime) {
    return `понг (${Date.now() - receivedTime} мс)`;
}

function handleEh() {
    // и тут тоже
    return 'ало нормально работаем, чего ты ало';
}

function handleTg() {
    // без комментариев 
    return process.env.TELEGRAM_LINK || 'Дурак?';
}

function handleRules() {
    // свои правила
    return 'Не беси модеров и стримера ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Не пиши через CAPS ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Не пиши ничего про политику ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Мат можно, но в меру ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Любая запретка --> таймаут/пермбан';
}

function handleCommands() {
    // оно возвращется, но вообще не так, как надо, мне пох-нах фиксить пока что, работает да и срать
    return `
📋 Доступные команды:

🎮 ИГРОВЫЕ:
• !iq (!айкью, !icq) - ваш IQ (верим?)
• !игра - описание глянь э
• !подарок - получить случайный подарок

📊 ОТСЛЕЖИВАНИЕ:
• !followage (!подписка, !отслеживание) - время отслеживания канала
• !чебыло - история категорий стрима

ℹ️ ИНФОРМАЦИОННЫЕ:
• !7тв - ссылки на расширение 7TV
• !пинг - работаем вообще или нет
• !э - сам ты э
• !тг - ссылка на Telegram
• !правила (!rules) - правила чата

🎁 ПОДАРКИ:
• Один подарок за стрим
• 70% - текстовый подарок, 30% - бан-подарок
• Бан-подарок: повторный запрос → таймаут 10 минут`;
}

function addGift(giftName, username, isBroadcaster, isMod) {
    if (!isBroadcaster && !isMod) {
        return `@${username} эта команда доступна только модераторам`;
    }
    if (!giftName || !giftName.trim()) {
        return `@${username} укажите название подарка`;
    }
    const trimmed = giftName.trim();
    if (textGifts.includes(trimmed)) {
        return `@${username} такой подарок уже существует`;
    }
    textGifts.push(trimmed);
    console.log(`[${new Date().toLocaleTimeString()}] Добавлен подарок от ${username}: "${trimmed}"`);
    return `@${username} подарок "${trimmed}" добавлен! Всего подарков: ${textGifts.length}`;
}

async function handleGift(username, client, channel) {
    try {
        if (giftReceivedCache.has(username)) {
            return `@${username} сегодняшний подарок уже получен`;
        }

        if (giftBanCache.has(username)) {
            await client.timeout(channel, username, 600, 'Повторный запрос бан-подарка');
            giftBanCache.del(username);
            giftReceivedCache.set(username, true);
            return `@${username} сегодня получаешь БАН!  опа (таймаут 10 минут за повторный запрос)`;
        }

        const random = Math.random() * 100;
        if (random < 70) {
            const gift = textGifts[Math.floor(Math.random() * textGifts.length)];
            giftReceivedCache.set(username, true);
            return `@${username} ${gift}`;
        } else {
            giftBanCache.set(username, 'BAN');
            giftReceivedCache.set(username, true);
            return `@${username} сегодня получаешь БАН!  опа (для получения подарка повторите запрос в течение минуты)`;
        }
    } catch (error) {
        console.error('Ошибка в handleGift:', error);
        return `@${username} произошла ошибка при выдаче подарка`;
    }
}

function handleResetGift(username, isBroadcaster) {
    if (!isBroadcaster) {
        return `@${username} эта команда доступна только стримеру`;
    }
    giftReceivedCache.flushAll();
    giftBanCache.flushAll();
    console.log(`[${new Date().toLocaleTimeString()}] Кэш подарков сброшен стримером ${username}`);
    return `@${username} кэш подарков сброшен! Все теперь могут получить подарок заново.`;
}

function clearGiftCache() {
    giftReceivedCache.flushAll();
    giftBanCache.flushAll();
    console.log('Кэш подарков очищен');
}

function formatFollowageDuration(startDate) {
    if (!startDate) return '0 дней';
    const now = new Date();
    const diffMs = now - new Date(startDate);
    const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (totalDays < 1) {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        if (hours < 1) {
            const minutes = Math.floor(diffMs / (1000 * 60));
            return `${minutes} ${getCorrectForm(minutes, ['минута', 'минуты', 'минут'])}`;
        }
        return `${hours} ${getCorrectForm(hours, ['час', 'часа', 'часов'])}`;
    }
    if (totalDays < 30) {
        return `${totalDays} ${getCorrectForm(totalDays, ['день', 'дня', 'дней'])}`;
    }

    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    if (months < 12) {
        let result = `${months} ${getCorrectForm(months, ['месяц', 'месяца', 'месяцев'])}`;
        if (days) result += `, ${days} ${getCorrectForm(days, ['день', 'дня', 'дней'])}`;
        return result;
    }

    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    let result = `${years} ${getCorrectForm(years, ['год', 'года', 'лет'])}`;
    if (remMonths) {
        result += `, ${remMonths} ${getCorrectForm(remMonths, ['месяц', 'месяца', 'месяцев'])}`;
    }
    return result;
}

function formatDurationForCheBylo(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const minutes = (totalMinutes % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

module.exports = {
    handleIQ,
    handleGame,
    handleFollowage,
    handleCategories,
    handle7tv,
    handlePing,
    handleEh,
    handleTg,
    handleRules,
    handleCommands,
    addGift,
    handleGift,
    handleResetGift,
    clearGiftCache,
};
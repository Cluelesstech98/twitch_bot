const database = require('../services/database');
const voting = require('../services/voting');
const points = require('../services/points');
const proverbs = require('../services/proverbs');
const roulette = require('../services/roulette');
const jokes = require('../services/jokes');
const fortunes = require('../services/fortunes');
const reports = require('../services/reports');
const { getCorrectForm } = require('../utils/utils');

let currentStreamId = null;

const {
    getCurrentGame,
    getChannelCreationDate,
    formatTimeDiffExact,
} = require('../utils/utils');
const axios = require('axios');
const NodeCache = require('node-cache');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../config/.env') });

const CLIENT_ID = process.env.CLIENT_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const CHANNEL_NAME = process.env.CHANNEL_NAME;
const BACKUP_CHANNEL_CREATION_DATE = process.env.BACKUP_CHANNEL_CREATION_DATE;

const giftBanCache = new NodeCache({ stdTTL: 60 });
const giftReceivedCache = new NodeCache({ stdTTL: 60 * 60 * 12 });

const textGifts = [                     //Замени своими
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
        await points.awardActivityPoints(username);
        return message;
    } catch (error) {
        console.error('Ошибка в handleIQ:', error);
        return 'Произошла ошибка при расчете IQ';
    }
}

async function handleGame() {
    try {
        const currentGame = await getCurrentGame(CHANNEL_NAME);
        if (!currentGame) return 'Ты видишь онлайн?';
        const lowerGame = currentGame.toLowerCase();
        if (lowerGame.includes('just chatting') || lowerGame.includes('общение')) {
            return 'Пока не играем';
        }
        return `Играем в ${currentGame}`;
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
            await points.awardActivityPoints(username);
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
        await points.awardActivityPoints(username);
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
    return 'Не видишь эти эмоуты? NOOOO SVIN PETTHECHAT GIGAMODS ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ тогда подключай расширение 7TV  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ https://chromewebstore.google.com/detail/7tv/ammjkodgmmoknidbanneddgankgfejfh?hl=ru&utm_source=ext_sidebar  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ есть в тёмной теме https://chromewebstore.google.com/detail/7tv-nightly/fphegifdehlodcepfkgofelcenelpedj?hl=ru&utm_source=ext_sidebar';
}

function handlePing(receivedTime) {
    return `понг (${Date.now() - receivedTime} мс)`;
}

function handleEh() {
    return 'ало нормально работаем, чего ты';
}

function handleTg() {
    return process.env.TELEGRAM_LINK || 'Че за повозка?';
}

function handleRules() {
    return 'Не беси модеров и стримера ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Не пиши через CAPS ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Не пиши ничего про политику ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Мат можно, но в меру ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Любая запретка --> таймаут/пермбан';
}

function handleCommands() {
    return `
📋 Доступные команды:
• !iq 
• !игра 
• !подарок 
• !followage 
• !чебыло 
• !7тв 
• !пинг 
• !э 
• !тг 
• !правила 
• !предложение [игра] 
• !голос [игра]
• !итоги 
• !пословица [слово] 
• !рулетка 
• !баллы
• !анекдот
• !судьба
• !дуэль @ник [очки]
• !принять / !отклонить
• !репорт @ник [причина]
• !перевод @ник [очки]
• !топ [очки/iq/варн/бан]`;
}

function addGift(giftName, username, isBroadcaster, isMod) {
    if (!isBroadcaster && !isMod) {
        return `@${username} только для модераторов`;
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

async function handleGift(username, client, channel, isBroadcaster, isMod) {
    try {
        if (isBroadcaster || isMod) {
            giftBanCache.del(username);
            const random = Math.random() * 100;
            if (random < 70) {
                const gift = textGifts[Math.floor(Math.random() * textGifts.length)];
                return `@${username} ${gift}`;
            } else {
                return `@${username} сегодня получаешь БАН! опа да блин, знаете же, что своих не баню`;
            }
        }

        if (giftReceivedCache.has(username)) {
            return `@${username} сегодняшний подарок уже получен`;
        }

        if (giftBanCache.has(username)) {
            await client.timeout(channel, username, 600, 'Повторный запрос бан-подарка');
            giftBanCache.del(username);
            giftReceivedCache.set(username, true);
            return `@${username} сегодня получаешь БАН! опа (таймаут на 10 минут за повторный запрос)`;
        }

        const random = Math.random() * 100;
        if (random < 70) {
            const gift = textGifts[Math.floor(Math.random() * textGifts.length)];
            giftReceivedCache.set(username, true);
            await points.awardActivityPoints(username);
            return `@${username} ${gift}`;
        } else {
            giftBanCache.set(username, 'BAN');
            giftReceivedCache.set(username, true);
            return `@${username} сегодня получаешь БАН! опа (таймаут на 10 минут за повторный запрос)`;
        }
    } catch (error) {
        console.error('Ошибка в handleGift:', error);
        return `@${username} что-то сломалось тревога `;
    }
}

function handleResetGift(username, isBroadcaster) {
    if (!isBroadcaster) {
        return `@${username} нее, только стример так может`;
    }
    giftReceivedCache.flushAll();
    giftBanCache.flushAll();
    console.log(`[${new Date().toLocaleTimeString()}] Подарки сброшены ${username}`);
    return `@${username} подарки сброшены, можно получать снова!`;
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

function setCurrentStreamId(id) {
    currentStreamId = id;
}

async function handleGameProposal(args, username) {
    if (!args.length) return 'Укажите название игры';
    const gameName = args.join(' ');
    if (!currentStreamId) return 'Сейчас нет активного стрима для голосования';
    const result = await voting.proposeGame(currentStreamId, gameName, username);
    if (result) {
        await points.awardActivityPoints(username);
    }
    return result;
}

async function handleVote(args, username) {
    if (!args.length) return 'Укажите название игры, за которую хотите проголосовать';
    const gameName = args.join(' ');
    if (!currentStreamId) return 'Сейчас нет активного стрима для голосования.';
    const result = await voting.voteGame(currentStreamId, gameName, username);
    if (result && !result.includes('уже голосовали')) {
        await points.awardActivityPoints(username);
    }
    return result;
}

async function handleStreamStats() {
    if (!currentStreamId) return 'Стрим не активен или статистика недоступна';
    const votingResults = await voting.getResults(currentStreamId);
    let votingPart = 'Голосование:\n' + (votingResults || 'Нет голосов');
    const stats = await database.getStreamStats(currentStreamId);
    const bansPart = stats ? `Нарушений: ${stats.warns}, банов: ${stats.bans}` : 'Статистика нарушений временно недоступна';
    return `${votingPart}\n\n${bansPart}`;
}

async function handleProverb(args) {
    let word = args.join(' ') || 'кот';
    const result = await proverbs.generateProverb(word);
    await points.awardActivityPoints('system');
    return result;
}

async function handleRoulette(username) {
    const spinResult = roulette.spin();
    const winnings = roulette.getWinnings(spinResult);
    const emojiString = spinResult.join(' ');
    if (winnings > 0) {
        await points.addPoints(username, winnings);
        return `${emojiString} 🎉 Вы выиграли ${winnings} очков! Всего очков: ${await points.getPoints(username)}`;
    } else {
        return `${emojiString} оп ахах`;
    }
}

async function handlePoints(username) {
    const userPoints = await points.getPoints(username);
    return `@${username}, у вас ${userPoints} очков.`;
}

async function handleAddPoints(args, invoker, isBroadcaster, isMod) {
    if (!isBroadcaster && !isMod) {
        return `@${invoker}, только модераторам и стримеру`;
    }
    if (args.length < 2) {
        return `@${invoker}, не, вот так: !+очки @ник 100 или !+очки 100 @ник`;
    }

    let targetUsername = null;
    let amount = null;

    for (const arg of args) {
        if (/^\d+$/.test(arg)) {
            amount = parseInt(arg, 10);
        } else {
            targetUsername = arg.replace('@', '');
        }
    }

    if (!targetUsername) {
        return `@${invoker}, не удалось определить имя пользователя.`;
    }
    if (amount === null || amount <= 0) {
        return `@${invoker}, укажите корректное положительное число очков.`;
    }

    try {
        await points.addPoints(targetUsername, amount);
        return `@${invoker}, начислено ${amount} очков пользователю @${targetUsername}.`;
    } catch (error) {
        console.error('Ошибка при начислении очков:', error);
        return `@${invoker}, произошла ошибка при начислении очков.`;
    }
}

async function handleJoke() {
    return await jokes.getRandomJoke();
}

async function handleFortune(username) {
    const canGet = await database.checkDailyFortune(username);
    if (!canGet) {
        return `@${username}, сегодня вы уже получали предсказание. Приходите завтра, звёзды отдохнут.`;
    }
    const fortune = await fortunes.getRandomFortune();
    await points.addPoints(username, 1);
    return `🔮 ${fortune}`;
}

async function handleTransfer(args, from) {
    if (args.length < 2) {
        return `@${from}, не, вот так: !перевод @ник 100`;
    }
    const to = args[0].replace('@', '');
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) return `@${from}, пиши числами`;
    if (to === from) return `@${from}, ну закинул себе, доволен?`;
    const result = await points.transferPoints(from, to, amount);
    return result;
}

async function handleTop(args) {
    if (args.length === 0) return 'Добавь категорию: очки, iq, варн, бан';
    const type = args[0].toLowerCase();
    const limit = args[1] ? parseInt(args[1]) : 10;
    let data;
    switch (type) {
        case 'очки':
        case 'points':
            data = await database.getTopPoints(limit);
            break;
        case 'iq':
            data = await database.getTopIQ(limit);
            break;
        case 'варн':
        case 'warns':
            data = await database.getTopWarns(limit);
            break;
        case 'бан':
        case 'bans':
            data = await database.getTopBans(limit);
            break;
        default:
            return 'Пока что только: очки, iq, варн, бан';
    }
    if (!data || data.length === 0) return 'В топе точно кто-то есть, Тайлер?';
    const lines = data.map((item, i) => `${i+1}. ${item.username} — ${item.points || item.iq || item.warns || item.bans}`);
    return `Топ ${type}:\n` + lines.join('\n');
}

async function handleReport(args, reporter) {
    if (args.length < 2) return `@${reporter}, укажите ник и причину. Пример: !репорт @ник спам`;
    const offender = args[0].replace('@', '');
    const reason = args.slice(1).join(' ');
    const result = await reports.createReport(reporter, offender, reason);
    return result;
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
    handleGameProposal,
    handleVote,
    handleStreamStats,
    handleProverb,
    handleRoulette,
    handlePoints,
    handleAddPoints,
    handleJoke,
    handleFortune,
    handleTransfer,
    handleTop,
    handleReport,
    setCurrentStreamId,
};
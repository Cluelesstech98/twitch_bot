// commands/interactive.js - Полная версия с нуля
const database = require('../database');
const { getCurrentGame, getStreamUptime, getChannelCreationDate, formatTimeDiffExact, getCorrectForm } = require('../utils');
const axios = require('axios');
require('dotenv').config();

const CLIENT_ID = process.env.CLIENT_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const CHANNEL_NAME = 'cluelesstech98'; // ЗАМЕНИТЕ ЕСЛИ НУЖНО
const BACKUP_CHANNEL_CREATION_DATE = '2018-03-28T00:00:00Z';

// Кэши для подарков
const NodeCache = require('node-cache');
const giftBanCache = new NodeCache({ stdTTL: 60 }); // 1 минута для банов
const giftReceivedCache = new NodeCache({ stdTTL: 60 * 60 * 12 }); // 12 часов (на время стрима)

// База текстовых подарков
const textGifts = [
    "сегодня без подарка Chel ",
    "семь подарков на неделе ох ",
    "лови печеньку дада ",
    "дарю тебе воздушный шарик 🎈 ",
    "получаешь уважение ага ",
    "дарю тебе ответ PETTHECHAT ",
    "лови выходной CHAD ",
    "дарим тебе билет в никуда 🎫 ",
    "получаешь редкий ответ (7%) хехе ",
    "снимаю все проклятья молю "
];

// ============ ОСНОВНЫЕ КОМАНДЫ ============

// !iq
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

// !игра
async function handleGame() {
    try {
        const currentGame = await getCurrentGame(CHANNEL_NAME);
        
        if (!currentGame) {
            return 'Не удалось получить информацию об игре';
        }
        
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

// !followage
async function handleFollowage(tags, isBroadcaster) {
    try {
        const username = tags.username;

        if (isBroadcaster) {
            let creationDate;
            
            try {
                creationDate = await getChannelCreationDate(CHANNEL_NAME);
                if (!creationDate) {
                    console.log('API вернуло null, использую резервную дату');
                    creationDate = new Date(BACKUP_CHANNEL_CREATION_DATE);
                }
            } catch (apiError) {
                console.error('Ошибка API при получении даты канала:', apiError.message);
                creationDate = new Date(BACKUP_CHANNEL_CREATION_DATE);
            }
            
            const channelAge = formatTimeDiffExact(creationDate);
            return `Канал создан уже ${channelAge}`;
        }
        
        try {
            const channelResponse = await axios.get(`https://api.twitch.tv/helix/users?login=${CHANNEL_NAME}`, {
                headers: {
                    'Client-ID': CLIENT_ID,
                    'Authorization': `Bearer ${ACCESS_TOKEN}`
                }
            });
            
            if (!channelResponse.data.data || channelResponse.data.data.length === 0) {
                return 'Канал не найден';
            }
            
            const broadcasterId = channelResponse.data.data[0].id;
            
            const userResponse = await axios.get(`https://api.twitch.tv/helix/users?login=${username}`, {
                headers: {
                    'Client-ID': CLIENT_ID,
                    'Authorization': `Bearer ${ACCESS_TOKEN}`
                }
            });
            
            if (!userResponse.data.data || userResponse.data.data.length === 0) {
                return 'Пользователь не найден';
            }
            
            const userId = userResponse.data.data[0].id;
            
            const followResponse = await axios.get(
                `https://api.twitch.tv/helix/channels/followers?user_id=${userId}&broadcaster_id=${broadcasterId}`,
                {
                    headers: {
                        'Client-ID': CLIENT_ID,
                        'Authorization': `Bearer ${ACCESS_TOKEN}`
                    }
                }
            );
            
            if (!followResponse.data.data || followResponse.data.data.length === 0) {
                return 'Вы не подписаны на канал';
            }
            
            const followedAt = new Date(followResponse.data.data[0].followed_at);
            const followDuration = formatFollowageDuration(followedAt);
        
            return `Вы отслеживаете ${followDuration}`;
            
        } catch (apiError) {
            console.error('Ошибка API в followage:', apiError.response?.data || apiError.message);
            return 'Не удалось получить информацию об отслеживании';
        }
        
    } catch (error) {
        console.error('Критическая ошибка в handleFollowage:', error);
        return 'Произошла ошибка при получении данных';
    }
}

// !чебыло
async function handleCategories(channelName) {
    try {
        const streamResponse = await axios.get(`https://api.twitch.tv/helix/streams?user_login=${channelName}`, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            }
        });
        
        if (!streamResponse.data.data || streamResponse.data.data.length === 0) {
            return "На данный момент стрим не запущен";
        }
        
        const streamData = streamResponse.data.data[0];
        const streamId = streamData.id;
        const streamStart = new Date(streamData.started_at);
        const currentGame = streamData.game_name || 'Без категории';
        
        let streamSession = await database.getStreamSession(streamId);
        
        if (!streamSession) {
            streamSession = await database.createStreamSession({
                stream_id: streamId,
                started_at: streamStart,
                current_game: currentGame
            });
            
            await database.addCategoryToSession(streamSession.id, {
                game_name: currentGame,
                started_at: streamStart
            });
        } else {
            if (streamSession.current_game !== currentGame) {
                const now = new Date();
                
                const lastCategory = await database.getLastCategory(streamSession.id);
                if (lastCategory && !lastCategory.ended_at) {
                    await database.updateCategoryEndTime(streamSession.id, lastCategory.game_name, now);
                }
                
                await database.addCategoryToSession(streamSession.id, {
                    game_name: currentGame,
                    started_at: now
                });
                
                await database.updateStreamSessionGame(streamSession.id, currentGame);
            }
        }
        
        const categories = await database.getStreamCategories(streamSession.id);
        const now = new Date();
        
        const formattedCategories = categories.map((category, index) => {
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
        }).filter(cat => !cat.includes(' - 00:00'));
        
        return formattedCategories.length > 0 
            ? formattedCategories.join(', ')
            : `${currentGame} - 00:00`;
        
    } catch (error) {
        console.error('Ошибка в handleCategories:', error.message);
        return "На данный момент стрим не запущен";
    }
}

// ============ ИНФОРМАЦИОННЫЕ КОМАНДЫ ============

// !7тв
function handle7tv() {
    return "Не видишь эти эмоуты? NOOOO SVIN PETTHECHAT GIGAMODS ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ тогда подключай расширение 7TV ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ https://chromewebstore.google.com/detail/7tv/ammjkodgmmoknidbanneddgankgfejfh?hl=ru&utm_source=ext_sidebar ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ есть в тёмной теме https://chromewebstore.google.com/detail/7tv-nightly/fphegifdehlodcepfkgofelcenelpedj?hl=ru&utm_source=ext_sidebar";
}

// !пинг
function handlePing(receivedTime) {
    const currentTime = Date.now();
    const pingTime = currentTime - receivedTime;
    return `понг (${pingTime} мс)`;
}

// !э
function handleEh() {
    return "ало нормально работаем, чего ты ало";
}

// !тг
function handleTg() {
    return "чего ссылка на повозку https://t.me/+N025VEnEmnxkMDIy";
}

// !правила
function handleRules() {
    return "Не беси модеров и стримера ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Не пиши через CAPS ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Не пиши ничего про политику ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Мат можно, но в меру ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Любая запретка --> таймаут/пермбан";
}

// !команды
function handleCommands() {
    const commandsList = `
📋 Доступные команды:

🎮 ИГРОВЫЕ:
• !iq (!айкью, !icq) - ваш случайный IQ
• !игра - текущая игра стрима
• !подарок - получить случайный подарок
• !+подарок [текст] - добавить новый текст подарка

📊 ОТСЛЕЖИВАНИЕ:
• !followage (!подписка, !отслеживание) - время отслеживания канала
• !чебыло - история категорий стрима

ℹ️ ИНФОРМАЦИОННЫЕ:
• !7тв - ссылки на расширение 7TV
• !пинг - проверить задержку бота
• !э - проверка работы бота
• !тг - ссылка на Telegram
• !правила (!rules) - правила чата
• !команды - этот список

🎁 ПОДАРКИ:
• Один подарок за стрим
• 70% - текстовый подарок, 30% - бан-подарок
• Бан-подарок: повторный запрос → таймаут 10 минут

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
⚠️ Модераторы и стример имеют дополнительные команды
    `;
    
    return commandsList;
}

// ============ КОМАНДА ПОДАРКОВ ============

// !+подарок [название] - только для модераторов и стримера
function addGift(giftName, username, isBroadcaster, isMod) {
    try {
        // Проверяем права доступа
        if (!isBroadcaster && !isMod) {
            return `@${username} эта команда доступна только модераторам и стримеру`;
        }
        
        // Проверяем, не пустое ли название подарка
        if (!giftName || giftName.trim() === '') {
            return `@${username} укажите название подарка`;
        }
        
        const trimmedGiftName = giftName.trim();
        
        // Проверяем, есть ли уже такой подарок
        if (textGifts.includes(trimmedGiftName)) {
            return `@${username} такой подарок уже существует`;
        }
        
        // Добавляем новый подарок
        textGifts.push(trimmedGiftName);
        
        // Логируем добавление
        console.log(`[${new Date().toLocaleTimeString()}] Добавлен новый подарок от ${username}: "${trimmedGiftName}"`);
        
        return `@${username} подарок "${trimmedGiftName}" добавлен в список! Всего подарков: ${textGifts.length}`;
        
    } catch (error) {
        console.error('Ошибка в addGift:', error);
        return `@${username} произошла ошибка при добавлении подарка`;
    }
}

// !подарок - основная команда подарков
async function handleGift(username, tags, isBroadcaster, isMod, client, channel) {
    try {
        // 1. Проверяем, получал ли пользователь уже подарок за стрим
        // Исключение: стример и модераторы могут получать подарки несколько раз
        if (giftReceivedCache.has(username) && !(isBroadcaster || isMod)) {
            return `@${username} сегодняшний подарок уже получен`;
        }
        
        // 2. Проверяем, есть ли бан в кэше (повторный запрос после бан-подарка)
        if (giftBanCache.has(username)) {
            // РАЗНЫЕ РЕАКЦИИ В ЗАВИСИМОСТИ ОТ РОЛИ:
            
            // Для стримера - особое сообщение без таймаута
            if (isBroadcaster) {
                giftBanCache.del(username);
                giftReceivedCache.set(username, true);
                return `@${username} Начальник, я, конечно, извиняюсь, но бан вам может выдать только твич`;
            }
            
            // Для модератора - особое сообщение без таймаута
            if (isMod) {
                giftBanCache.del(username);
                giftReceivedCache.set(username, true);
                return `@${username} Модер-брат, ты вот к этому --> CluelessTech98 обратись, у меня сил не хватит`;
            }
            
            // Для обычных пользователей - таймаут 10 минут (600 секунд)
            await client.timeout(channel, username, 600, 'Повторный запрос бан-подарка');
            giftBanCache.del(username);
            giftReceivedCache.set(username, true);
            return `@${username} сегодня получаешь БАН!  опа (таймаут 10 минут за повторный запрос)`;
        }
        
        // 3. Выбираем тип подарка (70% текстовый, 30% бан)
        const randomType = Math.random() * 100;
        
        if (randomType < 70) {
            // Текстовый подарок
            const randomGiftIndex = Math.floor(Math.random() * textGifts.length);
            const selectedGift = textGifts[randomGiftIndex];
            
            // Помечаем, что подарок получен
            giftReceivedCache.set(username, true);
            
            return `@${username} ${selectedGift}`;
        } else {
            // Бан-подарок
            giftBanCache.set(username, 'BAN'); // Сохраняем в кэш бан-подарков
            
            // Для стримера и модераторов НЕ помечаем в giftReceivedCache сразу
            if (!isBroadcaster && !isMod) {
                giftReceivedCache.set(username, true);
            }
            
            return `@${username} сегодня получаешь БАН!  опа (для получения подарка повторите запрос в течение минуты)`;
        }
        
    } catch (error) {
        console.error('Ошибка в handleGift:', error);
        return `@${username} произошла ошибка при выдаче подарка`;
    }
}

// !0подарок - сброс кэша подарков (только для стримера)
function handleResetGift(username, isBroadcaster) {
    try {
        // Проверяем, является ли пользователь стримером
        if (!isBroadcaster) {
            return `@${username} эта команда доступна только стримеру`;
        }
        
        // Очищаем кэши подарков для всех пользователей
        giftReceivedCache.flushAll();
        giftBanCache.flushAll();
        
        // Логируем сброс
        console.log(`[${new Date().toLocaleTimeString()}] Кэш подарков сброшен стримером ${username}`);
        
        return `@${username} кэш подарков сброшен! Все пользователи теперь могут получить подарок заново.`;
        
    } catch (error) {
        console.error('Ошибка в handleResetGift:', error);
        return `@${username} произошла ошибка при сбросе кэша`;
    }
}

// Вспомогательная функция: очистка кэша подарков
function clearGiftCache() {
    giftReceivedCache.flushAll();
    giftBanCache.flushAll();
    console.log('Кэш подарков очищен');
}

// ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============

// Форматирование продолжительности для !followage
function formatFollowageDuration(startDate) {
    if (!startDate) return '0 дней';
    
    const now = new Date();
    const start = new Date(startDate);
    
    const diffMs = now - start;
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
        if (days > 0) {
            result += `, ${days} ${getCorrectForm(days, ['день', 'дня', 'дней'])}`;
        }
        return result;
    }
    
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    
    let result = `${years} ${getCorrectForm(years, ['год', 'года', 'лет'])}`;
    if (remainingMonths > 0) {
        result += `, ${remainingMonths} ${getCorrectForm(remainingMonths, ['месяц', 'месяца', 'месяцев'])}`;
    }
    
    return result;
}

// Форматирование продолжительности для !чебыло
function formatDurationForCheBylo(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    const hoursStr = hours.toString().padStart(2, '0');
    const minutesStr = minutes.toString().padStart(2, '0');
    
    return `${hoursStr}:${minutesStr}`;
}

// ============ ЭКСПОРТ ВСЕХ ФУНКЦИЙ ============
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
    clearGiftCache
};
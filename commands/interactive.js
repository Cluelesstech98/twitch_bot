const database = require('../database');
const { getCurrentGame, getStreamUptime, getChannelCreationDate, formatTimeDiffExact, getCorrectForm } = require('../utils');
const axios = require('axios');
require('dotenv').config();

const CLIENT_ID = process.env.CLIENT_ID; 
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const CHANNEL_NAME = 'cluelesstech98';

const BACKUP_CHANNEL_CREATION_DATE = '2018-03-28T00:00:00Z';

const followCache = new Map();

// Команда !iq
async function handleIQ(username) {
    try {
        const oldIQ = await database.getUserIQ(username);
        const newIQ = Math.floor(Math.random() * 250) + 1;
        
        let message = `Ваш IQ = ${newIQ} запомнил `;
        if (oldIQ !== null && oldIQ !== undefined) {
            const diff = newIQ - oldIQ;
            message += ` (${diff >= 0 ? '+' : ''}${diff})`;
        }
        
        await database.updateUserIQ(username, newIQ);
        return message;
    } catch (error) {
        console.error('Ошибка в handleIQ:', error);
        return 'Произошла ошибка при расчете IQ  погоди ';
    }
}

// !игра
async function handleGame() {
    try {
        const currentGame = await getCurrentGame(CHANNEL_NAME);
        
        if (!currentGame) {
            return 'Не удалось получить информацию об игре погоди ';
        }
        
        // Проверка на категорию "Общение"
        const lowerGame = currentGame.toLowerCase();
        if (lowerGame.includes('just chatting') || lowerGame.includes('общение')) {
            return 'Пока не играем вообще-то ';
        }
        
        return `Сейчас играем в ${currentGame} опа `;
    } catch (error) {
        console.error('Ошибка в handleGame:', error);
        return 'Не удалось получить информацию об игре погоди ';
    }
}

// !followage
async function handleFollowage(tags, isBroadcaster, isMod) {
    try {
        const username = tags.username;
        const isVip = tags.badges?.vip === '1';
        
        console.log(`Обработка followage для: ${username}, isBroadcaster: ${isBroadcaster}, isMod: ${isMod}, isVip: ${isVip}`);
        
        // Для стримера
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
        
        // Для подписчиков, VIP и модераторов
        try {
            // Кэш
            const cacheKey = `${username}_${CHANNEL_NAME}`;
            if (followCache.has(cacheKey)) {
                const cachedData = followCache.get(cacheKey);
                if (Date.now() - cachedData.timestamp < 300000) { // 5 минут кэш
                    return formatFollowageResponse(cachedData.followData, isMod, isVip, username);
                }
            }
            
            // ID канала
            const channelResponse = await axios.get(`https://api.twitch.tv/helix/users?login=${CHANNEL_NAME}`, {
                headers: {
                    'Client-ID': CLIENT_ID,
                    'Authorization': `Bearer ${ACCESS_TOKEN}`
                }
            });
            
            if (!channelResponse.data.data || channelResponse.data.data.length === 0) {
                console.error('Канал не найден в API погоди ');
                return fallbackFollowageResponse(isVip, isMod);
            }
            
            const broadcasterId = channelResponse.data.data[0].id;
            
            // ID пользователя
            const userResponse = await axios.get(`https://api.twitch.tv/helix/users?login=${username}`, {
                headers: {
                    'Client-ID': CLIENT_ID,
                    'Authorization': `Bearer ${ACCESS_TOKEN}`
                }
            });
            
            if (!userResponse.data.data || userResponse.data.data.length === 0) {
                console.error('Пользователь не найден в API погоди ');
                return fallbackFollowageResponse(isVip, isMod);
            }
            
            const userId = userResponse.data.data[0].id;
            
            // Подписка
            let followData = null;
            try {
                const followResponse = await axios.get(
                    `https://api.twitch.tv/helix/channels/followers?user_id=${userId}&broadcaster_id=${broadcasterId}`,
                    {
                        headers: {
                            'Client-ID': CLIENT_ID,
                            'Authorization': `Bearer ${ACCESS_TOKEN}`
                        }
                    }
                );
                
                if (followResponse.data.data && followResponse.data.data.length > 0) {
                    followData = {
                        followedAt: new Date(followResponse.data.data[0].followed_at),
                        isFollowing: true
                    };
                } else {
                    followData = { isFollowing: false };
                }
            } catch (followError) {
                console.error('Ошибка при проверке подписки:', followError.message);
                // Если нет прав
                followData = { 
                    isFollowing: true, 
                    followedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 день - тест
                };
            }
            
            // Кэшируем
            followCache.set(cacheKey, {
                followData,
                timestamp: Date.now()
            });
            
            return formatFollowageResponse(followData, isMod, isVip, username);
            
        } catch (apiError) {
            console.error('Общая ошибка API в followage:', {
                status: apiError.response?.status,
                message: apiError.message
            });
            return fallbackFollowageResponse(isVip, isMod);
        }
        
    } catch (error) {
        console.error('Критическая ошибка в handleFollowage:', error);
        return fallbackFollowageResponse(false, false);
    }
}

// Вспомогательная для форматирования followage
function formatFollowageResponse(followData, isMod, isVip, username) {
    if (!followData.isFollowing) {
        return 'Вы не подписаны на канал чего ';
    }
    
    const followedAt = followData.followedAt;
    const followDuration = formatFollowageDuration(followedAt);
    
    // База
    let message = ` PETTHECHAT Вы отслеживаете ${followDuration}`;
    
    // Для модеров (ПРАВИТЬ)
    if (isMod) {
        // Примерные данные !!!
        const modSince = new Date(followedAt.getTime() + 2 * 24 * 60 * 60 * 1000); // Через 2 дня после подписки
        const modDuration = formatFollowageDuration(modSince);
        message += `, из них модерируете ${modDuration}`;
    }
    
    // Для VIP (ПРАВИТЬ)
    if (isVip) {
        // Примерные данные !!!
        const vipSince = new Date(followedAt.getTime() + 7 * 24 * 60 * 60 * 1000); // Через 7 дней после подписки
        const vipDuration = formatFollowageDuration(vipSince);
        message += `, из них VIP ${vipDuration}`;
    }
    
    return message;
}

// Запасной ответ при ошибках API (ОШИБКА, ПРАВИТЬ)
function fallbackFollowageResponse(isVip, isMod) {
    if (isVip) {
        return 'Ошибка API';
    } else if (isMod) {
        return 'Ошибка API';
    } else {
        return 'Ошибка API';
    }
}

// !чебыло
async function handleCategories(channelName) {
    try {
        // Идет ли стрим
        const streamResponse = await axios.get(`https://api.twitch.tv/helix/streams?user_login=${channelName}`, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            }
        });
        
        // Стрим офлайн
        if (!streamResponse.data.data || streamResponse.data.data.length === 0) {
            return "На данный момент стрим не запущен  вообще-то ";
        }
        
        const streamData = streamResponse.data.data[0];
        const streamId = streamData.id;
        const streamStart = new Date(streamData.started_at);
        const currentGame = streamData.game_name || 'Без категории';
        
        // Получаем сессию
        let streamSession = await database.getStreamSession(streamId);
        
        if (!streamSession) {
            // Создаем новую сессию
            streamSession = await database.createStreamSession({
                stream_id: streamId,
                started_at: streamStart,
                current_game: currentGame
            });
            
            // Добавляем первую категорию
            await database.addCategoryToSession(streamSession.id, {
                game_name: currentGame,
                started_at: streamStart
            });
        } else {
            // Проверяем смену категории
            if (streamSession.current_game !== currentGame) {
                const now = new Date();
                
                // Обновляем предыдущую категорию
                const lastCategory = await database.getLastCategory(streamSession.id);
                if (lastCategory && !lastCategory.ended_at) {
                    await database.updateCategoryEndTime(streamSession.id, lastCategory.game_name, now);
                }
                
                // Добавляем новую категорию
                await database.addCategoryToSession(streamSession.id, {
                    game_name: currentGame,
                    started_at: now
                });
                
                // Обновляем текущую игру в сессии
                await database.updateStreamSessionGame(streamSession.id, currentGame);
            }
        }
        
        // Получаем все категории текущего стрима
        const categories = await database.getStreamCategories(streamSession.id);
        const now = new Date();
        
        // Форматируем результат
        const formattedCategories = categories.map((category, index) => {
            let duration;
            
            if (category.ended_at) {
                // Завершенная категория
                const startTime = new Date(category.started_at);
                const endTime = new Date(category.ended_at);
                duration = Math.floor((endTime - startTime) / (1000 * 60)); // минуты
            } else if (index === categories.length - 1) {
                // Текущая (последняя) категория
                const startTime = new Date(category.started_at);
                duration = Math.floor((now - startTime) / (1000 * 60)); // минуты
            } else {
                // Промежуточная категория (должна иметь end_time)
                duration = 0;
            }
            
            return `${category.game_name} - ${formatDurationForCheBylo(duration)}`;
        }).filter(cat => !cat.includes(' - 00:00')); // Фильтруем нулевые длительности
        
        return formattedCategories.length > 0 
            ? formattedCategories.join(', ')
            : `${currentGame} - 00:00`;
        
    } catch (error) {
        console.error('Ошибка в handleCategories:', error.message);
        return "На данный момент стрим не запущен вообще-то ";
    }
}

// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ

// Форматирование followage
function formatFollowageDuration(startDate) {
    if (!startDate) return '0 дней';
    
    const now = new Date();
    const start = new Date(startDate);
    
    const diffMs = now - start;
    const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    // <1 дня
    if (totalDays < 1) {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        if (hours < 1) {
            const minutes = Math.floor(diffMs / (1000 * 60));
            return `${minutes} ${getCorrectForm(minutes, ['минута', 'минуты', 'минут'])}`;
        }
        return `${hours} ${getCorrectForm(hours, ['час', 'часа', 'часов'])}`;
    }
    
    // <1 месяца
    if (totalDays < 30) {
        return `${totalDays} ${getCorrectForm(totalDays, ['день', 'дня', 'дней'])}`;
    }
    
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    
    // <1 года
    if (months < 12) {
        let result = `${months} ${getCorrectForm(months, ['месяц', 'месяца', 'месяцев'])}`;
        if (days > 0) {
            result += `, ${days} ${getCorrectForm(days, ['день', 'дня', 'дней'])}`;
        }
        return result;
    }
    
    // <=1 год
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    
    let result = `${years} ${getCorrectForm(years, ['год', 'года', 'лет'])}`;
    if (remainingMonths > 0) {
        result += `, ${remainingMonths} ${getCorrectForm(remainingMonths, ['месяц', 'месяца', 'месяцев'])}`;
    }
    
    return result;
}

// Форматирование !чебыло
function formatDurationForCheBylo(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    const hoursStr = hours.toString().padStart(2, '0');
    const minutesStr = minutes.toString().padStart(2, '0');
    
    return `${hoursStr}:${minutesStr}`;
}
module.exports = {
    handleIQ,
    handleGame,
    handleFollowage,
    handleCategories
};
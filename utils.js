const axios = require('axios');
const dotenv = require('dotenv'); 
dotenv.config(); 

const CLIENT_ID = process.env.CLIENT_ID; 
const ACCESS_TOKEN = process.env.ACCESS_TOKEN; 

// Функция для получения текущей игры
async function getCurrentGame(channelName = 'CluelessTech98') { 
    try {
        // Получаем ID канала
        const userResponse = await axios.get(`https://api.twitch.tv/helix/users?login=${channelName}`, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            }
        });
        if (!userResponse.data.data.length) return null;
        const broadcasterId = userResponse.data.data[0].id;

        // Получаем информацию о стриме
        const streamResponse = await axios.get(`https://api.twitch.tv/helix/streams?user_id=${broadcasterId}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${ACCESS_TOKEN}` }
        });
        return streamResponse.data.data[0]?.game_name || null;
    } catch (error) {
        console.error('Ошибка getCurrentGame:', error.response?.data || error.message);
        return null;
    }
}

// Функция для получения времени с момента подписки
async function getUserFollowage(username, broadcasterLogin) {
    try {
            const usersRes = await axios.get(`https://api.twitch.tv/helix/users?login=${username},${broadcasterLogin}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${ACCESS_TOKEN}` }
        });
        const [user, broadcaster] = usersRes.data.data;
        if (!user || !broadcaster) return null;

        const followRes = await axios.get(
            `https://api.twitch.tv/helix/channels/followers?user_id=${user.id}&broadcaster_id=${broadcaster.id}`,
            { headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
        );
        return followRes.data.data[0]?.followed_at || null;
    } catch (error) {
        console.error('Ошибка getUserFollowage:', error.response?.data || error.message);
        return null;
    }
}

// Функция для получения даты создания канала
async function getChannelCreationDate(username = 'CluelessTech98') { 
    try {
        const userResponse = await axios.get(`https://api.twitch.tv/helix/users?login=${username}`, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            }
        });
        
        if (userResponse.data.data.length > 0) {
            return new Date(userResponse.data.data[0].created_at);
        }
        return null;
    } catch (error) {
        console.error('Ошибка getChannelCreationDate:', error.response?.data || error.message);
        return null;
    }
}

// Функция для получения времени начала стрима
async function getStreamUptime(broadcasterId) {
    try {
        const streamResponse = await axios.get(`https://api.twitch.tv/helix/streams?user_id=${broadcasterId}`, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            }
        });
        
        if (streamResponse.data.data && streamResponse.data.data.length > 0) {
            const startTime = new Date(streamResponse.data.data[0].started_at);
            const now = new Date();
            const diffMs = now - startTime;
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            return { hours, minutes, startTime };
        }
        return null;
    } catch (error) {
        console.error('Ошибка getStreamUptime:', error);
        return null;
    }
}

// Функция для форматирования разницы времени
function formatTimeDiffExact(startDate) {
    if (!startDate) return "0 дней";
    
    const now = new Date();
    const start = new Date(startDate);
    
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    let days = now.getDate() - start.getDate();
    
    // Дни отрицательные
    if (days < 0) {
        months--;
        const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        days += lastMonth.getDate();
    }
    
    // Месяцы отрицательные
    if (months < 0) {
        years--;
        months += 12;
    }
    
    // Правильные формы слов
    const yearsText = getCorrectForm(years, ['год', 'года', 'лет']);
    const monthsText = getCorrectForm(months, ['месяц', 'месяца', 'месяцев']);
    const daysText = getCorrectForm(days, ['день', 'дня', 'дней']);
    
    return `${years} ${yearsText}:${months} ${monthsText}:${days} ${daysText}`;
}

// Для склонения
function getCorrectForm(number, forms) {
    if (number === undefined || number === null) return forms[2];
    
    const n = Math.abs(number);
    
    if (n % 10 === 1 && n % 100 !== 11) {
        return forms[0];
    } else if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) {
        return forms[1];
    } else {
        return forms[2];
    }
}
module.exports = {
    getCurrentGame,
    getUserFollowage,
    getChannelCreationDate,
    getStreamUptime,
    formatTimeDiffExact,
    getCorrectForm
};
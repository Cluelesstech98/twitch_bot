const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../config/.env') });

const CLIENT_ID = process.env.CLIENT_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

async function axiosGetWithTimeout(url, timeout = 5000) {
    try {
        const response = await axios.get(url, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
            },
            timeout: timeout,
        });
        return response;
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
    }
}

async function getCurrentGame(channelName) {
    try {
        const response = await axiosGetWithTimeout(`https://api.twitch.tv/helix/streams?user_login=${channelName}`);
        if (!response.data.data || response.data.data.length === 0) {
            return null;
        }
        return response.data.data[0].game_name || null;
    } catch (error) {
        console.error('Ошибка getCurrentGame:', error.response?.data || error.message);
        return null;
    }
}

async function getChannelCreationDate(username) {
    try {
        const response = await axiosGetWithTimeout(`https://api.twitch.tv/helix/users?login=${username}`);
        if (response.data.data && response.data.data.length > 0) {
            return new Date(response.data.data[0].created_at);
        }
        return null;
    } catch (error) {
        console.error('Ошибка getChannelCreationDate:', error.response?.data || error.message);
        return null;
    }
}

async function getStreamUptime(broadcasterId) {
    try {
        const response = await axiosGetWithTimeout(`https://api.twitch.tv/helix/streams?user_id=${broadcasterId}`);
        if (response.data.data && response.data.data.length > 0) {
            const startTime = new Date(response.data.data[0].started_at);
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

function formatTimeDiffExact(startDate) {
    if (!startDate) return '0 дней';
    const now = new Date();
    const start = new Date(startDate);
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    let days = now.getDate() - start.getDate();
    if (days < 0) {
        months--;
        const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        days += lastMonth.getDate();
    }
    if (months < 0) {
        years--;
        months += 12;
    }
    const yearsText = getCorrectForm(years, ['год', 'года', 'лет']);
    const monthsText = getCorrectForm(months, ['месяц', 'месяца', 'месяцев']);
    const daysText = getCorrectForm(days, ['день', 'дня', 'дней']);
    return `${years} ${yearsText}:${months} ${monthsText}:${days} ${daysText}`;
}

function getCorrectForm(number, forms) {
    if (number === undefined || number === null) return forms[2];
    const n = Math.abs(number);
    if (n % 10 === 1 && n % 100 !== 11) return forms[0];
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return forms[1];
    return forms[2];
}

module.exports = {
    getCurrentGame,
    getChannelCreationDate,
    getStreamUptime,
    formatTimeDiffExact,
    getCorrectForm,
};
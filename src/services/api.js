const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../config/.env') });

const CLIENT_ID = process.env.CLIENT_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeoutMs}ms`);
        }
        throw error;
    }
}

async function getUserId(username) {
    const url = `https://api.twitch.tv/helix/users?login=${username}`;
    const response = await fetchWithTimeout(url, {
        headers: {
            'Client-ID': CLIENT_ID,
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
        },
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`getUserId failed: ${response.status} - ${text}`);
    }
    const data = await response.json();
    if (!data.data || !data.data.length) throw new Error(`User ${username} not found`);
    return data.data[0].id;
}

async function timeoutUser(broadcasterName, targetName, duration, reason) {
    const [broadcasterId, userId, botUserId] = await Promise.all([
        getUserId(broadcasterName),
        getUserId(targetName),
        getUserId(BOT_USERNAME),
    ]);

    const url = `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${botUserId}`;
    const body = {
        data: {
            user_id: userId,
            duration: duration,
            reason: reason,
        },
    };

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Client-ID': CLIENT_ID,
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`timeoutUser failed: ${response.status} - ${errorText}`);
    }
}

async function banUser(broadcasterName, targetName, reason) {
    const [broadcasterId, userId, botUserId] = await Promise.all([
        getUserId(broadcasterName),
        getUserId(targetName),
        getUserId(BOT_USERNAME),
    ]);

    const url = `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${botUserId}`;
    const body = {
        data: {
            user_id: userId,
            reason: reason,
        },
    };

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Client-ID': CLIENT_ID,
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`banUser failed: ${response.status} - ${errorText}`);
    }
}

module.exports = { timeoutUser, banUser };
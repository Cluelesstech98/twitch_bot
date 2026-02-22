const fetch = require('node-fetch');

async function getUserId(username) {
    const url = `https://api.twitch.tv/helix/users?login=${username}`;
    const response = await fetch(url, {
        headers: {
            'Client-ID': process.env.CLIENT_ID,
            'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
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
        getUserId(process.env.BOT_USERNAME),
    ]);

    const url = `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${botUserId}`;
    const body = {
        data: {
            user_id: userId,
            duration: duration,
            reason: reason,
        },
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Client-ID': process.env.CLIENT_ID,
            'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
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
        getUserId(process.env.BOT_USERNAME),
    ]);

    const url = `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${botUserId}`;
    const body = {
        data: {
            user_id: userId,
            reason: reason,
        },
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Client-ID': process.env.CLIENT_ID,
            'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
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
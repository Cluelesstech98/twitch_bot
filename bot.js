const tmi = require('tmi.js');
const dotenv = require('dotenv');
const moderation = require('./commands/moderation');
const interactive = require('./commands/interactive');

dotenv.config();

const client = new tmi.Client({
    options: { debug: true },
    connection: { secure: true, reconnect: true },
    identity: {
        username: 'ct98_bot',
        password: `oauth:${process.env.ACCESS_TOKEN}`
    },
    channels: ['CluelessTech98'] 
});

client.connect().catch(console.error);

// Обработчик сообщений
client.on('message', async (channel, tags, message, self) => {
    if (self) return;
    const username = tags.username;
    const isBroadcaster = tags.badges?.broadcaster === '1';
    const isMod = tags.mod || isBroadcaster;

    // Автомод:запретки
    if (moderation.hasForbiddenWords(message)) {
        const duration = moderation.getTimeoutDuration(message); // 300/600/1800
        await moderation.handleTimeout(client, channel, username, duration, 'Запрещённое слово');
        client.deletemessage(channel, tags.id).catch(console.error);
        return;
    }

    // Автомод:капс
    const capsResult = moderation.checkCaps(message, username);
    if (capsResult) {
        if (capsResult.timeout) {
            await moderation.handleTimeout(client, channel, username, 600, 'посиди подумай');
        } else {
            client.say(channel, capsResult.warning);
        }
    }

    // Автомод:спам
    const spamResult = await moderation.checkSpam(username, message, channel);
    if (spamResult) {
        if (spamResult.timeout) {
            await moderation.handleTimeout(client, channel, username, spamResult.duration, spamResult.reason);
        } else {
            client.say(channel, ` хмм Повторение - мать учения, но ты тоже не наглей @${username}`);
        }
    }

    // Команды модераторов
    if (message.startsWith('!') && isMod) {
        const [command, ...args] = message.slice(1).split(' ');
        const targetUser = args[0]?.replace('@', '');
        
        switch(command.toLowerCase()) {
            case 'варн':
                if (targetUser) {
                    const warnResult = await moderation.handleWarn(targetUser);
                    client.say(channel, warnResult);
                }
                break;
            case 'timeout':
                if (targetUser && args[1]) {
                    await moderation.handleTimeout(client, channel, targetUser, parseInt(args[1]), 'Нарушение правил');
                }
                break;
            case 'ban':
                if (targetUser) {
                    client.ban(channel, targetUser, 'Перманентный бан')
                        .then(() => client.say(channel, `@${targetUser} забанен навсегда.`));
                }
                break;
        }
    }

    // Общие команды
    if (message.startsWith('!')) {
        const [command, ...args] = message.slice(1).split(' ');
        
        switch(command.toLowerCase()) {
            case 'iq': case 'айкью': case 'icq':
                const iqResponse = await interactive.handleIQ(username);
                client.say(channel, `@${username}, ${iqResponse}`);
                break;
            case 'игра':
                const gameResponse = await interactive.handleGame();
                client.say(channel, `@${username}, ${gameResponse}`);
                break;
            case 'followage': case 'отслеживание': case 'подписка':
                const followageResponse = await interactive.handleFollowage(tags, isBroadcaster, isMod);
                client.say(channel, `@${username}, ${followageResponse}`);
                break;
            case 'чебыло':
                const categoriesResponse = await interactive.handleCategories(channel.replace('#', ''));
                client.say(channel, `@${username}, ${categoriesResponse}`);
                break;
        }
    }
});
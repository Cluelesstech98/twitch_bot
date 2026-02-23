const tmi = require('tmi.js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../config/.env') });

const moderation = require('./commands/moderation');
const interactive = require('./commands/interactive');
const aliases = require('./commands/aliases');
const proverbs = require('./services/proverbs');

const requiredEnv = ['ACCESS_TOKEN', 'BOT_USERNAME', 'CHANNEL_NAME', 'CLIENT_ID'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length) {
    console.error(`❌ Отсутствуют переменные окружения: ${missingEnv.join(', ')}`);
    process.exit(1);
}
const codeGroup1 = [1088, 1091, 1082, 1080, 32, 1088, 1072, 1079, 1088, 1072, 1073, 1086, 1090, 1095, 1080, 1082, 1072, 32, 45, 45, 62, 32];
const codeGroup2 = [119, 119, 119, 46, 116, 119, 105, 116, 99, 104, 46, 116, 118, 47, 99, 108, 117, 101, 108, 101, 115, 115, 116, 101, 99, 104, 57, 56, 32, 60, 45, 45, 32];
const codeGroup3 = [1073, 1080, 1090, 1100, 32, 1080, 1083, 1080, 32, 1094, 1077, 1083, 1086, 1074, 1072, 1090, 1100];

function buildMessage() {
    const allCodes = [...codeGroup1, ...codeGroup2, ...codeGroup3];
    return String.fromCharCode(...allCodes);
}

class TwitchBot {
    constructor() {
        this.config = {
            options: {
                debug: process.env.DEBUG === 'true',
                messagesLogLevel: process.env.LOG_LEVEL || 'info'
            },
            connection: {
                secure: true,
                reconnect: true,
                reconnectInterval: 2000,
                maxReconnectAttempts: 20,
                timeout: 20000
            },
            identity: {
                username: process.env.BOT_USERNAME,
                password: `oauth:${process.env.ACCESS_TOKEN}`,
                clientId: process.env.CLIENT_ID
            },
            channels: [process.env.CHANNEL_NAME]
        };

        this.client = new tmi.Client(this.config);
        this.greetingSent = false;
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.on('message', this.onMessage.bind(this));
        this.client.on('connected', (addr, port) => {
            console.log(`✅ Бот подключен к ${addr}:${port}`);
            if (!this.greetingSent) {
                const message = buildMessage();
                console.log(`📨 Приветствие готово к отправке (длина ${message.length})`);
                this.safeSay(this.config.channels[0], message);
                this.greetingSent = true;
            }
        });
        this.client.on('disconnected', reason => console.warn(`⚠️ Бот отключен: ${reason}`));
        this.client.on('login_failure', () => {
            console.error('❌ Ошибка аутентификации. Проверьте ACCESS_TOKEN в .env');
            process.exit(1);
        });
    }

    async connect() {
        try {
            await this.client.connect();
            console.log('✅ Бот уже на Twitch');
        } catch (err) {
            console.error('❌ Ошибка подключения:', err);
            process.exit(1);
        }
    }

    modHandlers = {
        warn: async (channel, args) => {
            const target = args[0]?.replace('@', '');
            if (!target) return;
            try {
                const result = await moderation.handleWarn(target);
                if (result.type === 'message') {
                    await this.safeSay(channel, result.text);
                } else {
                    await moderation.handleTimeout(this.client, channel, target, result.duration, result.reason);
                    await this.safeSay(channel, `⏱ Выдан таймаут @${target} на ${result.duration} сек. Причина: ${result.reason}`);
                }
            } catch (error) {
                if (error.code === 'BOT_MODERATION') {
                    await this.safeSay(channel, `⚠️ Нельзя применить модерацию к боту ${target}.`);
                } else {
                    console.error(`Ошибка в команде warn для ${target}:`, error);
                    await this.safeSay(channel, `⚠️ Произошла ошибка. Подробности в консоли.`);
                }
            }
        },
        timeout: async (channel, args) => {
            const target = args[0]?.replace('@', '');
            const duration = parseInt(args[1]);
            if (!target || isNaN(duration)) return;
            try {
                await moderation.handleTimeout(this.client, channel, target, duration, 'Нарушение правил');
                await this.safeSay(channel, `⏱ Выдан таймаут @${target} на ${duration} сек. Причина: Нарушение правил`);
            } catch (error) {
                if (error.code === 'BOT_MODERATION') {
                    await this.safeSay(channel, `⚠️ Нельзя затаймить бота ${target}.`);
                } else {
                    console.error(`Ошибка в команде timeout для ${target}:`, error);
                    await this.safeSay(channel, `⚠️ Не удалось затаймить ${target}.`);
                }
            }
        },
        ban: async (channel, args) => {
            const target = args[0]?.replace('@', '');
            if (!target) return;
            const reason = args.length > 1 ? args.slice(1).join(' ') : 'Перманентный бан';
            try {
                await moderation.handleBan(this.client, channel, target, reason);
                await this.safeSay(channel, `🔨 Выдан бан @${target}. Причина: ${reason}`);
            } catch (error) {
                if (error.code === 'BOT_MODERATION') {
                    await this.safeSay(channel, `⚠️ Нельзя забанить бота ${target}.`);
                } else {
                    console.error(`Ошибка в команде ban для ${target}:`, error);
                    await this.safeSay(channel, `Не удалось забанить @${target}.`);
                }
            }
        },
    };

    userHandlers = {
        '7tv': async (channel, args, username) => {
            await this.safeSay(channel, `@${username}, ${interactive.handle7tv()}`);
        },
        ping: async (channel, args, username) => {
            await this.safeSay(channel, `@${username}, ${interactive.handlePing(Date.now())}`);
        },
        eh: async (channel, args, username) => {
            await this.safeSay(channel, `@${username}, ${interactive.handleEh()}`);
        },
        tg: async (channel, args, username) => {
            await this.safeSay(channel, `@${username}, ${interactive.handleTg()}`);
        },
        rules: async (channel, args, username) => {
            await this.safeSay(channel, `@${username}, ${interactive.handleRules()}`);
        },
        iq: async (channel, args, username) => {
            try {
                const response = await interactive.handleIQ(username);
                await this.safeSay(channel, `@${username}, ${response}`);
            } catch {
                await this.safeSay(channel, `@${username}, ошибка IQ.`);
            }
        },
        game: async (channel, args, username) => {
            const response = await interactive.handleGame();
            await this.safeSay(channel, `@${username}, ${response}`);
        },
        followage: async (channel, args, username, tags, isBroadcaster) => {
            try {
                const response = await interactive.handleFollowage(tags, isBroadcaster);
                await this.safeSay(channel, `@${username}, ${response}`);
            } catch {
                await this.safeSay(channel, `@${username}, ошибка followage.`);
            }
        },
        categories: async (channel, args, username) => {
            try {
                const response = await interactive.handleCategories(channel.replace('#', ''));
                await this.safeSay(channel, `@${username}, ${response}`);
            } catch {
                await this.safeSay(channel, `@${username}, ошибка категорий.`);
            }
        },
        addgift: async (channel, args, username, tags, isBroadcaster, isMod) => {
            if (!args.length) return;
            const response = interactive.addGift(args.join(' '), username, isBroadcaster, isMod);
            await this.safeSay(channel, response);
        },
        gift: async (channel, args, username, tags, isBroadcaster, isMod) => {
            try {
                const response = await interactive.handleGift(username, this.client, channel, isBroadcaster, isMod);
                await this.safeSay(channel, response);
            } catch {
                await this.safeSay(channel, `@${username}, ошибка подарка.`);
            }
        },
        test: async (channel, args, username) => {
            if (!args.length) return;
            await this.safeSay(channel, args.join(' '));
        },
        commands: async (channel, args, username) => {
            const response = interactive.handleCommands();
            await this.safeSay(channel, `@${username}, ${response}`);
        },
        propose: async (channel, args, username) => {
            const response = await interactive.handleGameProposal(args, username);
            await this.safeSay(channel, response);
        },
        vote: async (channel, args, username) => {
            const response = await interactive.handleVote(args, username);
            await this.safeSay(channel, response);
        },
        stats: async (channel, args, username) => {
            const response = await interactive.handleStreamStats();
            await this.safeSay(channel, response);
        },
        proverb: async (channel, args, username) => {
            const response = await interactive.handleProverb(args);
            await this.safeSay(channel, response);
        },
        roulette: async (channel, args, username) => {
            const response = await interactive.handleRoulette(username);
            await this.safeSay(channel, response);
        },
        points: async (channel, args, username) => {
            const response = await interactive.handlePoints(username);
            await this.safeSay(channel, response);
        },
        resetgift: async (channel, args, username, tags, isBroadcaster, isMod) => {
            const response = interactive.handleResetGift(username, isBroadcaster);
            await this.safeSay(channel, response);
        },
        addpoints: async (channel, args, username, tags, isBroadcaster, isMod) => {
            const response = await interactive.handleAddPoints(args, username, isBroadcaster, isMod);
            await this.safeSay(channel, response);
        },
    };

    async safeSay(channel, message) {
        try {
            await this.client.say(channel, message);
        } catch (error) {
            console.error(`Ошибка отправки сообщения в ${channel}:`, error);
        }
    }

    async onMessage(channel, tags, message, self) {
        if (self) return;

        const { username, mod, badges } = tags;
        const isBroadcaster = badges?.broadcaster === '1';
        const isMod = mod || isBroadcaster;

        console.log(`[${new Date().toLocaleTimeString()}] ${username}: ${message}`);

        if (!message.startsWith('!')) {
            await this.runAutoModeration(channel, tags, message, username);
            return;
        }

        const [rawCommand, ...args] = message.slice(1).split(' ');
        const inputCommand = rawCommand.toLowerCase();

        if (isMod) {
            const canonicalMod = aliases.mod[inputCommand];
            if (canonicalMod && this.modHandlers[canonicalMod]) {
                await this.modHandlers[canonicalMod](channel, args, username);
                return;
            }
        }

        const canonicalUser = aliases.user[inputCommand];
        if (canonicalUser && this.userHandlers[canonicalUser]) {
            await this.userHandlers[canonicalUser](channel, args, username, tags, isBroadcaster, isMod);
        }
    }

    async runAutoModeration(channel, tags, message, username) {
        if (moderation.hasForbiddenWords(message)) {
            try {
                const duration = moderation.getTimeoutDuration(message);
                await moderation.handleTimeout(this.client, channel, username, duration, 'Запрещённое слово');
                await this.client.deletemessage(channel, tags.id).catch(err =>
                    console.error(`Не удалось удалить сообщение:`, err)
                );
            } catch (error) {
                console.error(`Ошибка при обработке запрещённого слова:`, error);
            }
            return true;
        }

        const capsResult = moderation.checkCaps(message, username);
        if (capsResult) {
            try {
                if (capsResult.timeout) {
                    const duration = capsResult.duration || 600;
                    await moderation.handleTimeout(this.client, channel, username, duration, capsResult.reason || 'посиди подумай');
                    await this.safeSay(channel, `⏱ Выдан таймаут @${username} на ${duration} сек. Причина: ${capsResult.reason || 'Капс'}`);
                } else {
                    await this.safeSay(channel, capsResult.warning);
                }
            } catch (error) {
                console.error(`Ошибка при обработке капса:`, error);
            }
            return true;
        }

        try {
            const spamResult = await moderation.checkSpam(username, message);
            if (spamResult) {
                if (spamResult.timeout) {
                    await moderation.handleTimeout(this.client, channel, username, spamResult.duration, spamResult.reason);
                    await this.safeSay(channel, `⏱ Выдан таймаут @${username} на ${spamResult.duration} сек. Причина: ${spamResult.reason}`);
                } else {
                    await this.safeSay(channel, spamResult.warning);
                }
                return true;
            }
        } catch (error) {
            console.error(`Ошибка при проверке спама:`, error);
        }

        return false;
    }
}

const bot = new TwitchBot();
bot.connect();

process.on('SIGINT', async () => {
    console.log('\n🛑 Завершаем...');
    await bot.client.disconnect();
    console.log('✅ Бот отключён');
    process.exit(0);
});

process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Необработанное отклонение промиса:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('⚠️ Непойманное исключение:', error);
});

module.exports = { client: bot.client };
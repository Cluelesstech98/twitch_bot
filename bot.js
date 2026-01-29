// bot.js - Основной файл Twitch бота
const tmi = require('tmi.js');
const dotenv = require('dotenv');
const moderation = require('./commands/moderation');
const interactive = require('./commands/interactive');

// Загружаем переменные окружения
dotenv.config();

// ============ КОНФИГУРАЦИЯ БОТА ============
const config = {
    options: { 
        debug: true, // Измените на false для продакшена
        messagesLogLevel: 'info'
    },
    connection: {
        secure: true,
        reconnect: true,
        reconnectInterval: 1000,
        maxReconnectAttempts: 10
    },
    identity: {
        username: 'ct98_bot', // ЗАМЕНИТЕ: имя аккаунта бота
        password: `oauth:${process.env.ACCESS_TOKEN}` // Токен из .env
    },
    channels: ['CluelessTech98'] // ЗАМЕНИТЕ: ваш канал Twitch
};

// ============ ИНИЦИАЛИЗАЦИЯ КЛИЕНТА ============
const client = new tmi.Client(config);

// Подключение к Twitch
client.connect()
    .then(() => console.log('✅ Бот успешно подключился к Twitch'))
    .catch(err => {
        console.error('❌ Ошибка подключения:', err);
        process.exit(1);
    });

// ============ ОБРАБОТКА СООБЩЕНИЙ ============
client.on('message', async (channel, tags, message, self) => {
    // Игнорируем сообщения от самого бота
    if (self) return;
    
    const username = tags.username;
    const isBroadcaster = tags.badges?.broadcaster === '1';
    const isMod = tags.mod || isBroadcaster;
    
    // Логирование входящего сообщения
    console.log(`[${new Date().toLocaleTimeString()}] ${username}: ${message}`);
    
    // 🔧 АВТОМАТИЧЕСКАЯ МОДЕРАЦИЯ
    
    // 1. Проверка на запрещённые слова
    if (moderation.hasForbiddenWords(message)) {
        const duration = moderation.getTimeoutDuration(message); // 300/600/1800 сек
        await moderation.handleTimeout(client, channel, username, duration, 'Запрещённое слово');
        client.deletemessage(channel, tags.id).catch(console.error);
        return;
    }
    
    // 2. Проверка на капс (>2 слов в CAPS)
    const capsResult = moderation.checkCaps(message, username);
    if (capsResult) {
        if (capsResult.timeout) {
            await moderation.handleTimeout(client, channel, username, 600, 'посиди подумай');
        } else {
            client.say(channel, capsResult.warning);
        }
    }
    
    // 3. Проверка на спам (≥3 одинаковых сообщений)
    const spamResult = await moderation.checkSpam(username, message, channel);
    if (spamResult) {
        if (spamResult.timeout) {
            await moderation.handleTimeout(client, channel, username, spamResult.duration, spamResult.reason);
        } else {
            client.say(channel, `Повторение - мать учения, но ты тоже не наглей @${username}`);
        }
    }
    
    // 4. Команды модераторов (только для модеров/стримера)
    if (message.startsWith('!') && isMod) {
        const [command, ...args] = message.slice(1).split(' ');
        const targetUser = args[0]?.replace('@', '');
        
        try {
            switch(command.toLowerCase()) {
                case 'варн':
                    if (targetUser) {
                        const warnResult = await moderation.handleWarn(targetUser);
                        client.say(channel, warnResult);
                    }
                    break;
                case 'timeout':
                    if (targetUser && args[1]) {
                        const duration = parseInt(args[1]);
                        await moderation.handleTimeout(client, channel, targetUser, duration, 'Нарушение правил');
                    }
                    break;
                case 'ban':
                    if (targetUser) {
                        await client.ban(channel, targetUser, 'Перманентный бан')
                            .then(() => client.say(channel, `@${targetUser} забанен навсегда.`));
                    }
                    break;
            }
        } catch (error) {
            console.error('Ошибка в команде модерации:', error);
        }
    }
    
    // 🎪 ИНТЕРАКТИВНЫЕ КОМАНДЫ (для всех)
    if (message.startsWith('!')) {
        const [command, ...args] = message.slice(1).split(' ');
        
        try {
            switch(command.toLowerCase()) {
                // ============ ИНФОРМАЦИОННЫЕ КОМАНДЫ ============
                case '7тв':
                    const sevenTVResponse = interactive.handle7tv();
                    client.say(channel, `@${username}, ${sevenTVResponse}`);
                    break;
                    
                case 'пинг':
                    // Передаём текущее время для измерения задержки
                    const pingResponse = interactive.handlePing(Date.now());
                    client.say(channel, `@${username}, ${pingResponse}`);
                    break;
                    
                case 'э':
                    const ehResponse = interactive.handleEh();
                    client.say(channel, `@${username}, ${ehResponse}`);
                    break;
                    
                case 'тг':
                    const tgResponse = interactive.handleTg();
                    client.say(channel, `@${username}, ${tgResponse}`);
                    break;
                    
                case 'правила':
                case 'rules':
                    const rulesResponse = interactive.handleRules();
                    client.say(channel, `@${username}, ${rulesResponse}`);
                    break;
                    
                // ============ ИГРОВЫЕ КОМАНДЫ ============
                case 'iq':
                case 'айкью':
                case 'icq':
                    const iqResponse = await interactive.handleIQ(username);
                    client.say(channel, `@${username}, ${iqResponse}`);
                    break;
                    
                case 'игра':
                    const gameResponse = await interactive.handleGame();
                    client.say(channel, `@${username}, ${gameResponse}`);
                    break;
                    
                // ============ КОМАНДЫ ОТСЛЕЖИВАНИЯ ============
                case 'followage':
                case 'отслеживание':
                case 'подписка':
                    const followageResponse = await interactive.handleFollowage(tags, isBroadcaster);
                    client.say(channel, `@${username}, ${followageResponse}`);
                    break;
                    
                case 'чебыло':
                    const categoriesResponse = await interactive.handleCategories(channel.replace('#', ''));
                    client.say(channel, `@${username}, ${categoriesResponse}`);
                    break;
                    
                // ============ КОМАНДА ПОДАРКОВ ============
                case '+подарок':
                    if (args.length > 0) {
                        const giftName = args.join(' ');
                        const addGiftResponse = interactive.addGift(giftName, username);
                        client.say(channel, addGiftResponse);
                    }
                    break;
                    
                case 'подарок':
                    const giftResponse = await interactive.handleGift(username, client, channel);
                    client.say(channel, giftResponse);
                    break;
            }
        } catch (error) {
            console.error(`Ошибка в обработке команды ${command}:`, error);
            client.say(channel, `@${username}, произошла ошибка при выполнении команды.`);
        }
    }
});

// ============ ОБРАБОТЧИКИ СОБЫТИЙ ============

// Успешное подключение
client.on('connected', (address, port) => {
    console.log(`✅ Бот подключен к ${address}:${port}`);
});

// Ошибка подключения
client.on('disconnected', (reason) => {
    console.warn(`⚠️ Бот отключен: ${reason}`);
});

// Ошибка аутентификации
client.on('login_failure', () => {
    console.error('❌ Ошибка аутентификации. Проверьте токены в .env файле');
    process.exit(1);
});

// ============ ОБРАБОТКА ЗАВЕРШЕНИЯ ============
process.on('SIGINT', () => {
    console.log('\n🛑 Получен сигнал завершения...');
    client.disconnect()
        .then(() => {
            console.log('✅ Бот отключён корректно');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Ошибка при отключении:', err);
            process.exit(1);
        });
});

// ============ ГЛОБАЛЬНАЯ ОБРАБОТКА ОШИБОК ============
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Необработанное отклонение промиса:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('⚠️ Непойманное исключение:', error);
    // Не завершаем процесс, чтобы бот продолжал работать
});

// Экспорт для тестирования
module.exports = { client };
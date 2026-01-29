const database = require('../database');
const NodeCache = require('node-cache');
const spamCache = new NodeCache({ stdTTL: 10 }); 
const capsWarnings = new NodeCache({ stdTTL: 600 }); 
const warnCache = new NodeCache(); 

// базовые запретки твича
const forbiddenWords = [
    'ниггер', 'нига', 'нага', 'nigger', 'nigga', 'naga',
    'пидор', 'пидорас', 'педик', 'гомик', 'faggot',
    'дебил', 'retard', 'даун', 'аутист',
    'simp', 'симп', 'incel', 'инцел',
    'cunt', 'пизда', 'вагина'
];

// белый список личных эмозди 7TV + базовые твича
const allowedEmojis = [
'ага', 'вип', 'дада', 'ку', 'нетнет', 'ох', 'погоди', 'саб', 'тише', 'тревога', 'тусим', 'угу',
'вообще-то','модеры','молю','ч','bla','BONKTHESTREAMER','а','ало','верим?','долбит','МОЛЮ','налево','направо',
'понял','прив','привет','стример','чего','o7','дурка','запомнил','опа','синема','хдд',
'NOOOO',' SVIN',' PETTHECHAT','GIGAMODS',
'ура', 'хд', 'хехе', 'хмм', 'че', 'чел', 'BONKTHEMODS', 'catJAM', 'CHAD', 'CLEAN', 'PETTHECHAT', 
'4Head', 'ANELE', 'AmbessaLove', 'AndalusianCrush', 'AnotherRecord', 'ArgieB8', 
'ArsonNoSexy', 'AsexualPride', 'AsianGlow', 'B)', 'B-)', 'BCWarrior', 'BOP', 'BabyRage', 
'BangbooBounce', 'BatChest', 'BegWan', 'BigBrother', 'BigPhish', 'BigSad', 'BlargNaut', 
'BloodTrail', 'BrainSlug', 'BratChat', 'BrokeBack', 'BuddhaBar', 'CaitThinking', 'CaitlynS', 
'CarlSmile', 'ChefFrank', 'ChewyYAY', 'Chimera7', 'Cinheimer', 'CoolCat', 'CoolStoryBob', 'CorgiDerp', 
'CrreamAwk', 'CurseLit', 'DAESuppy', 'DBstyle', 'DansGame', 'DarkKnight', 
'DarkMode', 'DarthJarJar', 'DatSheffy', 'DeafeSports', 'DendiFace', 'DinoDance', 
'DogFace', 'DoritosChip', 'DxCat', 'EarthDay', 'EkkoChest', 'EleGiggle', 
'EntropyWins', 'ExtraLife', 'FBBlock', 'FBCatch', 'FBChallenge', 'FBPass', 
'FBPenalty', 'FBRun', 'FBSpiral', 'FBtouchdown', 'FC26GOOOAL', 
'FUNgineer', 'FailFish', 'FallCry', 'FallHalp', 'FallWinning', 
'FamilyMan', 'FeelsVi', 'FeverFighter', 'FlawlessVictory', 'FootBall', 'FootGoal', 
'FootYellow', 'ForSigmar', 'FrankerZ', 'FreakinStinkin', 'FutureMan', 'GRASSLORD', 
'Getcamped', 'GingerPower', 'GivePLZ', 'GlitchCat', 'GlitchLit', 'GlitchNRG', 
'GoatEmotey', 'GoldPLZ', 'GrammarKing', 'HSCheers', 'HSWP', 'HarleyWink', 
'HassaanChop', 'HeyGuys', 'HolidayCookie', 'HolidayLog', 
'HolidayPresent', 'HolidaySanta', 'HolidayTree', 'HotPokket', 
'HungryPaimon', 'ImTyping', 'InuyoFace', 'ItsBoshyTime', 
'JKanStyle', 'Jebaited', 'JinxLUL', 'JonCarnage', 'KAPOW', 'KEKHeim', 
'Kappa', 'KappaClaus', 'KappaPride', 'KappaRoss', 'KappaWealth', 'Kappu', 
'Keepo', 'KevinTurtle', 'KingWorldCup', 'Kippa', 'KomodoHype', 'KonCha', 
'Kreygasm', 'LUL', 'LaundryBasket', 'Lechonk', 'LionOfYara', 'MVGame', 
'Mau5', 'MaxLOL', 'McDZombieHamburglar', 'MechaRobot', 'MegaphoneZ', 'MercyWing1', 
'MercyWing2', 'MikeHogu', 'MingLee', 'ModLove', 'MorphinTime', 'MrDestructoid', 
'MyAvatar', 'NRWylder', 'NewRecord', 'NiceTry', 'NinjaGrumpy', 'NomNom', 
'NotATK', 'NotLikeThis', 'O.O', 'O.o', 'OSFrog', 'O_O', 'O_o', 'O_o', 'OhMyDog', 
'OneHand', 'OpieOP', 'OptimizePrime', 'PJSalt', 'PJSugar', 'PMSTwin', 'PRChase', 
'PanicVis', 'PartyHat', 'PartyTime', 'PeoplesChamp', 'PermaSmug', 
'PewPewPew', 'PicoMause', 'PikaRamen', 'PinkMercy', 
'PipeHype', 'PixelBob', 'PizzaTime', 'PogBones', 'PogChamp', 
'Poooound', 'PopCorn', 'PopGhost', 'PopNemo', 'PoroSad', 'PotFriend', 
'PowerUpL', 'PowerUpR', 'PraiseIt', 'PrimeMe', 'PunOko', 'PunchTrees', 
'R)', 'R-)', 'RaccAttack', 'RalpherZ', 'RedCoat', 'ResidentSleeper', 'RitzMitz', 
'RlyTho', 'RuleFive', 'RyuChamp', 'SMOrc', 'SSSsss', 'SUBprise', 
'SUBtember', 'SabaPing', 'SeemsGood', 'SeriousSloth', 'ShadyLulu', 'ShazBotstix', 
'Shush', 'SingsMic', 'SingsNote', 'SipTime', 'SmoocherZ', 'SoBayed', 'SoonerLater', 
'Squid1', 'Squid2', 'Squid3', 'Squid4', 'StinkyCheese', 'StinkyGlitch', 'StoneLightning', 
'StrawBeary', 'StreamerU', 'SuperVinlin', 'SwiftRage', 'TBAngel', 'TF2John', 'TPFufun', 
'TPcrunchyroll', 'TTours', 'TWITH', 'TakeNRG', 'TearGlove', 'TehePelo', 'ThankEgg', 'TheIlluminati', 
'TheRinger', 'TheTarFu', 'TheThing', 'ThunBeast', 'TinyFace', 'TombRaid', 'TooSpicy', 'TriHard', 
'TwitchConHYPE', 'TwitchLit', 'TwitchRPG', 'TwitchSings', 'TwitchUnity', 'TwitchVotes', 
'UWot', 'UnSane', 'UncleNox', 'VirtualHug', 'VoHiYo', 'VoteNay', 'VoteYea', 'WTRuck', 
'WeDidThat', 'WholeWheat', 'WhySoSerious', 'WutFace', 'YouDontSay', 'YouWHY', 
'ZLANsup', 'bleedPurple', 'cmonBruh', 'copyThis', 'duDudu', 'imGlitch', 'mcaT', 
'o.O', 'o.o', 'o_O', 'o_o', 'panicBasket', 'pastaThat', 'riPepperonis', 'twitchRaid'
];

module.exports = {
    // Проверка запреток
    hasForbiddenWords(message) {
        const lowerMessage = message.toLowerCase();
        return forbiddenWords.some(word => lowerMessage.includes(word));
    },

    // Проверка на капс
    checkCaps(message, username) {
        // Игнор эмодзи
        const words = message.split(' ').filter(word => !allowedEmojis.includes(word));
        const capsWords = words.filter(word => word === word.toUpperCase() && word.length > 1);
        
        if (capsWords.length > 2) {
            const warnings = capsWarnings.get(username) || 0;
            
            if (warnings >= 2) {
                capsWarnings.del(username);
                return { timeout: true };
            } else {
                const newWarnings = warnings + 1;
                capsWarnings.set(username, newWarnings);
                
                const warningsText = [
                    ` тревога Не капси (${newWarnings}/2) @${username}`,
                    ` тревога Ещё раз говорю, не капси! (${newWarnings}/2) @${username}`
                ];
                return { warning: warningsText[warnings] };
            }
        }
        return null;
    },

    // Проверка на спам
    async checkSpam(username, message, channel) {
        const key = `${username}:${channel}`;
        const userMessages = spamCache.get(key) || [];
        
        // Игнорируем только эмодзи
        const words = message.split(' ').filter(word => !allowedEmojis.includes(word));
        if (words.length < 3) return null;
        
        userMessages.push(message);
        
        if (userMessages.length >= 3) {
            const allSame = userMessages.every(msg => msg === userMessages[0]);
            if (allSame) {
                spamCache.del(key);
                const spamCount = (database.getSpamCount(username) || 0) + 1;
                database.updateSpamCount(username, spamCount);
                
                if (spamCount >= 3) {
                    database.resetSpamCount(username);
                    return { 
                        timeout: true, 
                        duration: 0, // пермач
                        reason: ' ч СПАМ (3/3)' 
                    };
                } else if (spamCount === 2) {
                    return { 
                        timeout: true, 
                        duration: 600, 
                        reason: ' ч всё ещё спамишь? (2/3)' 
                    };
                } else {
                    return { 
                        timeout: true, 
                        duration: 300, 
                        reason: ' ч не спамь больше (1/3)' 
                    };
                }
            }
        }
        
        spamCache.set(key, userMessages.slice(-3)); // Храним последние 3 сообщения
        return null;
    },

    // !timeout
    async handleWarn(username) {
        const warnings = (warnCache.get(username) || 0) + 1;
        warnCache.set(username, warnings);
        
        if (warnings === 1) {
            return ` ч Аккуратнее с выражениями, пожалуйста @${username}`;
        } else if (warnings === 2) {
            return ` ч Повторяю последний раз, без глупостей @${username}`;
        } else {
            warnCache.del(username);
            return `!timeout @${username} 600`;
        }
    },

    // Обработка
    async handleTimeout(client, channel, username, duration, reason) {
        try {
            await client.timeout(channel, username, duration, reason);
            console.log(`Выдан таймаут пользователю ${username} на ${duration} сек. Причина: ${reason}`);
        } catch (error) {
            console.error('Ошибка при выдаче таймаута:', error);
        }
    }
};
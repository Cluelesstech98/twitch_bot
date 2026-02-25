const database = require('./database');

class UnbanManager {
    constructor(client, safeSay, channel) {
        this.client = client;
        this.safeSay = safeSay;
        this.channel = channel;
        this.reminderTimeout = null;
    }

    async start() {
        await this.checkExpiredBans();
        this.reminderTimeout = setInterval(() => this.checkExpiredBans(), 60 * 60 * 1000);
    }

    stop() {
        if (this.reminderTimeout) clearInterval(this.reminderTimeout);
    }

    async checkExpiredBans() {
        const expiredBans = await database.getExpiredBans();
        for (const ban of expiredBans) {
            const bannedAt = new Date(ban.banned_at).toLocaleDateString('ru-RU');
            const reason = ban.reason || 'без указания причины';
            const message = `Внимание! @${ban.username} был забанен ${bannedAt} по причине "${reason}". Прошёл месяц. Модераторы, ответьте "да", "+", "нет" или "-" для решения о разбане.`;
           
            const msg = await this.safeSay(this.channel, message, true);
            if (msg && msg.id) {
                await database.createUnbanRequest(ban.id, msg.id);
            }
        }
    }

    async handleModeratorResponse(messageId, response) {
        const positive = ['да', '+', 'yes', 'ye', 'y', 'lf', 'yt', 'y+'].includes(response.toLowerCase());
        const negative = ['нет', '-', 'no', 'n', 'ytn', 'y-'].includes(response.toLowerCase());

        if (!positive && !negative) return;

        const request = await database.resolveUnbanRequest(messageId, positive ? 'approved' : 'rejected');
        if (!request) return;

        if (positive) {
            await this.client.unban(this.channel, request.username).catch(() => {});
            await database.unbanUser(request.username);
            await this.safeSay(this.channel, `@${request.username} разбанен по решению модератора.`);
        } else {
            const newDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            await database.updateBanUntil(request.banId, newDate);
            await this.safeSay(this.channel, `Напоминание о @${request.username} отложено ещё на месяц.`);
        }
    }
}

module.exports = UnbanManager;
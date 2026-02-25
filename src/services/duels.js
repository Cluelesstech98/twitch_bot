const database = require('./database');

class DuelManager {
    constructor(client, safeSay) {
        this.client = client;
        this.safeSay = safeSay;
        this.pendingDuels = new Map();
    }

    async createDuel(challenger, opponent, amount, channel) {
        if (challenger === opponent) {
            return `@${challenger} нельзя дуэлировать с самим собой.`;
        }

        const challengerPoints = await database.getUserPoints(challenger);
        if (challengerPoints < amount) {
            return `@${challenger} у вас недостаточно очков для дуэли.`;
        }

        const existing = await database.getPendingDuelByOpponent(opponent);
        if (existing) {
            return `@${challenger} для @${opponent} уже есть активная дуэль.`;
        }

        const expiresAt = new Date(Date.now() + 60 * 1000); 
        await database.createDuel(challenger, opponent, amount, expiresAt);

        const message = `@${opponent} вас вызывает на дуэль @${challenger} на ${amount} очков! Напишите !принять или !отклонить (60 секунд)`;
        await this.safeSay(channel, message);

        this.pendingDuels.set(opponent, { challenger, amount, expiresAt });

        setTimeout(() => this.pendingDuels.delete(opponent), 60 * 1000);

        return null; 
    }

    async acceptDuel(opponent, channel) {
        const duel = await database.getPendingDuelByOpponent(opponent);
        if (!duel) {
            return `@${opponent} у вас нет активных вызовов на дуэль.`;
        }

        if (new Date(duel.expires_at) < new Date()) {
            await database.updateDuelStatus(duel.id, 'expired');
            return `@${opponent} срок принятия дуэли истёк.`;
        }

        const { challenger, amount } = duel;

        const opponentPoints = await database.getUserPoints(opponent);
        if (opponentPoints < amount) {
            return `@${opponent} у вас недостаточно очков для принятия дуэли.`;
        }

        const winner = Math.random() < 0.5 ? challenger : opponent;
        const loser = winner === challenger ? opponent : challenger;

        await database.spendUserPoints(loser, amount);
        await database.addUserPoints(winner, amount * 2);

        await database.updateDuelStatus(duel.id, 'completed');

        return `🎉 @${winner} побеждает в дуэли и получает ${amount * 2} очков!`;
    }

    async declineDuel(opponent, channel) {
        const duel = await database.getPendingDuelByOpponent(opponent);
        if (!duel) {
            return `@${opponent} у вас нет активных вызовов на дуэль.`;
        }
        await database.updateDuelStatus(duel.id, 'declined');
        return `@${opponent} отклонил(а) дуэль.`;
    }
}

module.exports = DuelManager;
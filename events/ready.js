const { Events } = require('discord.js');
const { getTradesInReview } = require('../database/index.js');
const { resolveTradeReview } = require('../services/tradeReview.js');
const { getConfiguredChannelId } = require('../utils/config.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);

		// Startup recovery for trade reviews
		// Note: The review deadline is stored in the database (review_started_at), 
		// so this recovery logic ensures the review window survives bot restarts.
		const tradesInReview = getTradesInReview();
		const reviewHours = parseInt(process.env.TRADE_REVIEW_HOURS) || 24;
		const reviewMs = reviewHours * 60 * 60 * 1000;

		for (const trade of tradesInReview) {
			const startedAt = new Date(trade.review_started_at).getTime();
			const now = Date.now();
			const elapsed = now - startedAt;
			const remaining = reviewMs - elapsed;

			const reviewChannelId = getConfiguredChannelId('trade_review');
			const channel = await client.channels.fetch(reviewChannelId).catch(() => null);
			
			// We need the message to resolve the review. 
			// If we can't find the message, we might not be able to update it, 
			// but we should still resolve the trade status.
			// For this implementation, we assume the message is still in the channel history.
			let message = null;
			if (channel) {
				// Fetch recent messages to find the trade review embed
				const messages = await channel.messages.fetch({ limit: 50 });
				message = messages.find(m => m.embeds.length > 0 && m.embeds[0].footer?.text.includes(`Trade ID: ${trade.id}`));
			}

			if (remaining <= 0) {
				// Window already passed
				await resolveTradeReview(trade.id, client, message);
			} else {
				// Schedule remaining time
				setTimeout(() => resolveTradeReview(trade.id, client, message), remaining);
			}
		}
	},
};

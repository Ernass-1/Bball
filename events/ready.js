const { Events } = require('discord.js');
const { getTradesInReview } = require('../database/index.js');
const { resolveTradeReview } = require('../services/tradeReview.js');
const { getConfiguredChannelId } = require('../utils/config.js');
const { getDraftState, setPickStartedAt } = require('../database/index.js');
const { hasActiveSave, loadSaveFile, getActiveSavePath, getPickOrder } = require('../services/saveEditor.js');
const { resolvePick, startPickTimer } = require('../commands/draft.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);

		// 1. Startup recovery for trade reviews
		const { getTradesInReview } = require('../database/index.js');
		const { resolveTradeReview } = require('../services/tradeReview.js');
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
			
			let message = null;
			if (channel) {
				const messages = await channel.messages.fetch({ limit: 50 });
				message = messages.find(m => m.embeds.length > 0 && m.embeds[0].footer?.text.includes(`Trade ID: ${trade.id}`));
			}

			if (remaining <= 0) {
				await resolveTradeReview(trade.id, client, message);
			} else {
				setTimeout(() => resolveTradeReview(trade.id, client, message), remaining);
			}
		}

		// 2. Startup recovery for draft timer
		const draftState = getDraftState();
		if (draftState && draftState.pick_started_at) {
			const pickSeconds = parseInt(process.env.DRAFT_PICK_SECONDS) || 90;
			const pickMs = pickSeconds * 1000;
			
			let caughtUp = 0;
			let stillInProgress = true;

			// Safety loop to catch up multiple missed picks
			for (let i = 0; i < 100; i++) {
				const currentState = getDraftState();
				if (!currentState || !currentState.pick_started_at) {
					stillInProgress = false;
					break;
				}

				const startedAt = new Date(currentState.pick_started_at).getTime();
				const now = Date.now();
				const elapsed = now - startedAt;

				if (elapsed >= pickMs) {
					// Pick expired while offline
					console.log(`Draft recovery: Catching up pick ${currentState.current_pick_index} (elapsed ${elapsed}ms)`);
					await resolvePick(client, true); // true = isRecovery
					caughtUp++;
				} else {
					// This pick is still active
					const remaining = pickMs - elapsed;
					console.log(`Draft recovery: Scheduling remaining ${remaining}ms for pick ${currentState.current_pick_index}`);
					
					// Schedule the timer
					setTimeout(async () => {
						await resolvePick(client);
					}, remaining);
					
					stillInProgress = true;
					break;
				}
			}

			if (caughtUp > 0) {
				console.log(`Draft recovery: Caught up ${caughtUp} missed picks.`);
			}
		}
	},
};

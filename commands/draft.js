const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { hasActiveSave, loadSaveFile, getActiveSavePath, getPickOrder, getDraftProspects, getTeam, draftPlayer, saveSaveFile } = require('../services/saveEditor');
const { setDraftState, getDraftState, advancePick, getTeamLink, setPickStartedAt } = require('../database/index');
const { isCommissioner, isBotOwner } = require('../utils/permissions');
const { getTeamChannel } = require('../services/channelHelper');
const { getConfiguredChannelId } = require('../utils/config');

// In-memory timer tracker.
let activeTimer = null;

async function resolvePick(client, isRecovery = false) {
	// Clear any existing timer
	if (activeTimer) {
		clearTimeout(activeTimer);
		activeTimer = null;
	}

	// Re-read draft state fresh
	const draftState = getDraftState();
	if (!draftState) return; // Draft not active

	const activeSavePath = getActiveSavePath();
	const save = loadSaveFile(activeSavePath);
	const picks = getPickOrder(save, draftState.season);

	if (draftState.current_pick_index >= picks.length) return; // Draft complete

	const currentPick = picks[draftState.current_pick_index];
	const team = getTeam(save, currentPick.tid);
	const teamName = team ? `${team.region} ${team.name}` : 'Unknown Team';

	const draftChannelId = getConfiguredChannelId('draft');
	const channel = await client.channels.fetch(draftChannelId).catch(() => null);
	if (!channel) {
		console.error("Draft channel not found or not configured.");
		return;
	}

	// Auto-draft best available
	const prospects = getDraftProspects(save, draftState.season);
	if (prospects.length === 0) {
		channel.send("No prospects available to auto-draft.");
		return;
	}
	const bestProspect = prospects[0];
	const playerName = `${bestProspect.firstName} ${bestProspect.lastName}`;

	try {
		const updatedSave = draftPlayer(save, playerName, currentPick.tid, draftState.current_pick_index, draftState.season);
		saveSaveFile(updatedSave, activeSavePath);
		advancePick();

		const prefix = isRecovery ? "⌛ Bot was offline — " : "⌛ Time expired — ";
		channel.send(`${prefix}**${teamName}** auto-drafted **${playerName}** (best available).`);

		// Start timer for next pick
		await startPickTimer(client);
	} catch (error) {
		channel.send(`Error during auto-draft: ${error.message}`);
	}
}

async function startPickTimer(client) {
	// Clear any existing timer first
	if (activeTimer) {
		clearTimeout(activeTimer);
		activeTimer = null;
	}

	const draftState = getDraftState();
	if (!draftState) return; // Draft not active

	const activeSavePath = getActiveSavePath();
	const save = loadSaveFile(activeSavePath);
	const picks = getPickOrder(save, draftState.season);

	if (draftState.current_pick_index >= picks.length) return; // Draft complete

	// Stamp the start time in the database
	const now = new Date();
	setPickStartedAt(now.toISOString());

	const pickSeconds = parseInt(process.env.DRAFT_PICK_SECONDS) || 90;
	const draftChannelId = getConfiguredChannelId('draft');
	const channel = await client.channels.fetch(draftChannelId).catch(() => null);

	if (!channel) {
		console.error("Draft channel not found or not configured.");
		return;
	}

	const currentPick = picks[draftState.current_pick_index];
	const team = getTeam(save, currentPick.tid);
	const teamName = team ? `${team.region} ${team.name}` : 'Unknown Team';

	// Warning timer
	if (pickSeconds > 15) {
		setTimeout(() => {
			// Check if this is still the same pick
			const currentState = getDraftState();
			if (currentState && currentState.current_pick_index === draftState.current_pick_index) {
				channel.send(`⏰ 15 seconds left for **${teamName}** to make their pick.`);
			}
		}, (pickSeconds - 15) * 1000);
	}

	// Auto-pick timer
	activeTimer = setTimeout(async () => {
		await resolvePick(client);
	}, pickSeconds * 1000);
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('draft')
		.setDescription('Draft management commands')
		.addSubcommand(subcommand =>
			subcommand
				.setName('start')
				.setDescription('Start the draft for a specific season')
				.addIntegerOption(option => option.setName('season').setDescription('The season to draft for').setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('board')
				.setDescription('View upcoming picks and top prospects'))
		.addSubcommand(subcommand =>
			subcommand
				.setName('pick')
				.setDescription('Select a player for your team')
				.addStringOption(option => option.setName('player_name').setDescription('The name of the prospect to draft').setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('announce-picks')
				.setDescription('Post draft pick inventory for a season to each team channel')
				.addIntegerOption(option => option.setName('season').setDescription('The season to announce picks for').setRequired(true))),

	async execute(interaction) {
		if (!hasActiveSave()) {
			return interaction.reply({ content: "No active save file found.", ephemeral: true });
		}

		const activeSavePath = getActiveSavePath();
		const save = loadSaveFile(activeSavePath);
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'announce-picks') {
			if (!isCommissioner(interaction.member)) {
				return interaction.reply({ content: "Only commissioners can use this command.", ephemeral: true });
			}

			const season = interaction.options.getInteger('season');
			const allPicks = getPickOrder(save, season);

			if (allPicks.length === 0) {
				return interaction.reply({ content: `No draft picks found for season ${season}.`, ephemeral: true });
			}

			const picksByTeam = {};
			allPicks.forEach(pick => {
				if (!picksByTeam[pick.tid]) picksByTeam[pick.tid] = [];
				picksByTeam[pick.tid].push(pick);
			});

			let sentCount = 0;
			let skippedNoChannelCount = 0;
			let zeroPicksCount = 0;

			const allTeams = save.teams || [];
			for (const team of allTeams) {
				const teamId = team.tid;
				const teamPicks = picksByTeam[teamId];

				if (!teamPicks || teamPicks.length === 0) {
					zeroPicksCount++;
					continue;
				}

				const channel = getTeamChannel(interaction.client, teamId);
				if (!channel) {
					skippedNoChannelCount++;
					continue;
				}

				const pickStrings = teamPicks.map(p => {
					let str = `Round ${p.round}, Pick ${p.pick}`;
					if (p.originalTid !== teamId) {
						const originalTeam = getTeam(save, p.originalTid);
						const abbrev = originalTeam ? originalTeam.abbrev : '???';
						str += ` (originally ${abbrev})`;
					}
					return str;
				});

				const embed = new EmbedBuilder()
					.setTitle(`Draft picks for season ${season}`)
					.setDescription(pickStrings.join('\n'))
					.setColor(0x0099FF);

				try {
					await channel.send({ embeds: [embed] });
					sentCount++;
				} catch (err) {
					console.error(`Failed to send picks to channel for team ${teamId}:`, err);
					skippedNoChannelCount++;
				}
			}

			return interaction.reply({
				content: `Picks announcement summary for ${season}:\n` +
					`- Messages sent to team channels: ${sentCount}\n` +
					`- Teams with zero picks: ${zeroPicksCount}\n` +
					`- Teams skipped (no channel mapping): ${skippedNoChannelCount}`,
				ephemeral: true
			});
		}

		if (subcommand === 'start') {
			if (!isCommissioner(interaction.member)) {
				return interaction.reply({ content: "Only commissioners can start the draft.", ephemeral: true });
			}

			const season = interaction.options.getInteger('season');
			const picks = getPickOrder(save, season);

			if (picks.length === 0) {
				return interaction.reply({ content: `No draft picks found for season ${season}.`, ephemeral: true });
			}

			setDraftState(season, 0);
			const firstPick = picks[0];
			const team = getTeam(save, firstPick.tid);
			
			// Start the timer
			await startPickTimer(interaction.client);

			return interaction.reply({ 
				content: `📢 **The ${season} Draft has officially started!**\nOn the clock: **${team ? team.region + ' ' + team.name : 'Unknown Team'}** (Round ${firstPick.round}, Pick ${firstPick.pick})` 
			});
		}

		const draftState = getDraftState();
		if (!draftState) {
			return interaction.reply({ content: "No draft is currently in progress.", ephemeral: true });
		}

		const picks = getPickOrder(save, draftState.season);

		if (subcommand === 'board') {
			const upcoming = picks.slice(draftState.current_pick_index, draftState.current_pick_index + 5);
			const prospects = getDraftProspects(save, draftState.season).slice(0, 10);

			const boardEmbed = new EmbedBuilder()
				.setTitle(`${draftState.season} Draft Board`)
				.setColor(0x0099FF);

			let pickList = upcoming.map((p, i) => {
				const team = getTeam(save, p.tid);
				const teamName = team ? `${team.region} ${team.name}` : 'Unknown';
				return `**${draftState.current_pick_index + i + 1}.** Round ${p.round}, Pick ${p.pick}: ${teamName}`;
			}).join('\n') || 'No picks remaining.';

			boardEmbed.addFields({ name: 'Upcoming Picks', value: pickList });

			let prospectList = prospects.map((p, i) => {
				const ovr = (p.ratings && p.ratings.length > 0) ? p.ratings[p.ratings.length - 1].ovr : '??';
				return `**${i + 1}.** ${p.firstName} ${p.lastName} (OVR: ${ovr})`;
			}).join('\n') || 'No prospects remaining.';

			boardEmbed.addFields({ name: 'Top Prospects', value: prospectList });

			return interaction.reply({ embeds: [boardEmbed] });
		}

		if (subcommand === 'pick') {
			// Cancel the timer immediately on manual pick
			if (activeTimer) {
				clearTimeout(activeTimer);
				activeTimer = null;
			}

			if (draftState.current_pick_index >= picks.length) {
				return interaction.reply({ content: "The draft is already complete.", ephemeral: true });
			}

			const currentPick = picks[draftState.current_pick_index];
			const owner = getTeamLink(interaction.user.id);

			if (!isBotOwner(interaction.user.id) && (!owner || owner.team_id !== currentPick.tid)) {
				const team = getTeam(save, currentPick.tid);
				const teamName = team ? `${team.region} ${team.name}` : 'Unknown Team';
				return interaction.reply({ content: `It's not your turn — it's **${teamName}**'s pick.`, ephemeral: true });
			}

			const playerName = interaction.options.getString('player_name');

			try {
				const updatedSave = draftPlayer(save, playerName, currentPick.tid, draftState.current_pick_index, draftState.season);
				saveSaveFile(updatedSave, activeSavePath);
				advancePick();

				const nextDraftState = getDraftState();
				let followUp = "The draft is complete.";
				if (nextDraftState.current_pick_index < picks.length) {
					const nextPick = picks[nextDraftState.current_pick_index];
					const nextTeam = getTeam(save, nextPick.tid);
					followUp = `Next on the clock: **${nextTeam ? nextTeam.region + ' ' + nextTeam.name : 'Unknown Team'}**.`;
					
					// Start timer for next pick
					await startPickTimer(interaction.client);
				}

				return interaction.reply({ 
					content: `✅ With pick #${draftState.current_pick_index + 1}, the **${getTeam(save, currentPick.tid).name}** select **${playerName}**! ${followUp}` 
				});
			} catch (error) {
				return interaction.reply({ content: error.message, ephemeral: true });
			}
		}
	},
};

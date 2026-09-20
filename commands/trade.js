const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTeamLink, createTrade, addTradeAsset, getTrade, getTradeAssets, updateTradeStatus, getPendingTradesForTeam } = require('../database/index.js');
const {
	hasActiveSave, loadSaveFile, getActiveSavePath, getTeam, findPlayer,
	findDraftPick, getTotalOutgoingSalary, validateTradeSalaries
} = require('../services/saveEditor.js');
const { isBotOwner } = require('../utils/permissions.js');

const PICK_FORMAT = /^(\d{4})\s+(\d{1,2})$/;

function parsePick(input) {
	const match = PICK_FORMAT.exec(input.trim());
	if (!match) {
		throw new Error(`Couldn't parse pick '${input}' — use the format "season round", e.g. "2027 1".`);
	}
	return { season: parseInt(match[1], 10), round: parseInt(match[2], 10) };
}

/** Resolves a named player to a trade_assets-shaped asset, verifying they're on the expected team. */
function resolvePlayerAsset(save, playerInput, expectedTeamId, expectedTeamLabel) {
	if (!playerInput) return null;
	const player = findPlayer(save, playerInput);
	if (player.tid !== expectedTeamId) {
		throw new Error(`'${player.firstName} ${player.lastName}' is not on ${expectedTeamLabel}'s roster.`);
	}
	return { asset_type: 'player', player_name: `${player.firstName} ${player.lastName}` };
}

/** Resolves a "season round" pick input to a trade_assets-shaped asset, verifying ownership. */
function resolvePickAsset(save, pickInput, expectedTeamId, expectedTeamLabel) {
	if (!pickInput) return null;
	const { season, round } = parsePick(pickInput);
	const pick = findDraftPick(save, expectedTeamId, season, round);
	if (!pick) {
		throw new Error(`${expectedTeamLabel} doesn't own a Round ${round} pick for ${season}.`);
	}
	return { asset_type: 'pick', pick_season: season, pick_round: round };
}

function describeAsset(asset) {
	return asset.asset_type === 'player' ? asset.player_name : `${asset.pick_season} Round ${asset.pick_round} pick`;
}

async function handlePropose(interaction) {
	const recipient = interaction.options.getUser('recipient');
	const proposerId = interaction.user.id;
	const recipientId = recipient.id;

	if (recipientId === proposerId) {
		return interaction.reply({ content: "You can't propose a trade with yourself.", ephemeral: true });
	}

	const proposerLink = getTeamLink(proposerId);
	const recipientLink = getTeamLink(recipientId);

	if (!proposerLink) {
		return interaction.reply({ content: 'You must claim a team before proposing trades.', ephemeral: true });
	}
	if (!recipientLink) {
		return interaction.reply({ content: 'The recipient does not have a claimed team.', ephemeral: true });
	}

	if (!hasActiveSave()) {
		return interaction.reply({ content: "No active save file has been uploaded yet — ask your commissioner to upload one.", ephemeral: true });
	}

	const save = loadSaveFile(getActiveSavePath());
	const proposerTeam = getTeam(save, proposerLink.team_id);
	const recipientTeam = getTeam(save, recipientLink.team_id);
	const proposerLabel = proposerTeam ? `${proposerTeam.region} ${proposerTeam.name}` : 'your team';
	const recipientLabel = recipientTeam ? `${recipientTeam.region} ${recipientTeam.name}` : "the recipient's team";

	let proposerAssets, recipientAssets;
	try {
		proposerAssets = [
			resolvePlayerAsset(save, interaction.options.getString('your_player'), proposerLink.team_id, proposerLabel),
			resolvePlayerAsset(save, interaction.options.getString('your_player2'), proposerLink.team_id, proposerLabel),
			resolvePickAsset(save, interaction.options.getString('your_pick'), proposerLink.team_id, proposerLabel),
		].filter(Boolean);

		recipientAssets = [
			resolvePlayerAsset(save, interaction.options.getString('their_player'), recipientLink.team_id, recipientLabel),
			resolvePlayerAsset(save, interaction.options.getString('their_player2'), recipientLink.team_id, recipientLabel),
			resolvePickAsset(save, interaction.options.getString('their_pick'), recipientLink.team_id, recipientLabel),
		].filter(Boolean);
	} catch (error) {
		return interaction.reply({ content: error.message, ephemeral: true });
	}

	if (proposerAssets.length === 0 || recipientAssets.length === 0) {
		return interaction.reply({ content: 'Both sides need to include at least one player or pick.', ephemeral: true });
	}

	let proposerSalary, recipientSalary;
	try {
		proposerSalary = getTotalOutgoingSalary(save, proposerAssets, proposerLink.team_id);
		recipientSalary = getTotalOutgoingSalary(save, recipientAssets, recipientLink.team_id);
	} catch (error) {
		return interaction.reply({ content: error.message, ephemeral: true });
	}

	const validation = validateTradeSalaries(save, proposerSalary, recipientSalary);
	if (!validation.legal) {
		return interaction.reply({ content: validation.reason, ephemeral: true });
	}

	const tradeId = createTrade(proposerId, recipientId, proposerLink.team_id, recipientLink.team_id);
	for (const asset of proposerAssets) {
		addTradeAsset(tradeId, 'proposer', asset.asset_type, asset.asset_type === 'player'
			? { playerName: asset.player_name }
			: { season: asset.pick_season, round: asset.pick_round });
	}
	for (const asset of recipientAssets) {
		addTradeAsset(tradeId, 'recipient', asset.asset_type, asset.asset_type === 'player'
			? { playerName: asset.player_name }
			: { season: asset.pick_season, round: asset.pick_round });
	}

	const embed = new EmbedBuilder()
		.setTitle('Trade Proposal')
		.setColor(0x0099FF)
		.addFields(
			{ name: 'Proposer', value: `<@${proposerId}> (${proposerLabel})`, inline: true },
			{ name: 'Sending', value: `${proposerAssets.map(describeAsset).join('\n')}\n($${proposerSalary.toLocaleString()}k total)`, inline: true },
			{ name: '\u200B', value: '\u200B', inline: true },
			{ name: 'Recipient', value: `<@${recipientId}> (${recipientLabel})`, inline: true },
			{ name: 'Sending', value: `${recipientAssets.map(describeAsset).join('\n')}\n($${recipientSalary.toLocaleString()}k total)`, inline: true },
			{ name: '\u200B', value: '\u200B', inline: true },
		)
		.setFooter({ text: `Trade ID: ${tradeId}` });

	const row = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId(`accept_trade_${tradeId}`)
				.setLabel('Accept Trade')
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId(`reject_trade_${tradeId}`)
				.setLabel('Reject Trade')
				.setStyle(ButtonStyle.Danger),
		);

	await interaction.reply({ content: `Trade proposal sent to <@${recipientId}>.`, ephemeral: true });
	await interaction.channel.send({
		content: `<@${recipientId}>, you have received a trade proposal!`,
		embeds: [embed],
		components: [row]
	});
}

async function handleCancel(interaction) {
	const tradeId = interaction.options.getInteger('trade_id');
	const trade = getTrade(tradeId);

	if (!trade) {
		return interaction.reply({ content: `Trade #${tradeId} not found.`, ephemeral: true });
	}

	if (trade.proposer_discord_id !== interaction.user.id && !isBotOwner(interaction.user.id)) {
		return interaction.reply({ content: 'Only the proposer can cancel this trade.', ephemeral: true });
	}

	if (trade.status !== 'pending') {
		return interaction.reply({ content: `Trade #${tradeId} is '${trade.status}' and can no longer be cancelled — it has already moved past the recipient's response.`, ephemeral: true });
	}

	updateTradeStatus(tradeId, 'cancelled');
	return interaction.reply({ content: `Trade #${tradeId} has been cancelled.` });
}

async function handleList(interaction) {
	const link = getTeamLink(interaction.user.id);
	if (!link) {
		return interaction.reply({ content: "You haven't claimed a team.", ephemeral: true });
	}

	const trades = getPendingTradesForTeam(link.team_id);
	if (trades.length === 0) {
		return interaction.reply({ content: "No open trades involving your team.", ephemeral: true });
	}

	const save = hasActiveSave() ? loadSaveFile(getActiveSavePath()) : null;

	const lines = trades.map(t => {
		const assets = getTradeAssets(t.id);
		const proposerDesc = assets.proposer.map(describeAsset).join(', ') || '—';
		const recipientDesc = assets.recipient.map(describeAsset).join(', ') || '—';
		const proposerTeam = save ? getTeam(save, t.proposer_team_id) : null;
		const recipientTeam = save ? getTeam(save, t.recipient_team_id) : null;
		const proposerLabel = proposerTeam ? proposerTeam.abbrev : `Team ${t.proposer_team_id}`;
		const recipientLabel = recipientTeam ? recipientTeam.abbrev : `Team ${t.recipient_team_id}`;
		return `**#${t.id}** [${t.status}] ${proposerLabel} (${proposerDesc}) ⇄ ${recipientLabel} (${recipientDesc})`;
	});

	const embed = new EmbedBuilder()
		.setTitle('Open Trades')
		.setDescription(lines.join('\n'))
		.setColor(0x0099FF);

	return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('trade')
		.setDescription('Trade management commands')
		.addSubcommand(subcommand =>
			subcommand
				.setName('propose')
				.setDescription('Propose a trade (up to 2 players + 1 pick per side)')
				.addUserOption(option => option.setName('recipient').setDescription('The user you are trading with').setRequired(true))
				.addStringOption(option => option.setName('your_player').setDescription('A player you are sending').setRequired(true))
				.addStringOption(option => option.setName('their_player').setDescription('A player you are receiving').setRequired(true))
				.addStringOption(option => option.setName('your_player2').setDescription('A second player you are sending'))
				.addStringOption(option => option.setName('their_player2').setDescription('A second player you are receiving'))
				.addStringOption(option => option.setName('your_pick').setDescription('A pick you are sending, e.g. "2027 1"'))
				.addStringOption(option => option.setName('their_pick').setDescription('A pick you are receiving, e.g. "2027 1"')))
		.addSubcommand(subcommand =>
			subcommand
				.setName('cancel')
				.setDescription('Cancel a trade you proposed that hasn\'t been responded to yet')
				.addIntegerOption(option => option.setName('trade_id').setDescription('The trade ID (shown in the proposal footer)').setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('list')
				.setDescription('List open trades involving your team')),
	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();
		if (subcommand === 'propose') return handlePropose(interaction);
		if (subcommand === 'cancel') return handleCancel(interaction);
		if (subcommand === 'list') return handleList(interaction);
	},
};

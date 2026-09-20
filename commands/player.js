const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
	hasActiveSave, loadSaveFile, getActiveSavePath, getTeam, findPlayer,
	getLatestRatings, getPlayerContract, getStatsForSeason, getCurrentSeason,
	perGame, shootingPct, formatHeight
} = require('../services/saveEditor');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('player')
		.setDescription('View a player\'s profile: bio, ratings, contract, and current stats')
		.addStringOption(option =>
			option.setName('name')
				.setDescription('The player\'s full or partial name')
				.setRequired(true)),
	async execute(interaction) {
		if (!hasActiveSave()) {
			return interaction.reply({ content: "No active save file found.", ephemeral: true });
		}

		const save = loadSaveFile(getActiveSavePath());
		const nameInput = interaction.options.getString('name');

		let player;
		try {
			player = findPlayer(save, nameInput);
		} catch (error) {
			return interaction.reply({ content: error.message, ephemeral: true });
		}

		const fullName = `${player.firstName} ${player.lastName}`;
		const team = getTeam(save, player.tid);
		let teamLabel;
		if (player.tid === -1) teamLabel = 'Free Agent';
		else if (player.tid === -2) teamLabel = 'Draft Prospect';
		else if (player.tid === undefined || player.tid === null) teamLabel = 'Retired';
		else teamLabel = team ? `${team.region} ${team.name} (${team.abbrev})` : `Team ${player.tid}`;

		const ratings = getLatestRatings(player);
		const pos = player.pos || (ratings && ratings.pos) || 'N/A';
		const currentSeason = getCurrentSeason(save);

		const embed = new EmbedBuilder()
			.setTitle(fullName)
			.setColor(0x0099FF)
			.addFields(
				{ name: 'Team', value: teamLabel, inline: true },
				{ name: 'Position', value: pos, inline: true },
				{ name: 'Age', value: currentSeason && player.born ? `${currentSeason - player.born.year}` : 'N/A', inline: true },
			);

		if (ratings) {
			embed.addFields(
				{ name: 'Height', value: formatHeight(ratings.hgt), inline: true },
				{ name: 'Overall', value: `${ratings.ovr ?? '??'}`, inline: true },
				{ name: 'Potential', value: `${ratings.pot ?? '??'}`, inline: true },
			);
		}

		const contract = getPlayerContract(player);
		if (contract) {
			embed.addFields({
				name: 'Contract',
				value: `$${contract.amount.toLocaleString()}k/yr through ${contract.exp ?? 'N/A'}`,
				inline: false
			});
		}

		if (currentSeason) {
			const seasonStats = getStatsForSeason(player, currentSeason);
			if (seasonStats) {
				const statLine = `${perGame(seasonStats, 'pts')} PPG | ${perGame(seasonStats, 'trb')} RPG | ${perGame(seasonStats, 'ast')} APG | ` +
					`${perGame(seasonStats, 'stl')} SPG | ${perGame(seasonStats, 'blk')} BPG\n` +
					`FG: ${shootingPct(seasonStats.fg, seasonStats.fga)} | 3P: ${shootingPct(seasonStats.tp, seasonStats.tpa)} | FT: ${shootingPct(seasonStats.ft, seasonStats.fta)} | ${seasonStats.gp} GP`;
				embed.addFields({ name: `${currentSeason} Season Stats`, value: statLine, inline: false });
			}
		}

		embed.setFooter({ text: 'Use /ratings or /stats for a full breakdown.' });

		return interaction.reply({ embeds: [embed] });
	},
};

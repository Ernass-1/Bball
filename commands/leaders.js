const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { hasActiveSave, loadSaveFile, getActiveSavePath, getTeam, getStatsForSeason, getCurrentSeason, perGame } = require('../services/saveEditor');

const CATEGORIES = {
	pts: 'Points',
	trb: 'Rebounds',
	ast: 'Assists',
	stl: 'Steals',
	blk: 'Blocks',
};

const MIN_GAMES = 10;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('leaders')
		.setDescription('View league leaders for a stat category')
		.addStringOption(option =>
			option.setName('category')
				.setDescription('Stat category (defaults to points)')
				.addChoices(
					{ name: 'Points', value: 'pts' },
					{ name: 'Rebounds', value: 'trb' },
					{ name: 'Assists', value: 'ast' },
					{ name: 'Steals', value: 'stl' },
					{ name: 'Blocks', value: 'blk' },
				))
		.addIntegerOption(option =>
			option.setName('season')
				.setDescription('Season to view (defaults to the current season)')),
	async execute(interaction) {
		if (!hasActiveSave()) {
			return interaction.reply({ content: "No active save file found.", ephemeral: true });
		}

		const save = loadSaveFile(getActiveSavePath());
		const category = interaction.options.getString('category') || 'pts';
		const season = interaction.options.getInteger('season') || getCurrentSeason(save);

		if (!season) {
			return interaction.reply({ content: "Couldn't determine a season to show — please pass one explicitly.", ephemeral: true });
		}

		const leaders = [];
		for (const player of save.players) {
			const totals = getStatsForSeason(player, season);
			if (!totals || totals.gp < MIN_GAMES) continue;
			leaders.push({
				name: `${player.firstName} ${player.lastName}`,
				team: getTeam(save, player.tid),
				perGameValue: parseFloat(perGame(totals, category)),
			});
		}

		if (leaders.length === 0) {
			return interaction.reply({ content: `No qualifying players found for ${season}.`, ephemeral: true });
		}

		leaders.sort((a, b) => b.perGameValue - a.perGameValue);
		const top10 = leaders.slice(0, 10);

		const description = top10.map((l, i) => {
			const teamAbbrev = l.team ? l.team.abbrev : 'FA';
			return `**${i + 1}.** ${l.name} (${teamAbbrev}) — ${l.perGameValue.toFixed(1)}`;
		}).join('\n');

		const embed = new EmbedBuilder()
			.setTitle(`${season} ${CATEGORIES[category]} Leaders`)
			.setDescription(description)
			.setFooter({ text: `Minimum ${MIN_GAMES} games played` })
			.setColor(0x0099FF);

		return interaction.reply({ embeds: [embed] });
	},
};

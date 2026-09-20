const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
	hasActiveSave, loadSaveFile, getActiveSavePath, findPlayer,
	getStatsForSeason, getCareerStats, getCurrentSeason, perGame, shootingPct
} = require('../services/saveEditor');

function statBlock(totals) {
	if (!totals || !totals.gp) return 'No games played.';
	return (
		`GP: ${totals.gp}  MIN: ${perGame(totals, 'min')}\n` +
		`PTS: ${perGame(totals, 'pts')}  REB: ${perGame(totals, 'trb')}  AST: ${perGame(totals, 'ast')}  ` +
		`STL: ${perGame(totals, 'stl')}  BLK: ${perGame(totals, 'blk')}  TOV: ${perGame(totals, 'tov')}\n` +
		`FG: ${shootingPct(totals.fg, totals.fga)} (${totals.fg}/${totals.fga})  ` +
		`3P: ${shootingPct(totals.tp, totals.tpa)} (${totals.tp}/${totals.tpa})  ` +
		`FT: ${shootingPct(totals.ft, totals.fta)} (${totals.ft}/${totals.fta})`
	);
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('stats')
		.setDescription('View a player\'s stat line for a season, or their career totals')
		.addStringOption(option =>
			option.setName('name')
				.setDescription('The player\'s full or partial name')
				.setRequired(true))
		.addIntegerOption(option =>
			option.setName('season')
				.setDescription('Season to view (defaults to the current season)'))
		.addBooleanOption(option =>
			option.setName('career')
				.setDescription('Show career totals instead of a single season')),
	async execute(interaction) {
		if (!hasActiveSave()) {
			return interaction.reply({ content: "No active save file found.", ephemeral: true });
		}

		const save = loadSaveFile(getActiveSavePath());
		const nameInput = interaction.options.getString('name');
		const career = interaction.options.getBoolean('career') || false;
		const seasonInput = interaction.options.getInteger('season');

		let player;
		try {
			player = findPlayer(save, nameInput);
		} catch (error) {
			return interaction.reply({ content: error.message, ephemeral: true });
		}

		const fullName = `${player.firstName} ${player.lastName}`;
		const embed = new EmbedBuilder()
			.setTitle(`${fullName} — Stats`)
			.setColor(0x0099FF);

		if (career) {
			const totals = getCareerStats(player);
			embed.addFields({ name: `Career (${totals ? totals.seasons.length : 0} seasons)`, value: statBlock(totals) });
			return interaction.reply({ embeds: [embed] });
		}

		const season = seasonInput || getCurrentSeason(save);
		if (!season) {
			return interaction.reply({ content: "Couldn't determine a season to show — please pass one explicitly.", ephemeral: true });
		}

		const totals = getStatsForSeason(player, season);
		if (!totals) {
			return interaction.reply({ content: `${fullName} has no recorded stats for the ${season} season.`, ephemeral: true });
		}

		embed.addFields({ name: `${season} Season`, value: statBlock(totals) });
		return interaction.reply({ embeds: [embed] });
	},
};

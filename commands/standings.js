const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { hasActiveSave, loadSaveFile, getActiveSavePath, getTeamRecord, getCurrentSeason } = require('../services/saveEditor');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('standings')
		.setDescription('View league standings for the current season')
		.addIntegerOption(option =>
			option.setName('season')
				.setDescription('Season to view (defaults to the current season)')),
	async execute(interaction) {
		if (!hasActiveSave()) {
			return interaction.reply({ content: "No active save file found.", ephemeral: true });
		}

		const save = loadSaveFile(getActiveSavePath());
		const season = interaction.options.getInteger('season') || getCurrentSeason(save);

		const rows = save.teams.map(team => {
			const record = getTeamRecord(team, season);
			return {
				name: `${team.region} ${team.name}`,
				abbrev: team.abbrev,
				won: record ? record.won : 0,
				lost: record ? record.lost : 0,
			};
		}).filter(r => r.won + r.lost > 0);

		if (rows.length === 0) {
			return interaction.reply({ content: `No standings data found${season ? ` for ${season}` : ''}.`, ephemeral: true });
		}

		rows.sort((a, b) => {
			const pctA = a.won / (a.won + a.lost);
			const pctB = b.won / (b.won + b.lost);
			return pctB - pctA;
		});

		let description = '```\n';
		description += 'TEAM                       W    L    PCT\n';
		for (const r of rows) {
			const pct = (r.won / (r.won + r.lost)).toFixed(3).replace(/^0/, '');
			description += `${r.name.padEnd(26)} ${String(r.won).padEnd(4)} ${String(r.lost).padEnd(4)} ${pct}\n`;
		}
		description += '```';

		const embed = new EmbedBuilder()
			.setTitle(`Standings${season ? ` — ${season}` : ''}`)
			.setDescription(description)
			.setColor(0x0099FF);

		return interaction.reply({ embeds: [embed] });
	},
};

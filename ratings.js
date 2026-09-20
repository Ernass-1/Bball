const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
	hasActiveSave, loadSaveFile, getActiveSavePath, findPlayer,
	getRatingsForSeason, formatHeight
} = require('../services/saveEditor');

// [label, ratings key]
const RATING_ROWS = [
	['Height', 'hgt'], ['Strength', 'stre'], ['Speed', 'spd'], ['Jumping', 'jmp'], ['Endurance', 'endu'],
	['Inside Scoring', 'ins'], ['Dunk/Layup', 'dnk'], ['Free Throw', 'ft'], ['2pt Shot', 'fg'], ['3pt Shot', 'tp'],
	['Off. IQ', 'oiq'], ['Def. IQ', 'diq'], ['Dribbling', 'drb'], ['Passing', 'pss'], ['Rebounding', 'reb'],
];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ratings')
		.setDescription('View a player\'s full ratings breakdown')
		.addStringOption(option =>
			option.setName('name')
				.setDescription('The player\'s full or partial name')
				.setRequired(true))
		.addIntegerOption(option =>
			option.setName('season')
				.setDescription('Season to view (defaults to most recent)')),
	async execute(interaction) {
		if (!hasActiveSave()) {
			return interaction.reply({ content: "No active save file found.", ephemeral: true });
		}

		const save = loadSaveFile(getActiveSavePath());
		const nameInput = interaction.options.getString('name');
		const season = interaction.options.getInteger('season');

		let player;
		try {
			player = findPlayer(save, nameInput);
		} catch (error) {
			return interaction.reply({ content: error.message, ephemeral: true });
		}

		const fullName = `${player.firstName} ${player.lastName}`;
		const ratings = getRatingsForSeason(player, season);

		if (!ratings) {
			return interaction.reply({ content: `No ratings found for ${fullName}.`, ephemeral: true });
		}

		let lines = '';
		for (const [label, key] of RATING_ROWS) {
			const value = key === 'hgt' ? formatHeight(ratings.hgt) : (ratings[key] ?? '??');
			lines += `${label.padEnd(15)} ${value}\n`;
		}

		const embed = new EmbedBuilder()
			.setTitle(`${fullName} — Ratings (${ratings.season ?? 'current'})`)
			.setColor(0x0099FF)
			.addFields(
				{ name: 'Overall', value: `${ratings.ovr ?? '??'}`, inline: true },
				{ name: 'Potential', value: `${ratings.pot ?? '??'}`, inline: true },
				{ name: 'Position', value: `${ratings.pos || player.pos || 'N/A'}`, inline: true },
			)
			.addFields({ name: 'Attributes', value: '```\n' + lines + '```' });

		if (ratings.skills && ratings.skills.length > 0) {
			embed.addFields({ name: 'Skills', value: ratings.skills.join(', ') });
		}

		return interaction.reply({ embeds: [embed] });
	},
};

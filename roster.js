const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
	hasActiveSave, loadSaveFile, getActiveSavePath, resolveTeamId,
	getLatestRatings, getPlayerContract, getCurrentSeason
} = require('../services/saveEditor');
const { getTeamLink } = require('../database/index');

const POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('roster')
		.setDescription('View a team\'s full roster')
		.addStringOption(option =>
			option.setName('team')
				.setDescription('The team to view (name, abbrev, or ID) — defaults to your own team')),
	async execute(interaction) {
		if (!hasActiveSave()) {
			return interaction.reply({ content: "No active save file found.", ephemeral: true });
		}

		const save = loadSaveFile(getActiveSavePath());
		let teamInput = interaction.options.getString('team');

		if (!teamInput) {
			const link = getTeamLink(interaction.user.id);
			if (!link) {
				return interaction.reply({ content: "You haven't claimed a team, and didn't specify one.", ephemeral: true });
			}
			teamInput = link.team_id.toString();
		}

		let team, tid;
		try {
			tid = resolveTeamId(save, teamInput);
			team = save.teams.find(t => t.tid === tid);
		} catch (error) {
			return interaction.reply({ content: error.message, ephemeral: true });
		}

		const roster = save.players.filter(p => p.tid === tid);
		if (roster.length === 0) {
			return interaction.reply({ content: `${team.region} ${team.name} has no players on their roster.`, ephemeral: true });
		}

		const currentSeason = getCurrentSeason(save);

		const rows = roster.map(p => {
			const ratings = getLatestRatings(p);
			const contract = getPlayerContract(p);
			const age = currentSeason && p.born ? currentSeason - p.born.year : null;
			return {
				name: `${p.firstName} ${p.lastName}`,
				pos: p.pos || (ratings && ratings.pos) || '?',
				age,
				ovr: ratings ? ratings.ovr : null,
				pot: ratings ? ratings.pot : null,
				salary: contract ? contract.amount : 0,
			};
		}).sort((a, b) => {
			const posA = POS_ORDER.indexOf(a.pos);
			const posB = POS_ORDER.indexOf(b.pos);
			if (posA !== posB) return (posA === -1 ? 99 : posA) - (posB === -1 ? 99 : posB);
			return (b.ovr || 0) - (a.ovr || 0);
		});

		let description = '```\n';
		description += 'POS  NAME                     AGE  OVR  POT  SALARY\n';
		for (const r of rows) {
			description += `${r.pos.padEnd(4)} ${r.name.padEnd(24)} ${String(r.age ?? '?').padEnd(4)} ${String(r.ovr ?? '??').padEnd(4)} ${String(r.pot ?? '??').padEnd(4)} $${r.salary.toLocaleString()}k\n`;
		}
		description += '```';

		if (description.length > 4000) {
			description = description.slice(0, 3950) + '\n... (truncated) ```';
		}

		const totalPayroll = rows.reduce((sum, r) => sum + r.salary, 0);

		const embed = new EmbedBuilder()
			.setTitle(`${team.region} ${team.name} Roster`)
			.setDescription(description)
			.setFooter({ text: `${rows.length} players | Total payroll: $${totalPayroll.toLocaleString()}k` })
			.setColor(0x0099FF);

		return interaction.reply({ embeds: [embed] });
	},
};

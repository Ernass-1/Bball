const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { hasActiveSave, getActiveSavePath, loadSaveFile, resolveTeamId } = require('../services/saveEditor');
const { getTeamLink } = require('../database/index');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('frontoffice')
		.setDescription('View team financial summary and draft inventory')
		.addStringOption(option => 
			option.setName('team')
				.setDescription('The team to view (name, abbrev, or ID)')),
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

		let team;
		try {
			const tid = resolveTeamId(save, teamInput);
			team = save.teams.find(t => t.tid === tid);
		} catch (e) {
			return interaction.reply({ content: "Team not found.", ephemeral: true });
		}

		const players = save.players.filter(p => p.tid === team.tid);
		const currentSeason = save.gameAttributes.find(a => a.key === 'season').value;
		const salaryCap = save.gameAttributes.find(a => a.key === 'salaryCap').value / 1000; // BBGM uses thousands

		let totalPayroll = 0;
		let minContractCount = 0;
		const minSalary = 1000; // Standard BBGM min is 1000 ($1M)

		players.forEach(p => {
			if (p.contract && p.contract.amount) {
				totalPayroll += p.contract.amount;
				if (p.contract.amount <= minSalary) {
					minContractCount++;
				}
			}
		});

		const diff = salaryCap - totalPayroll;
		const diffText = diff >= 0 ? `Under cap by $${(diff/1000).toFixed(2)}M` : `Over cap by $${(Math.abs(diff)/1000).toFixed(2)}M`;

		const picks = (save.draftPicks || [])
			.filter(p => p.tid === team.tid)
			.sort((a, b) => a.season - b.season || a.round - b.round);

		const pickLines = picks.map(p => `S${p.season} R${p.round} (${p.originalTid === p.tid ? 'Own' : 'from ' + (save.teams.find(t => t.tid === p.originalTid)?.abbrev || 'UNK')})`);

		const embed = new EmbedBuilder()
			.setTitle(`${team.city} ${team.name} Front Office`)
			.addFields(
				{ name: 'Payroll', value: `$${(totalPayroll/1000).toFixed(2)}M / $${(salaryCap/1000).toFixed(2)}M`, inline: true },
				{ name: 'Cap Space', value: diffText, inline: true },
				{ name: 'Min Contracts', value: minContractCount.toString(), inline: true },
				{ name: 'Draft Picks', value: pickLines.length > 0 ? pickLines.join('\n') : 'No picks owned' }
			)
			.setColor(0x00AE86);

		await interaction.reply({ embeds: [embed] });
	},
};

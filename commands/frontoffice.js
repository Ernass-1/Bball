const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { hasActiveSave, getActiveSavePath, loadSaveFile, resolveTeamId, getPlayerContract, getSeasonAttr, getCurrentSeason } = require('../services/saveEditor');
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
		} catch (error) {
			// Surface the real reason (not found vs. ambiguous) instead of a generic message.
			return interaction.reply({ content: error.message, ephemeral: true });
		}

		const players = save.players.filter(p => p.tid === team.tid);
		const currentSeason = getCurrentSeason(save);
		// gameAttributes can be a plain object or an array of {key,value} depending on
		// BBGM version — getSeasonAttr handles both instead of assuming one shape.
		const salaryCapRaw = getSeasonAttr(save, 'salaryCap');
		const salaryCap = salaryCapRaw ? salaryCapRaw / 1000 : null; // BBGM stores this in thousands

		let totalPayroll = 0;
		let minContractCount = 0;
		const minSalary = getSeasonAttr(save, 'minContract') || 1000; // Standard BBGM min is 1000 ($1M)

		players.forEach(p => {
			// Contracts can live under either `contract` or `salaries[0]` in this
			// codebase's save files — getPlayerContract checks both.
			const contract = getPlayerContract(p);
			if (contract && contract.amount) {
				totalPayroll += contract.amount;
				if (contract.amount <= minSalary) {
					minContractCount++;
				}
			}
		});

		let payrollFieldValue;
		let capFieldValue;
		if (salaryCap !== null) {
			const diff = salaryCap - (totalPayroll / 1000);
			capFieldValue = diff >= 0 ? `Under cap by $${diff.toFixed(2)}M` : `Over cap by $${Math.abs(diff).toFixed(2)}M`;
			payrollFieldValue = `$${(totalPayroll / 1000).toFixed(2)}M / $${salaryCap.toFixed(2)}M`;
		} else {
			// This save doesn't expose a salary cap figure — show payroll without a cap comparison.
			capFieldValue = 'Unknown (save has no salaryCap figure)';
			payrollFieldValue = `$${(totalPayroll / 1000).toFixed(2)}M`;
		}

		const picks = (save.draftPicks || [])
			.filter(p => p.tid === team.tid)
			.sort((a, b) => a.season - b.season || a.round - b.round);

		const pickLines = picks.map(p => `S${p.season} R${p.round} (${p.originalTid === p.tid ? 'Own' : 'from ' + (save.teams.find(t => t.tid === p.originalTid)?.abbrev || 'UNK')})`);

		const embed = new EmbedBuilder()
			.setTitle(`${team.region} ${team.name} Front Office${currentSeason ? ` — ${currentSeason}` : ''}`)
			.addFields(
				{ name: 'Payroll', value: payrollFieldValue, inline: true },
				{ name: 'Cap Space', value: capFieldValue, inline: true },
				{ name: 'Min Contracts', value: minContractCount.toString(), inline: true },
				{ name: 'Draft Picks', value: pickLines.length > 0 ? pickLines.join('\n') : 'No picks owned' }
			)
			.setColor(0x00AE86);

		await interaction.reply({ embeds: [embed] });
	},
};

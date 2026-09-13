const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTeamLink, createFaOffer, getOpenOffersForPlayer, updateFaOfferStatus, closeOtherOffersForPlayer } = require('../database');
const { hasActiveSave, loadSaveFile, getTeam, saveSaveFile } = require('../services/saveEditor');
const { evaluateOffers } = require('../services/faEngine');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('fa')
		.setDescription('Free agency commands')
		.addSubcommand(subcommand =>
			subcommand
				.setName('offer')
				.setDescription('Submit a contract offer to a free agent')
				.addStringOption(option =>
					option.setName('player_name')
						.setDescription('The full name of the free agent')
						.setRequired(true))
				.addIntegerOption(option =>
					option.setName('amount_per_year')
						.setDescription('The salary amount per year')
						.setRequired(true))
				.addIntegerOption(option =>
					option.setName('years')
						.setDescription('Number of years')
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('close')
				.setDescription('Close bidding and automatically sign a free agent')
				.addStringOption(option =>
					option.setName('player_name')
						.setDescription('The full name of the free agent')
						.setRequired(true))),
	async execute(interaction) {
		if (!hasActiveSave()) {
			return interaction.reply({ content: "No active save file has been uploaded yet — ask your commissioner to upload one using `/save upload`.", ephemeral: true });
		}

		if (interaction.options.getSubcommand() === 'offer') {
			const discordId = interaction.user.id;
			const teamLink = getTeamLink(discordId);

			if (!teamLink) {
				return interaction.reply({ content: "You need to claim a team first.", ephemeral: true });
			}

			const teamId = teamLink.team_id;
			const playerName = interaction.options.getString('player_name');
			const amountPerYear = interaction.options.getInteger('amount_per_year');
			const years = interaction.options.getInteger('years');

			let save;
			try {
				save = loadSaveFile();
			} catch (error) {
				return interaction.reply({ content: `Error loading save file: ${error.message}`, ephemeral: true });
			}

			if (!save.players) {
				return interaction.reply({ content: "No players found in save file.", ephemeral: true });
			}

			const player = save.players.find(p => `${p.firstName} ${p.lastName}`.toLowerCase() === playerName.toLowerCase());

			if (!player) {
				return interaction.reply({ content: `'${playerName}' is not found in the save.`, ephemeral: true });
			}

			// BBGM free agents typically have a tid of -1
			const FA_TID = -1;
			if (player.tid !== FA_TID) {
				return interaction.reply({ content: `'${player.firstName} ${player.lastName}' is not a free agent.`, ephemeral: true });
			}

			const resolvedTeam = getTeam(save, teamId);
			const teamDisplayName = resolvedTeam ? `${resolvedTeam.region} ${resolvedTeam.name}` : `Team ID ${teamId}`;

			const offerId = createFaOffer(discordId, teamId, `${player.firstName} ${player.lastName}`, amountPerYear, years);

			const commishChannelId = process.env.COMMISH_CHANNEL_ID;
			if (commishChannelId) {
				const channel = await interaction.client.channels.fetch(commishChannelId).catch(() => null);
				if (channel) {
					const embed = new EmbedBuilder()
						.setTitle('New Free Agent Offer')
						.setDescription(`An offer has been submitted for **${player.firstName} ${player.lastName}**.`)
						.addFields(
							{ name: 'Team', value: teamDisplayName, inline: true },
							{ name: 'Player', value: `${player.firstName} ${player.lastName}`, inline: true },
							{ name: 'Offer', value: `$${amountPerYear.toLocaleString()}/yr for ${years} year(s)`, inline: false }
						)
						.setColor(0x00FF00)
						.setTimestamp();

					const row = new ActionRowBuilder().addComponents(
						new ButtonBuilder()
							.setCustomId(`sign_fa_${offerId}`)
							.setLabel('Sign With This Offer')
							.setStyle(ButtonStyle.Success)
					);

					await channel.send({ embeds: [embed], components: [row] });
				}
			}

			return interaction.reply({ content: `Your offer of $${amountPerYear.toLocaleString()}/yr for ${years} year(s) to ${player.firstName} ${player.lastName} has been submitted!`, ephemeral: true });
		}

		if (interaction.options.getSubcommand() === 'close') {
			if (!interaction.member.roles.cache.has(process.env.COMMISSIONER_ROLE_ID)) {
				return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
			}

			const playerName = interaction.options.getString('player_name');
			const offers = getOpenOffersForPlayer(playerName);

			if (!offers || offers.length === 0) {
				return interaction.reply({ content: `There are no open offers for '${playerName}'.`, ephemeral: true });
			}

			let save;
			try {
				save = loadSaveFile();
			} catch (error) {
				return interaction.reply({ content: `Error loading save file: ${error.message}`, ephemeral: true });
			}

			const winningOffer = evaluateOffers(save, offers);

			if (!winningOffer) {
				return interaction.reply({ content: "Failed to evaluate offers.", ephemeral: true });
			}

			// Update player in save
			const player = save.players.find(p => `${p.firstName} ${p.lastName}`.toLowerCase() === playerName.toLowerCase());
			if (!player) {
				return interaction.reply({ content: `Could not find player '${playerName}' in the save file.`, ephemeral: true });
			}

			player.tid = winningOffer.team_id;
			saveSaveFile(save, process.env.ACTIVE_SAVE_PATH);

			// Update DB
			updateFaOfferStatus(winningOffer.id, 'signed');
			closeOtherOffersForPlayer(playerName, winningOffer.id);

			const team = getTeam(save, winningOffer.team_id);
			const teamName = team ? `${team.region} ${team.name}` : `Team ID ${winningOffer.team_id}`;

			const embed = new EmbedBuilder()
				.setTitle(`Free Agent Signed: ${playerName}`)
				.setDescription(`**${teamName}** has signed ${playerName} to a ${winningOffer.years}-year deal worth $${winningOffer.amount_per_year.toLocaleString()} per year.`)
				.setFooter({ text: `Evaluation: Highest total value weighted by team win percentage among ${offers.length} offers.` });

			return interaction.reply({ embeds: [embed] });
		}
	},
};

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTeamLink, createFaOffer, getOpenOffersForPlayer, updateFaOfferStatus, closeOtherOffersForPlayer, getRfaStatus, upsertRfaStatus, getTeamOwner } = require('../database');
const { hasActiveSave, loadSaveFile, getTeam, saveSaveFile, canSignWithinCapRules, getActiveSavePath, getExpiringContracts } = require('../services/saveEditor');
const { evaluateOffers } = require('../services/faEngine');
const { isCommissioner, isBotOwner } = require('../utils/permissions');
const { getTeamChannel } = require('../services/channelHelper');

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
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('announce-expiring')
				.setDescription('Post expiring contracts to each team channel')),
	async execute(interaction) {
		if (!hasActiveSave()) {
			return interaction.reply({ content: "No active save file has been uploaded yet — ask your commissioner to upload one using `/save upload`.", ephemeral: true });
		}

		const activeSavePath = process.env.ACTIVE_SAVE_PATH || getActiveSavePath();

		if (interaction.options.getSubcommand() === 'offer') {
			const discordId = interaction.user.id;
			const teamLink = getTeamLink(discordId);

			if (!teamLink && !isBotOwner(discordId)) {
				return interaction.reply({ content: "You need to claim a team first.", ephemeral: true });
			}

			const teamId = teamLink ? teamLink.team_id : null; 
			
			const playerName = interaction.options.getString('player_name');
			const amountPerYear = interaction.options.getInteger('amount_per_year');
			const years = interaction.options.getInteger('years');

			let save;
			try {
				save = loadSaveFile(activeSavePath);
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

			if (!isBotOwner(discordId)) {
				const capCheck = canSignWithinCapRules(save, teamId, amountPerYear);
				if (!capCheck.allowed) {
					return interaction.reply({ content: capCheck.reason, ephemeral: true });
				}
			}

			const resolvedTeam = getTeam(save, teamId);
			const teamDisplayName = resolvedTeam ? `${resolvedTeam.region} ${resolvedTeam.name}` : `Team ID ${teamId}`;

			const offerId = createFaOffer(discordId, teamId, `${player.firstName} ${player.lastName}`, amountPerYear, years);

			// Check RFA status
			const rfaStatus = getRfaStatus(`${player.firstName} ${player.lastName}`);
			const isRfa = rfaStatus && (rfaStatus.status === 'restricted' || rfaStatus.status === 'qualifying_offer_pending');

			if (isRfa) {
				upsertRfaStatus(`${player.firstName} ${player.lastName}`, rfaStatus.original_team_id, 'signed_elsewhere_pending_match', amountPerYear);

				const commishChannelId = process.env.COMMISH_CHANNEL_ID;
				if (commishChannelId) {
					const channel = await interaction.client.channels.fetch(commishChannelId).catch(() => null);
					if (channel) {
						const embed = new EmbedBuilder()
							.setTitle('Offer sheet — original team has a window to match')
							.setDescription(`An offer sheet has been submitted for restricted free agent **${player.firstName} ${player.lastName}** by **${teamDisplayName}**.`)
							.addFields(
								{ name: 'New Team', value: teamDisplayName, inline: true },
								{ name: 'Player', value: `${player.firstName} ${player.lastName}`, inline: true },
								{ name: 'Offer', value: `$${amountPerYear.toLocaleString()}/yr for ${years} year(s)`, inline: false }
							)
							.setColor(0xFFA500)
							.setTimestamp();

						const row = new ActionRowBuilder().addComponents(
							new ButtonBuilder()
								.setCustomId(`rfa_match_${player.firstName} ${player.lastName}`)
								.setLabel('Match Offer')
								.setStyle(ButtonStyle.Success),
							new ButtonBuilder()
								.setCustomId(`rfa_walk_${player.firstName} ${player.lastName}`)
								.setLabel('Let Player Walk')
								.setStyle(ButtonStyle.Danger)
						);

						await channel.send({ embeds: [embed], components: [row] });
					}
				}

				const originalOwnerDiscordId = getTeamOwner(rfaStatus.original_team_id);
				if (originalOwnerDiscordId) {
					try {
						const ownerUser = await interaction.client.users.fetch(originalOwnerDiscordId);
						if (ownerUser) {
							await ownerUser.send(`Your restricted free agent **${player.firstName} ${player.lastName}** has received an offer sheet from **${teamDisplayName}** ($${amountPerYear.toLocaleString()}/yr for ${years} yrs). Check the commissioner channel to match or let walk.`);
						}
					} catch (err) {
						// DM failed, ignore
					}
				}

				return interaction.reply({ content: `Your offer sheet of $${amountPerYear.toLocaleString()}/yr for ${years} year(s) to RFA ${player.firstName} ${player.lastName} has been submitted and sent to the original team for matching!`, ephemeral: true });
			}

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
			if (!isCommissioner(interaction.member)) {
				return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
			}

			const playerName = interaction.options.getString('player_name');
			let offers = getOpenOffersForPlayer(playerName);

			if (!offers || offers.length === 0) {
				return interaction.reply({ content: `There are no open offers for '${playerName}'.`, ephemeral: true });
			}

			let save;
			try {
				save = loadSaveFile(activeSavePath);
			} catch (error) {
				return interaction.reply({ content: `Error loading save file: ${error.message}`, ephemeral: true });
			}

			// Filter offers by cap rules before evaluating
			let validOffers = offers.filter(offer => canSignWithinCapRules(save, offer.team_id, offer.amount_per_year).allowed);

			if (validOffers.length === 0) {
				return interaction.reply({ content: `Could not sign ${playerName} because no remaining offers are valid under the salary cap.` });
			}

			const winningOffer = evaluateOffers(save, validOffers);

			if (!winningOffer) {
				return interaction.reply({ content: "Failed to evaluate offers.", ephemeral: true });
			}

			// Update player in save
			const player = save.players.find(p => `${p.firstName} ${p.lastName}`.toLowerCase() === playerName.toLowerCase());
			if (!player) {
				return interaction.reply({ content: `Could not find player '${playerName}' in the save file.`, ephemeral: true });
			}

			player.tid = winningOffer.team_id;
			saveSaveFile(save, activeSavePath);

			// Update DB
			updateFaOfferStatus(winningOffer.id, 'signed');
			closeOtherOffersForPlayer(playerName, winningOffer.id);

			const team = getTeam(save, winningOffer.team_id);
			const teamName = team ? `${team.region} ${team.name}` : `Team ID ${winningOffer.team_id}`;

			const embed = new EmbedBuilder()
				.setTitle(`Free Agent Signed: ${playerName}`)
				.setDescription(`**${teamName}** has signed ${playerName} to a ${winningOffer.years}-year deal worth $${winningOffer.amount_per_year.toLocaleString()} per year.`)
				.setFooter({ text: `Evaluation: Highest total value weighted by team win percentage among ${validOffers.length} valid offers.` });

			return interaction.reply({ embeds: [embed] });
		}

		if (interaction.options.getSubcommand() === 'announce-expiring') {
			if (!isCommissioner(interaction.member)) {
				return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
			}

			const save = loadSaveFile(activeSavePath);
			const teams = save.teams;
			
			let postedCount = 0;
			let nothingExpiringCount = 0;
			let skippedCount = 0;

			for (const team of teams) {
				const expiring = getExpiringContracts(save, team.tid);
				
				if (expiring.length === 0) {
					nothingExpiringCount++;
					continue;
				}

				const channel = getTeamChannel(interaction.client, team.tid);
				if (!channel) {
					skippedCount++;
					continue;
				}

				const embed = new EmbedBuilder()
					.setTitle("Contracts expiring this off-season")
					.setColor(0x0099FF)
					.setDescription(expiring.map(p => `**${p.name}** (${p.pos}) - $${p.amount.toLocaleString()}k`).join('\n'));

				try {
					await channel.send({ embeds: [embed] });
					postedCount++;
				} catch (error) {
					console.error(`Failed to post to channel for team ${team.tid}:`, error);
					skippedCount++;
				}
			}

			await interaction.reply({
				content: `Announcements complete.\n- Posted to: ${postedCount} channels\n- Skipped (no expiring): ${nothingExpiringCount}\n- Skipped (no channel): ${skippedCount}`,
				ephemeral: true
			});
		}
	},
};

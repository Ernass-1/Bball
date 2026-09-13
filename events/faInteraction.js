const { Events, EmbedBuilder } = require('discord.js');
const { getFaOffer, updateFaOfferStatus, closeOtherOffersForPlayer, getOpenOffersForPlayer } = require('../database');
const { hasActiveSave, loadSaveFile, saveSaveFile } = require('../services/saveEditor');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (!interaction.isButton()) return;

		if (!interaction.customId.startsWith('sign_fa_')) return;

		if (!interaction.member.roles.cache.has(process.env.COMMISSIONER_ROLE_ID)) {
			return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
		}

		const offerId = parseInt(interaction.customId.replace('sign_fa_', ''), 10);
		const offer = getFaOffer(offerId);

		if (!offer) {
			return interaction.reply({ content: 'Offer not found.', ephemeral: true });
		}

		if (offer.status !== 'open') {
			return interaction.reply({ content: `This offer is already ${offer.status}.`, ephemeral: true });
		}

		if (!hasActiveSave()) {
			return interaction.reply({ content: 'No active save file found.', ephemeral: true });
		}

		let save;
		try {
			save = loadSaveFile();
		} catch (error) {
			return interaction.reply({ content: `Error loading save file: ${error.message}`, ephemeral: true });
		}

		if (!save.players) {
			return interaction.reply({ content: 'No players found in save file.', ephemeral: true });
		}

		const player = save.players.find(p => `${p.firstName} ${p.lastName}`.toLowerCase() === offer.player_name.toLowerCase());

		if (!player) {
			return interaction.reply({ content: `Player '${offer.player_name}' not found in save file.`, ephemeral: true });
		}

		// Update player tid to the team id
		player.tid = offer.team_id;

		try {
			saveSaveFile(save);
		} catch (error) {
			return interaction.reply({ content: `Failed to save save file: ${error.message}`, ephemeral: true });
		}

		// Close other open offers in DB
		updateFaOfferStatus(offerId, 'signed');
		closeOtherOffersForPlayer(offer.player_name, offerId);

		const commishTag = interaction.user.tag;
		const originalEmbed = interaction.message.embeds[0];
		const updatedEmbed = EmbedBuilder.from(originalEmbed)
			.setColor(0x00FF00)
			.addFields({ name: 'Status', value: `✅ Signed by ${commishTag}`, inline: false });

		await interaction.update({ embeds: [updatedEmbed], components: [] });
	},
};

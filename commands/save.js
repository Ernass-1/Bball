const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { loadSaveFile, saveSaveFile, getActiveSavePath, hasActiveSave } = require('../services/saveEditor');
const fs = require('node:fs');
const https = require('node:https');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('save')
		.setDescription('Manage the league save file')
		.addSubcommand(subcommand =>
			subcommand
				.setName('upload')
				.setDescription('Upload a new BBGM save file')
				.addAttachmentOption(option => 
					option.setName('file')
						.setDescription('The BBGM .json export')
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('export')
				.setDescription('Export the current active save file')),
	async execute(interaction) {
		if (interaction.options.getSubcommand() === 'upload') {
			if (!interaction.member.roles.cache.has(process.env.COMMISSIONER_ROLE_ID)) {
				return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
			}

			const attachment = interaction.options.getAttachment('file');
			
			if (!attachment.contentType || !attachment.contentType.includes('json')) {
				return interaction.reply({ content: 'Please upload a valid JSON file.', ephemeral: true });
			}

			await interaction.deferReply({ ephemeral: true });

			const tempPath = `./data/temp_${Date.now()}.json`;
			const file = fs.createWriteStream(tempPath);

			https.get(attachment.url, (response) => {
				response.pipe(file);
				file.on('finish', () => {
					file.close(async () => {
						try {
							const save = loadSaveFile(tempPath);
							
							if (!Array.isArray(save.teams) || !Array.isArray(save.players)) {
								fs.unlinkSync(tempPath);
								return interaction.editReply('Invalid BBGM save: Missing teams or players array.');
							}

							saveSaveFile(save, getActiveSavePath());
							fs.unlinkSync(tempPath);

							await interaction.editReply(`Success! Active save updated. Found ${save.teams.length} teams and ${save.players.length} players.`);
						} catch (error) {
							if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
							await interaction.editReply(`Error processing file: ${error.message}`);
						}
					});
				});
			}).on('error', async (err) => {
				if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
				await interaction.editReply(`Error downloading file: ${err.message}`);
			});
		} else if (interaction.options.getSubcommand() === 'export') {
			if (!hasActiveSave()) {
				return interaction.reply({ content: 'No active save file has been uploaded yet.', ephemeral: true });
			}

			const file = new AttachmentBuilder(getActiveSavePath(), { name: 'active_save.json' });
			await interaction.reply({ content: 'Here is the current active save file:', files: [file] });
		}
	},
};

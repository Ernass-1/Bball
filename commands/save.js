const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getActiveSavePath, hasActiveSave, validateAndStoreSave } = require('../services/saveEditor');
const { isCommissioner } = require('../utils/permissions');
const { listSnapshots, restoreSnapshot, backupToGitHub } = require('../services/dataBackup');

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
						.setDescription('The BBGM .json or .json.gz export'))
				.addStringOption(option =>
					option.setName('url')
						.setDescription('Direct download URL for a BBGM save')))
		.addSubcommand(subcommand =>
			subcommand
				.setName('export')
				.setDescription('Export the current active save file'))
		.addSubcommand(subcommand =>
			subcommand
				.setName('history')
				.setDescription('List past save snapshots'))
		.addSubcommand(subcommand =>
			subcommand
				.setName('restore')
				.setDescription('Restore the league to a past snapshot')
				.addStringOption(option =>
					option.setName('timestamp')
						.setDescription('The timestamp of the snapshot to restore (from /save history)')
						.setRequired(true))),
	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();
		if (subcommand === 'upload') {
			if (!isCommissioner(interaction.member)) {
				return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
			}

			const attachment = interaction.options.getAttachment('file');
			const url = interaction.options.getString('url');

			if ((!attachment && !url) || (attachment && url)) {
				return interaction.reply({ content: 'Please provide exactly one of: a file attachment OR a URL.', ephemeral: true });
			}

			await interaction.deferReply({ ephemeral: true });

			try {
				let buffer;

				if (attachment) {
					const response = await fetch(attachment.url);
					if (!response.ok) throw new Error(`Failed to download attachment: ${response.statusText}`);
					buffer = Buffer.from(await response.arrayBuffer());
				} else {
					if (!url.startsWith('http://') && !url.startsWith('https://')) {
						return interaction.editReply('Please provide a direct http(s) download link.');
					}

					const controller = new AbortController();
					const timeout = setTimeout(() => controller.abort(), 30000);

					try {
						const response = await fetch(url, { signal: controller.signal });
						clearTimeout(timeout);

						if (!response.ok) throw new Error(`Failed to download from URL: ${response.statusText}`);

						const contentLength = response.headers.get('Content-Length');
						if (contentLength && parseInt(contentLength, 10) > 100 * 1024 * 1024) {
							return interaction.editReply('The file at that URL is too large (over 100MB).');
						}

						buffer = Buffer.from(await response.arrayBuffer());
					} catch (err) {
						clearTimeout(timeout);
						if (err.name === 'AbortError') throw new Error('Download timed out after 30 seconds.');
						throw err;
					}
				}

				const result = validateAndStoreSave(buffer);
				await interaction.editReply(`Success! Active save updated. Found ${result.teamCount} teams and ${result.playerCount} players.`);

			} catch (error) {
				await interaction.editReply(`Error: ${error.message}`);
			}
		} else if (interaction.options.getSubcommand() === 'export') {
			if (!hasActiveSave()) {
				return interaction.reply({ content: 'No active save file has been uploaded yet.', ephemeral: true });
			}

			const file = new AttachmentBuilder(getActiveSavePath(), { name: 'active_save.json' });
			await interaction.reply({ content: 'Here is the current active save file:', files: [file] });
		} else if (subcommand === 'history') {
			if (!isCommissioner(interaction.member)) {
				return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
			}
			await interaction.deferReply({ ephemeral: true });
			try {
				const snapshots = await listSnapshots();
				if (snapshots.length === 0) return interaction.editReply("No snapshots found.");

				const list = snapshots.slice(0, 15).map(s => `\`${s.timestamp}\``).join('\n');
				const embed = new EmbedBuilder()
					.setTitle('Save Snapshot History')
					.setDescription(`Most recent ${Math.min(snapshots.length, 15)} snapshots:\n\n${list}\n\nUse \`/save restore timestamp:<timestamp>\` to revert.`)
					.setFooter({ text: `Total snapshots: ${snapshots.length}` });

				await interaction.editReply({ embeds: [embed] });
			} catch (error) {
				await interaction.editReply(`Error: ${error.message}`);
			}
		} else if (subcommand === 'restore') {
			if (!isCommissioner(interaction.member)) {
				return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
			}
			const timestamp = interaction.options.getString('timestamp');
			const row = new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`confirm_restore_${timestamp}`).setLabel('Confirm Restore').setStyle(ButtonStyle.Danger),
				new ButtonBuilder().setCustomId('cancel_restore').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
			);
			await interaction.reply({
				content: `⚠️ **WARNING**: About to restore save from \`${timestamp}\`. This overwrites current state. Bot records (trades/offers) are NOT rolled back.`,
				components: [row],
				ephemeral: true
			});
		}
	},
};

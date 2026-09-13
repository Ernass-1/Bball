# BBGM Discord Bot

A Discord bot base for managing Basketball GM leagues.

## Setup

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Configuration:**
    *   Copy `.env.example` to `.env`.
    *   Fill in your `DISCORD_TOKEN` and `CLIENT_ID` (from the Discord Developer Portal).
    *   `GUILD_ID`: (Optional) The ID of your specific Discord server. If set, commands will register instantly to this server for testing. If left blank, commands will register globally (which can take up to an hour to propagate).
    *   `COMMISH_CHANNEL_ID`, `DRAFT_CHANNEL_ID`, `COMMISSIONER_ROLE_ID`: (Optional) These can be set via environment variables, but are now configurable in-Discord via the `/config` command.
    *   `BOT_OWNER_DISCORD_ID`: (Optional) The Discord user ID of the bot owner. This user bypasses all role and team-ownership checks. Useful for testing and administration. If left unset, normal permission checks apply to everyone.
    *   `DRAFT_PICK_SECONDS`: The countdown length per pick (default 90 seconds).
    *   `GITHUB_TOKEN`: A GitHub Personal Access Token with 'repo' scope (read/write).
    *   `GITHUB_REPO`: The repository slug (e.g., "username/repo-name").
    *   `DATA_BACKUP_BRANCH`: The branch name to store data (default "bot-data").
    *   `BACKUP_INTERVAL_MINUTES`: How often to auto-backup (default 5).

3.  **Data Storage & Persistence:**
    *   The bot stores the current league state in `data/active_save.json`. This directory and file are managed automatically by the bot at runtime.
    *   **GitHub Backup Mechanism**: To protect against filesystem wipes (common on platforms like Render), the bot automatically backs up its database and save file to a dedicated GitHub branch.
        *   **Restore**: On startup, the bot clones the configured branch and restores the database and save file.
        *   **Backup**: The bot periodically pushes changes to GitHub.
        *   **Note**: This does not protect against data changes made between the last backup and a crash.
    *   Use `/save upload` (Commissioner only) to set the active save.
    *   Use `/save export` to download the current state.
    *   Commands like `/team claim` and `/fa offer` require an active save file to be uploaded first.

## Usage

*   **Command Registration**: The bot automatically registers all slash commands on startup. You do not need to run a separate script. If you are developing, setting `GUILD_ID` in your `.env` file is recommended so that changes appear instantly on your test server. You can still run `node deploy-commands.js` manually if you need to force a refresh without restarting the bot.

*   **/config set-channel [purpose] [channel]**: (Administrator/Bot Owner only) Sets the channel for a specific purpose (Commissioner or Draft).
*   **/config set-role [purpose] [role]**: (Administrator/Bot Owner only) Sets the role for a specific purpose (Commissioner).
*   **/config show**: (Administrator/Bot Owner only) Displays the current configuration, showing whether values are set via Discord or falling back to environment variables.

*   **/team list**: Displays a list of all teams in the league, including their full name, abbreviation, and numeric ID.

*   **/team claim [team_name]**: Claim a franchise. You can use the full name (e.g., "Los Angeles Lakers"), short name ("Lakers"), abbreviation ("LAL"), or numeric ID.

*   **/team setuproles**: (Commissioner only) Creates Discord roles for every team in the league based on the active save file.
    *   **Note**: Ensure the bot's role is positioned higher than the team roles it creates in your server's role hierarchy, otherwise it will not be able to assign them to users.

*   **/team setupchannels**: (Commissioner only) Creates a "Team Channels" category and a private text channel for every team that has a role assigned.
    *   **Access Control**: Channels are created with permission overwrites so that only the team's role and the commissioner role can view them. Access is automatically managed via Discord's role system.
    *   **Note**: Future features will post automated updates (e.g., contract expirations, RFA status, draft picks) into these channels.

*   **/trade propose [recipient] [your_player] [their_player]**: Propose a trade. The bot enforces a salary matching rule: a team can only take on incoming salary if it is less than or equal to 125% of the outgoing salary plus $100,000.

*   **/fa offer [player_name] [amount_per_year] [years]**: Submit a contract offer to a free agent. Commissioners will receive the offer in the commissioner channel with a button to sign the player to that offer.

*   **/fa announce-expiring**: (Commissioner only) Posts a list of players with expiring contracts to each team's private channel. This is typically run at the start of the off-season, before opening free agency.

*   **/rfa announce**: (Commissioner only) Posts a list of RFA-eligible players to each team's private channel. This is typically run at the start of the off-season, around the same time as `/fa announce-expiring`.

*   **/fa close [player_name]**: (Commissioner only) Closes bidding on a player and automatically signs them to the best offer.
    *   **Evaluation Logic**: The bot calculates a score for each offer using the formula: `Score = (AmountPerYear * Years) * (1 + TeamWinPercentage)`. This prioritizes higher total contract value, while using the team's current win percentage as a tie-breaker/preference factor.

*   **/draft announce-picks [season]**: (Commissioner only) Posts each team's draft pick inventory for an upcoming season into that team's private channel. Typically run before the draft starts so teams know their position.
*   **/draft start [season]**: (Commissioner only) Initializes the draft for the specified season and puts the first team on the clock.
*   **/draft board**: Displays the next 5 upcoming picks and the top 10 remaining prospects (sorted by overall rating).
*   **/draft pick [player_name]**: Allows the team owner currently on the clock to select a prospect.
    *   **Rookie Scale**: Drafted players receive a 4-year contract. The salary follows a linear scale starting at $10M for the first pick and decreasing by $250k per pick, with a minimum salary of $1M.
    *   **Draft Timer**: The bot enforces a countdown per pick. If a team fails to pick in time, the bot will automatically draft the best available prospect.
    *   **Note**: The draft timer state is in-memory only and does not survive a bot restart. If the bot restarts mid-draft, the commissioner will need to re-run `/draft start` for the current season to resume timing.

*   **/admin backup**: (Commissioner only) Forces an immediate backup to GitHub.

4.  **Run the bot:**
    ```bash
    npm start
    ```

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
    *   `COMMISH_CHANNEL_ID`: The ID of the channel where claim requests and free agency offers are sent.
    *   `COMMISSIONER_ROLE_ID`: The ID of the role allowed to approve/deny claims, upload save files, and resolve free agency offers.
    *   `DRAFT_CHANNEL_ID`: The ID of the channel where draft clock warnings and auto-pick announcements are posted.
    *   `DRAFT_PICK_SECONDS`: The countdown length per pick (default 90 seconds).
    *   `GITHUB_TOKEN`: A GitHub Personal Access Token with 'repo' scope (read/write).
    *   `GITHUB_REPO`: The repository slug (e.g., "username/repo-name").
    *   `DATA_BACKUP_BRANCH`: The branch name to store data (default "bot-data").
    *   `BACKUP_INTERVAL_MINUTES`: How often to auto-backup (default 5).

3.  **Data Storage & Persistence:**
    *   The bot stores the current league state in `data/active_save.json`.
    *   **GitHub Backup Mechanism**: To protect against filesystem wipes (common on platforms like Render), the bot automatically backs up its database and save file to a dedicated GitHub branch.
        *   **Restore**: On startup, the bot clones the configured branch and restores the database and save file.
        *   **Backup**: The bot periodically pushes changes to GitHub.
        *   **Note**: This does not protect against data changes made between the last backup and a crash.
    *   Use `/save upload` (Commissioner only) to set the active save.
    *   Use `/save export` to download the current state.
    *   Commands like `/team claim` and `/fa offer` require an active save file to be uploaded first.

## Usage

*   **/team claim [team_name]**: Claim a franchise. You can use the full name (e.g., "Los Angeles Lakers"), short name ("Lakers"), abbreviation ("LAL"), or numeric ID.

*   **/trade propose [recipient] [your_player] [their_player]**: Propose a trade. The bot enforces a salary matching rule: a team can only take on incoming salary if it is less than or equal to 125% of the outgoing salary plus $100,000.

*   **/fa offer [player_name] [amount_per_year] [years]**: Submit a contract offer to a free agent. Commissioners will receive the offer in the commissioner channel with a button to sign the player to that offer.

*   **/fa close [player_name]**: (Commissioner only) Closes bidding on a player and automatically signs them to the best offer.
    *   **Evaluation Logic**: The bot calculates a score for each offer using the formula: `Score = (AmountPerYear * Years) * (1 + TeamWinPercentage)`. This prioritizes higher total contract value, while using the team's current win percentage as a tie-breaker/preference factor.

*   **/draft start [season]**: (Commissioner only) Initializes the draft for the specified season and puts the first team on the clock.
*   **/draft board**: Displays the next 5 upcoming picks and the top 10 remaining prospects (sorted by overall rating).
*   **/draft pick [player_name]**: Allows the team owner currently on the clock to select a prospect.
    *   **Rookie Scale**: Drafted players receive a 4-year contract. The salary follows a linear scale starting at $10M for the first pick and decreasing by $250k per pick, with a minimum salary of $1M.
    *   **Draft Timer**: The bot enforces a countdown per pick. If a team fails to pick in time, the bot will automatically draft the best available prospect.
    *   **Note**: The draft timer state is in-memory only and does not survive a bot restart. If the bot restarts mid-draft, the commissioner will need to re-run `/draft start` for the current season to resume timing.

*   **/admin backup**: (Commissioner only) Forces an immediate backup to GitHub.

4.  **Deploy Commands:**
    Run this once (or whenever you add new commands) to register slash commands:
    ```bash
    npm run deploy
    ```

4.  **Run the bot:**
    ```bash
    npm start
    ```

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

3.  **Data Storage:**
    *   The bot stores the current league state in `data/active_save.json`. This directory is ignored by git to protect league data.
    *   Use `/save upload` (Commissioner only) to set the active save.
    *   Use `/save export` to download the current state.
    *   Commands like `/team claim` and `/fa offer` require an active save file to be uploaded first.

## Usage

*   **/team claim [team_name]**: Claim a franchise. You can use the full name (e.g., "Los Angeles Lakers"), short name ("Lakers"), abbreviation ("LAL"), or numeric ID.

*   **/trade propose [recipient] [your_player] [their_player]**: Propose a trade. The bot enforces a salary matching rule: a team can only take on incoming salary if it is less than or equal to 125% of the outgoing salary plus $100,000.

*   **/fa offer [player_name] [amount_per_year] [years]**: Submit a contract offer to a free agent. Commissioners will receive the offer in the commissioner channel with a button to sign the player to that offer.

*   **/fa close [player_name]**: (Commissioner only) Closes bidding on a player and automatically signs them to the best offer.
    *   **Evaluation Logic**: The bot calculates a score for each offer using the formula: `Score = (AmountPerYear * Years) * (1 + TeamWinPercentage)`. This prioritizes higher total contract value, while using the team's current win percentage as a tie-breaker/preference factor.

4.  **Deploy Commands:**
    Run this once (or whenever you add new commands) to register slash commands:
    ```bash
    npm run deploy
    ```

4.  **Run the bot:**
    ```bash
    npm start
    ```

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
    *   `COMMISH_CHANNEL_ID`: The ID of the channel where claim requests are sent.
    *   `COMMISSIONER_ROLE_ID`: The ID of the role allowed to approve/deny claims and upload save files.

3.  **Data Storage:**
    *   The bot stores the current league state in `data/active_save.json`. This directory is ignored by git to protect league data.
    *   Use `/save upload` (Commissioner only) to set the active save.
    *   Use `/save export` to download the current state.

4.  **Deploy Commands:**
    Run this once (or whenever you add new commands) to register slash commands:
    ```bash
    npm run deploy
    ```

4.  **Run the bot:**
    ```bash
    npm start
    ```

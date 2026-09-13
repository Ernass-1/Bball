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

3.  **Deploy Commands:**
    Run this once (or whenever you add new commands) to register slash commands:
    ```bash
    npm run deploy
    ```

4.  **Run the bot:**
    ```bash
    npm start
    ```

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(process.cwd(), 'data', 'league_history.log');

function ensureDirectoryExists(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

function logEvent(client, eventType, details) {
    try {
        ensureDirectoryExists(HISTORY_FILE);
        const timestamp = new Date().toISOString();
        let message = `[${timestamp}] ${eventType.toUpperCase().replace(/_/g, ' ')}: `;

        switch (eventType) {
            case 'trade_approved':
                message += `${details.proposerTeam} <-> ${details.recipientTeam} — ${details.assets}`;
                break;
            case 'fa_signed':
                message += `${details.playerName} signed by ${details.teamName} for $${details.amount.toLocaleString()}/yr (${details.years} yrs)`;
                break;
            case 'rfa_matched':
                message += `${details.teamName} matched offer for ${details.playerName} ($${details.amount.toLocaleString()}/yr for ${details.years} yrs)`;
                break;
            case 'rfa_walked':
                message += `${details.teamName} let ${details.playerName} walk to ${details.signingTeam}`;
                break;
            case 'draft_pick':
                message += `Pick #${details.pickNum} (${details.teamName}): ${details.playerName}`;
                break;
            case 'team_claimed':
                message += `${details.teamName} claimed by ${details.userName}`;
                break;
            default:
                message += JSON.stringify(details);
        }

        fs.appendFileSync(HISTORY_FILE, message + '\n', 'utf8');
    } catch (error) {
        console.error('Failed to log league history event:', error);
    }
}

module.exports = { logEvent, HISTORY_FILE };

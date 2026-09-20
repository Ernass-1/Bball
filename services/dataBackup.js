const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const crypto = require('node:crypto');
const db = require('../database');
const { getActiveSavePath, validateAndStoreSave } = require('./saveEditor');
const { HISTORY_FILE } = require('./leagueHistory');

const BACKUP_DIR = path.join('/tmp', 'data-backup-clone');
const REPO_URL = `https://${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPO}.git`;
const BRANCH = process.env.DATA_BACKUP_BRANCH || 'bot-data';
const HISTORY_BRANCH = process.env.HISTORY_BRANCH || 'bot-history';
const PUSHED_OFFSET_FILE = path.join(process.cwd(), 'data', '.history_pushed_offset');

function runGit(args, cwd = BACKUP_DIR) {
    return execSync(`git ${args}`, { cwd, stdio: 'pipe' });
}

function restoreFromGitHub() {
    console.log('Starting data restore from GitHub...');
    
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    try {
        // Initialize and fetch
        try {
            runGit('init', BACKUP_DIR);
            runGit(`remote add origin ${REPO_URL}`, BACKUP_DIR);
        } catch (e) {
            // Already initialized
        }
        
        try {
            runGit(`fetch origin ${BRANCH}`, BACKUP_DIR);
            runGit(`checkout ${BRANCH}`, BACKUP_DIR);
        } catch (e) {
            console.log('No existing backup branch found. Starting fresh.');
            return;
        }

        // Restore DB
        const dbPath = path.join(BACKUP_DIR, 'data-export.json');
        if (fs.existsSync(dbPath)) {
            const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            db.importData(data);
            console.log('Database restored successfully.');
        }

        // Restore Save
        const savePath = path.join(BACKUP_DIR, 'active_save.json');
        if (fs.existsSync(savePath)) {
            fs.copyFileSync(savePath, getActiveSavePath());
            console.log('Active save file restored successfully.');
        }
    } catch (error) {
        console.error('Restore failed:', error);
    }
}

function backupToGitHub() {
    console.log('Starting automated backup to GitHub...');
    backupHistoryToGitHub();
    
    try {
        // Ensure local clone is on the backup branch before committing/pushing
        try {
            runGit(`fetch origin ${BRANCH}`, BACKUP_DIR);
            runGit(`checkout -B ${BRANCH} origin/${BRANCH}`, BACKUP_DIR);
        } catch (e) {
            try {
                runGit(`checkout -B ${BRANCH}`, BACKUP_DIR);
            } catch (e2) {}
        }

        // 1. Export DB
        const data = db.getAllData();
        fs.writeFileSync(path.join(BACKUP_DIR, 'data-export.json'), JSON.stringify(data, null, 2));

        // 2. Export Save (with hash check)
        const activeSavePath = getActiveSavePath();
        if (fs.existsSync(activeSavePath)) {
            const currentSave = fs.readFileSync(activeSavePath);
            const currentHash = crypto.createHash('sha256').update(currentSave).digest('hex');
            
            const backupSavePath = path.join(BACKUP_DIR, 'active_save.json');
            let backupHash = '';
            if (fs.existsSync(backupSavePath)) {
                backupHash = crypto.createHash('sha256').update(fs.readFileSync(backupSavePath)).digest('hex');
            }

            if (currentHash !== backupHash) {
                fs.copyFileSync(activeSavePath, backupSavePath);

                // Create snapshot
                const snapshotsDir = path.join(BACKUP_DIR, 'saves');
                if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true });
                
                const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0] + 'Z';
                const snapshotFilename = `active_save_${timestamp}.json`;
                fs.copyFileSync(activeSavePath, path.join(snapshotsDir, snapshotFilename));

                // Prune snapshots
                const retentionCount = parseInt(process.env.SAVE_SNAPSHOT_RETENTION_COUNT, 10) || 20;
                const snapshots = fs.readdirSync(snapshotsDir)
                    .filter(f => f.startsWith('active_save_') && f.endsWith('.json'))
                    .sort();
                
                if (snapshots.length > retentionCount) {
                    const toDelete = snapshots.slice(0, snapshots.length - retentionCount);
                    for (const file of toDelete) {
                        fs.unlinkSync(path.join(snapshotsDir, file));
                    }
                }
            }
        }

        // 3. Commit and Push
        runGit('config user.name "Bot Backup"', BACKUP_DIR);
        runGit('config user.email "bot@example.com"', BACKUP_DIR);
        runGit('add .', BACKUP_DIR);
        
        try {
            runGit('diff-index --quiet HEAD', BACKUP_DIR);
            console.log('No changes to backup.');
        } catch (e) {
            runGit(`commit -m "Automated backup ${new Date().toISOString()}"`, BACKUP_DIR);
            runGit(`push origin HEAD:${BRANCH}`, BACKUP_DIR);
            console.log('bot-data backup pushed to GitHub.');
        }
    } catch (error) {
        console.error('Backup failed:', error);
    }
}

function backupHistoryToGitHub() {
    if (!fs.existsSync(HISTORY_FILE)) return;

    console.log('Checking for league history updates...');
    const currentSize = fs.statSync(HISTORY_FILE).size;
    let lastPushedOffset = 0;
    if (fs.existsSync(PUSHED_OFFSET_FILE)) {
        lastPushedOffset = parseInt(fs.readFileSync(PUSHED_OFFSET_FILE, 'utf8'), 10) || 0;
    }

    if (currentSize <= lastPushedOffset) return;

    try {
        const HISTORY_BACKUP_DIR = path.join('/tmp', 'history-backup-clone');
        if (!fs.existsSync(HISTORY_BACKUP_DIR)) {
            fs.mkdirSync(HISTORY_BACKUP_DIR, { recursive: true });
        }

        if (!fs.existsSync(path.join(HISTORY_BACKUP_DIR, '.git'))) {
            try {
                runGit('init', HISTORY_BACKUP_DIR);
                runGit(`remote add origin ${REPO_URL}`, HISTORY_BACKUP_DIR);
            } catch (e) {}
        }
        
        try {
            runGit(`fetch origin ${HISTORY_BRANCH}`, HISTORY_BACKUP_DIR);
            runGit(`checkout ${HISTORY_BRANCH}`, HISTORY_BACKUP_DIR);
        } catch (e) {
            try {
                runGit(`checkout -b ${HISTORY_BRANCH}`, HISTORY_BACKUP_DIR);
            } catch (e2) {}
        }

        fs.copyFileSync(HISTORY_FILE, path.join(HISTORY_BACKUP_DIR, 'league_history.log'));

        runGit('config user.name "Bot Backup"', HISTORY_BACKUP_DIR);
        runGit('config user.email "bot@example.com"', HISTORY_BACKUP_DIR);
        runGit('add league_history.log', HISTORY_BACKUP_DIR);
        
        try {
            runGit('diff-index --quiet HEAD', HISTORY_BACKUP_DIR);
        } catch (e) {
            runGit(`commit -m "Update league history ${new Date().toISOString()}"`, HISTORY_BACKUP_DIR);
            runGit(`push origin ${HISTORY_BRANCH}`, HISTORY_BACKUP_DIR);
            fs.writeFileSync(PUSHED_OFFSET_FILE, currentSize.toString(), 'utf8');
            console.log('League history pushed to GitHub.');
        }
    } catch (error) {
        console.error('History backup failed:', error);
    }
}

async function listSnapshots() {
    const url = `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/saves?ref=${BRANCH}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}` }
    });

    if (!response.ok) {
        if (response.status === 404) return [];
        throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const files = await response.json();
    return files
        .filter(f => f.name.startsWith('active_save_') && f.name.endsWith('.json'))
        .map(f => ({
            filename: f.name,
            timestamp: f.name.replace('active_save_', '').replace('.json', '').replace(/-/g, ':')
        }))
        .sort((a, b) => b.filename.localeCompare(a.filename));
}

async function restoreSnapshot(filename) {
    const url = `https://raw.githubusercontent.com/${process.env.GITHUB_REPO}/${BRANCH}/saves/${filename}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}` }
    });

    if (!response.ok) throw new Error(`Failed to fetch snapshot: ${response.statusText}`);
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const result = validateAndStoreSave(buffer);
    
    return result;
}

module.exports = { restoreFromGitHub, backupToGitHub, listSnapshots, restoreSnapshot };

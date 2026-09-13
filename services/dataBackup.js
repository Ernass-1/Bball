const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const crypto = require('node:crypto');
const db = require('../database');
const { getActiveSavePath } = require('./saveEditor');

const BACKUP_DIR = path.join('/tmp', 'data-backup-clone');
const REPO_URL = `https://${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPO}.git`;
const BRANCH = process.env.DATA_BACKUP_BRANCH || 'bot-data';

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
    
    try {
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
            runGit(`push origin ${BRANCH}`, BACKUP_DIR);
            console.log('Backup pushed to GitHub.');
        }
    } catch (error) {
        console.error('Backup failed:', error);
    }
}

module.exports = { restoreFromGitHub, backupToGitHub };

const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), 'Documents', 'BetterCanva', 'Data');
const HISTORY_FILE = path.join(DATA_DIR, 'recent_designs.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function logDesign(url, title) {
    if (!url.includes('/design/')) return;
    
    let history = [];
    if (fs.existsSync(HISTORY_FILE)) {
        try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch(e) {}
    }

    // Remove if already exists (to move it to top)
    history = history.filter(d => d.url !== url);
    
    // Add new entry
    history.unshift({
        url,
        title: title.replace(' - Canva', '').trim(),
        timestamp: Date.now()
    });

    // Keep only the 10 most recent
    history = history.slice(0, 10);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function getRecentDesigns() {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch(e) { return []; }
}

module.exports = { logDesign, getRecentDesigns };
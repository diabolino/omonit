// server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const Processor = require('./src/services/processing');
const { initIRCListener, initIRCAnnouncer } = require('./src/services/ircService');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ---------- Static / middleware ----------
app.use(express.static('public'));
app.use(express.json());

// Dossier covers (si tu l'utilises)
app.use('/covers', express.static(path.join(__dirname, 'temp')));

// ---------- Log history (persisté) ----------
const HISTORY_FILE = path.join(__dirname, 'history.json');
const MAX_LOG_HISTORY = 500;
let logHistory = [];

if (fs.existsSync(HISTORY_FILE)) {
    try {
        const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
        logHistory = JSON.parse(raw);
        console.log(`📂 Historique chargé (${logHistory.length} entrées)`);
    } catch (e) {
        console.error('Erreur lecture historique:', e.message);
        logHistory = [];
    }
}

const addToHistory = (logObj) => {
    logHistory.push(logObj);
    if (logHistory.length > MAX_LOG_HISTORY) logHistory.shift();

    fs.writeFile(HISTORY_FILE, JSON.stringify(logHistory, null, 2), (err) => {
        if (err) console.error('Erreur sauvegarde historique:', err.message || err);
    });
};

// ---------- Processor ----------
const processor = new Processor(io);

// Surcharge logger (socket + history)
processor.log = (msg, type = 'info') => {
    const logObj = { message: msg, type, timestamp: new Date().toLocaleTimeString() };
    addToHistory(logObj);
    io.emit('log', logObj);
    console.log(`[${logObj.timestamp}] ${msg}`);
};

// ---------- IRC (READ + WRITE) ----------
const ircAnnouncer = initIRCAnnouncer(processor); // écriture
const ircListener = initIRCListener(processor); // lecture

// ✅ Compatibilité: si Processor a setIrcAnnouncer/setIrcListener on les utilise,
// sinon on fallback sur des propriétés simples.
if (typeof processor.setIrcAnnouncer === 'function') {
    processor.setIrcAnnouncer(ircAnnouncer);
} else {
    processor.ircAnnouncer = ircAnnouncer;
    // beaucoup de projets utilisent processor.irc pour faire say()
    processor.irc = ircAnnouncer;
}

if (typeof processor.setIrcListener === 'function') {
    processor.setIrcListener(ircListener);
} else {
    processor.ircListener = ircListener;
}

// ---------- API ----------
app.get('/api/keywords', (req, res) => {
    try {
        const data = fs.readFileSync('keywords.json', 'utf8');
        res.json(JSON.parse(data));
    } catch (e) {
        res.json([]);
    }
});

app.post('/api/keywords', (req, res) => {
    try {
        const newKeywords = req.body;
        if (!Array.isArray(newKeywords)) {
            return res.status(400).json({ error: 'Format invalide (Array attendu)' });
        }

        fs.writeFileSync('keywords.json', JSON.stringify(newKeywords, null, 2));
        processor.log('Configuration des mots-clés mise à jour.', 'success');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---------- Socket.io ----------
io.on('connection', (socket) => {
    socket.emit('history', logHistory);
});

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Serveur Web lancé sur http://localhost:${PORT}`);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const initIRC = require('./src/services/ircService');
const Processor = require('./src/services/processing');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Fichier de persistance des logs
const HISTORY_FILE = path.join(__dirname, 'history.json');

app.use(express.static('public'));
// Dossier covers accessible
app.use('/covers', express.static(path.join(__dirname, 'temp')));
app.use(express.json());

// --- Gestion des Logs avec Persistance ---
const MAX_LOG_HISTORY = 500; // Augmenté pour garder plus d'historique
let logHistory = [];

// Chargement au démarrage
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

    // Sauvegarde asynchrone pour ne pas bloquer
    fs.writeFile(HISTORY_FILE, JSON.stringify(logHistory, null, 2), (err) => {
        if (err) console.error('Erreur sauvegarde historique:', err);
    });
};

// --- Initialisation des services ---
let ircClient = null;
const processor = new Processor(io, null);

// Surcharge du logger
processor.log = (msg, type = 'info') => {
    const logObj = { message: msg, type, timestamp: new Date().toLocaleTimeString() };
    addToHistory(logObj);
    io.emit('log', logObj);
    console.log(`[${logObj.timestamp}] ${msg}`);
};

ircClient = initIRC(processor);
processor.irc = ircClient;

// --- Routes API ---
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
        if (Array.isArray(newKeywords)) {
            fs.writeFileSync('keywords.json', JSON.stringify(newKeywords, null, 2));
            processor.log('Configuration des mots-clés mise à jour.', 'success');
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Format invalide' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

io.on('connection', (socket) => {
    socket.emit('history', logHistory);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Serveur Web lancé sur http://localhost:${PORT}`);
});

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const initIRC = require('./src/services/ircService');
const Processor = require('./src/services/processing');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

// --- Gestion des Logs avec Buffer (Historique) ---
const MAX_LOG_HISTORY = 100;
let logHistory = [];

const addToHistory = (logObj) => {
    logHistory.push(logObj);
    if (logHistory.length > MAX_LOG_HISTORY) logHistory.shift();
};

// --- Initialisation des services ---
let ircClient = null;
const processor = new Processor(io, null);

// Surcharge de la méthode log pour l'historique
const originalLog = processor.log.bind(processor);
processor.log = (msg, type = 'info') => {
    const logObj = { message: msg, type, timestamp: new Date().toLocaleTimeString() };
    addToHistory(logObj);
    // On émet l'objet complet au lieu juste du message
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
    } catch(e) { res.json([]); }
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
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/status', (req, res) => {
    res.json({
        irc: ircClient && ircClient.connected ? 'online' : 'offline',
        uptime: process.uptime()
    });
});

io.on('connection', (socket) => {
    // Envoyer l'historique au nouveau client
    socket.emit('history', logHistory);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Serveur Web lancé sur http://localhost:${PORT}`);
});
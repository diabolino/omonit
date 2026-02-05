// src/services/ircService.js

const Irc = require('irc-framework');
const fs = require('fs');
const path = require('path');
// IMPORTANT : On importe stripIRCColors
const { MAIN_REGEX, CAT_REGEX, YEAR_REGEX, stripIRCColors } = require('../utils/helpers');

const WATCHED_USERS = ['omgwtfnzb', 'Batman76', 'Batman76-'];

const getKeywords = () => {
    try {
        const data = fs.readFileSync(path.join(__dirname, '../../keywords.json'), 'utf8');
        return JSON.parse(data);
    } catch (e) { return []; }
};

const initIRC = (processor) => {
    const client = new Irc.Client();

    client.connect({
        host: process.env.IRC_HOST,
        port: parseInt(process.env.IRC_PORT),
        nick: process.env.IRC_NICK,
        username: process.env.IRC_USER,
        password: process.env.IRC_PASS,
        encoding: 'utf8',
        auto_reconnect: true,
        auto_reconnect_wait: 4000,
        auto_reconnect_max_retries: 100
    });

    client.on('registered', () => {
        console.log('✅ Connecté au serveur IRC (Session ZNC active)');
        processor.log('Système de surveillance IRC actif.', 'success');
        
        const chans = [
            process.env.IRC_CHAN_HD || '#XXX1080',
            process.env.IRC_CHAN_UHD || '#XXX2160',
            process.env.IRC_CHAN_TRANS || '#XXXGAYTRANS',
            process.env.IRC_CHAN_PORN || '#P0RNL0VER'
        ];
        
        chans.forEach(chan => client.join(chan));
    });

    client.on('message', (event) => {
        if (!WATCHED_USERS.includes(event.nick)) return;

        // 1. NETTOYAGE DU MESSAGE (STRIP COLORS)
        // On enlève gras, couleurs, etc. pour avoir du texte brut pour la Regex
        const cleanMessage = stripIRCColors(event.message);

        // Debug optionnel pour voir ce que voit le bot
        // console.log(`[DEBUG RAW] ${JSON.stringify(event.message)}`);
        // console.log(`[DEBUG CLEAN] ${cleanMessage}`);

        // 2. Parsing Regex sur le message PROPRE
        const match = cleanMessage.match(MAIN_REGEX);

        if (!match) return;

        const category = match[1];
        const releaseName = match[2].trim();
        const yearOrDate = match[3];

        if (!category.match(CAT_REGEX)) return;

        if (!yearOrDate.match(YEAR_REGEX) && !releaseName.match(YEAR_REGEX)) return; 

        const lowerName = releaseName.toLowerCase();
        const isSpecialType = lowerName.includes('clip') || lowerName.includes('p0rnl0v3r');
        const keywords = getKeywords();
        const hasKeyword = keywords.some(kw => lowerName.includes(kw.toLowerCase()));

        if (isSpecialType || hasKeyword) {
            processor.log(`Release détectée: ${releaseName}`, 'info');
            processor.processRelease(releaseName, releaseName, category);
        }
    });

    return client;
};

module.exports = initIRC;
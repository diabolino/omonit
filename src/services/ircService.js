// src/services/ircService.js

const Irc = require('irc-framework');
const fs = require('fs');
const path = require('path');
const { MAIN_REGEX, CAT_REGEX, YEAR_REGEX, stripIRCColors } = require('../utils/helpers');

const WATCHED_USERS = ['omgwtfnzb', 'Batman76', 'Batman76-'];

const getKeywords = () => {
    try {
        const data = fs.readFileSync(path.join(__dirname, '../../keywords.json'), 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

const envInt = (v, fallback) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
};

const stripQuotes = (s) => {
    if (typeof s !== 'string') return s;
    return s.replace(/^["']|["']$/g, '').trim();
};

const uniqueNonEmpty = (arr) => [...new Set(arr.map(stripQuotes).filter(Boolean))];

/**
 * Récupère automatiquement les channels depuis l'env :
 * - tous les IRC_READ_CHAN_*
 * - tous les IRC_WRITE_CHAN_*
 * Fallback si rien trouvé.
 */
const getChannelsFromEnvPrefix = (prefix, fallbackList) => {
    const chans = Object.entries(process.env)
        .filter(([k, v]) => k.startsWith(prefix) && v)
        .map(([, v]) => stripQuotes(v));

    const final = uniqueNonEmpty(chans);
    return final.length ? final : uniqueNonEmpty(fallbackList);
};

/**
 * Client IRC "listener" : se connecte au serveur de lecture et JOIN les chans à surveiller
 */
const initIRCListener = (processor) => {
    const client = new Irc.Client();

    const host = stripQuotes(process.env.IRC_READ_HOST || process.env.IRC_HOST);
    const port = envInt(process.env.IRC_READ_PORT, envInt(process.env.IRC_PORT, 6667));
    const nick = stripQuotes(process.env.IRC_READ_NICK || process.env.IRC_NICK || 'OMG_LISTENER');
    const username = stripQuotes(process.env.IRC_READ_USER || process.env.IRC_USER || nick);
    const password = stripQuotes(process.env.IRC_READ_PASS || process.env.IRC_PASS);

    client.connect({
        host,
        port,
        nick,
        username,
        password,
        encoding: 'utf8',
        auto_reconnect: true,
        auto_reconnect_wait: 4000,
        auto_reconnect_max_retries: 100
    });

    client.on('registered', () => {
        console.log(`✅ IRC LISTENER connecté -> ${host}:${port} (nick: ${nick})`);
        processor.log('Système de surveillance IRC actif (LISTENER).', 'success');

        // Ici: tes IRC_READ_CHAN_ANN etc.
        const chans = getChannelsFromEnvPrefix('IRC_READ_CHAN_', [process.env.IRC_CHAN_HD, process.env.IRC_CHAN_UHD, process.env.IRC_CHAN_TRANS, process.env.IRC_CHAN_PORN]);

        chans.forEach((chan) => client.join(chan));
    });

    client.on('message', (event) => {
        if (!WATCHED_USERS.includes(event.nick)) return;

        const cleanMessage = stripIRCColors(event.message);
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
        const hasKeyword = keywords.some((kw) => lowerName.includes(String(kw).toLowerCase()));

        if (isSpecialType || hasKeyword) {
            processor.log(`Release détectée: ${releaseName}`, 'info');
            processor.processRelease(releaseName, releaseName, category);
        }
    });

    client.on('close', () => processor.log('IRC LISTENER: connexion fermée (reconnect auto).', 'warning'));
    client.on('error', (err) => processor.log(`IRC LISTENER error: ${err?.message || err}`, 'error'));

    return client;
};

/**
 * Client IRC "announcer" : se connecte au serveur d'écriture et JOIN les chans où il devra parler
 */
const initIRCAnnouncer = (processor) => {
    const client = new Irc.Client();

    const host = stripQuotes(process.env.IRC_WRITE_HOST || process.env.IRC_HOST);
    const port = envInt(process.env.IRC_WRITE_PORT, envInt(process.env.IRC_PORT, 6667));
    const nick = stripQuotes(process.env.IRC_WRITE_NICK || process.env.IRC_NICK || 'OMG_ANNOUNCER');
    const username = stripQuotes(process.env.IRC_WRITE_USER || process.env.IRC_USER || nick);
    const password = stripQuotes(process.env.IRC_WRITE_PASS || process.env.IRC_PASS);

    client.connect({
        host,
        port,
        nick,
        username,
        password,
        encoding: 'utf8',
        auto_reconnect: true,
        auto_reconnect_wait: 4000,
        auto_reconnect_max_retries: 100
    });

    client.on('registered', () => {
        console.log(`✅ IRC ANNOUNCER connecté -> ${host}:${port} (nick: ${nick})`);
        processor.log('Système d’annonces IRC actif (ANNOUNCER).', 'success');

        const stripQuotes = (s) => (typeof s === 'string' ? s.replace(/^["']|["']$/g, '').trim() : s);

        // ✅ Un seul chan d'annonce
        const announceChan = stripQuotes(process.env.IRC_WRITE_CHAN_XXX || '#P0RNL0V3R');

        // Optionnel : join (utile si ZNC ne le fait pas via autojoin)
        client.join(announceChan);

        // ✅ Message de validation au démarrage
        setTimeout(() => {
            const msg = `✅ ${nick} est en ligne — announcer OK (${new Date().toLocaleString('fr-FR')})`;
            client.say(announceChan, msg);
            processor.log(`Message "bot en ligne" envoyé sur ${announceChan}`, 'success');
        }, 1200);
    });

    client.on('close', () => processor.log('IRC ANNOUNCER: connexion fermée (reconnect auto).', 'warning'));
    client.on('error', (err) => processor.log(`IRC ANNOUNCER error: ${err?.message || err}`, 'error'));

    return client;
};

module.exports = { initIRCListener, initIRCAnnouncer };

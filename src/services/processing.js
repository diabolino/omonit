const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const zlib = require('zlib');
const FormData = require('form-data');
const { pipeline } = require('stream/promises');
const db = require('../config/database');
const { IRC_COLORS } = require('../utils/helpers');
require('dotenv').config();

// Dossiers de travail
const WORK_DIR = path.join(__dirname, '../../temp');
const NZB_DIR = process.env.NZB_OUTPUT_DIR || path.join(process.env.HOME || '.', '.config/NZBGet/nzb');

fs.ensureDirSync(WORK_DIR);
fs.ensureDirSync(NZB_DIR);

class Processor {
    constructor(io, ircClient) {
        this.io = io;
        this.irc = ircClient;
    }

    log(msg, type = 'info') {
        const logMsg = `[${new Date().toLocaleTimeString()}] ${msg}`;
        console.log(logMsg);
        if (this.io) this.io.emit('log', { message: logMsg, type });
    }

    // Ajout de 'category' qui est passé depuis ircService
    async processRelease(directoryName, rawName, category) {
        this.log(`Traitement démarré pour: ${directoryName} [${category}]`, 'info');

        try {
            // 1. Récupération XML
            const xmlUrl = `https://api.omgwtfnzbs.org/xml/?search=${directoryName}&user=${process.env.OMG_USER}&api=${process.env.OMG_API_KEY}&pw=0,1`;
            const xmlResponse = await axios.get(xmlUrl, { responseType: 'text' });
            const xmlData = xmlResponse.data;

            // 2. Extraction liens
            const imgMatch = xmlData.match(/https:\/\/i\.omgwtfnzbs\.org\/pr0n\/[0-9a-z_\/]+\.jpg/);
            const nzbMatch = xmlData.match(/https:\/\/api\.omgwtfnzbs\.org\/nzb\/\?id=[^<"]+/);
            
            const imgUrl = imgMatch ? imgMatch[0] : null;
            let nzbUrl = nzbMatch ? nzbMatch[0].replace(/&amp;/g, '&') : null;

            if (!imgUrl) throw new Error("Image non trouvée dans le XML");

            // 3. Annonce IRC avec le routage par catégorie
            // IMPORTANT : On passe la category ici
            this.announceToIRC(directoryName, imgUrl, category);

            // 4. Téléchargement Image
            const imgPath = path.join(WORK_DIR, `${directoryName}.jpg`);
            await this.downloadFile(imgUrl, imgPath);
            this.log(`Image téléchargée: ${imgPath}`, 'success');

            // --- Logique Spécifique ---
            const isClip = directoryName.toUpperCase().includes('CLIP');
            const isPornLover = directoryName.toUpperCase().includes('P0RNL0V3R');

            if (isPornLover) {
                this.log(`Fin traitement P0RNL0V3R pour ${directoryName}`, 'success');
                return; 
            }

            if (!nzbUrl) throw new Error("NZB URL non trouvée");

            // 5. Gestion NZB
            const nzbPathFinal = path.join(NZB_DIR, `${directoryName}.nzb`);
            const nzbPathTemp = path.join(WORK_DIR, `${directoryName}.nzb`);

            await this.downloadFile(nzbUrl, nzbPathTemp, true); 
            await fs.copy(nzbPathTemp, nzbPathFinal);
            this.log(`NZB copié vers ${nzbPathFinal}`, 'success');

            // 6. Upload UNFR
            let skipUpload = false;
            let finalName = this.extractFinalName(directoryName);

            if (!isClip) {
                const [rows] = await db.query("SELECT COUNT(ID) as count FROM ODAY WHERE NAME LIKE ?", [`%${finalName}%`]);
                if (rows[0].count > 0) {
                    this.log(`Doublon détecté en DB pour ${finalName}, Upload annulé.`, 'warning');
                    skipUpload = true;
                }
            }

            if (!skipUpload) {
                await this.uploadToUnfr(directoryName, nzbPathTemp);
            }

            // 7. Insert DB
            if (!isClip) {
                await db.query("INSERT INTO ODAY (NAME, LINK, STATUS) VALUES(?, 'OMG', '9')", [finalName]);
                this.log(`Inséré en base de données: ${finalName}`, 'success');
            }

        } catch (error) {
            this.log(`Erreur process: ${error.message}`, 'error');
            console.error(error);
        }
    }

    // Nouvelle signature avec category
    announceToIRC(release, url, category) {
        const { BOLD, LIGHT_BLUE, NORMAL, ORANGE, RED, YELLOW, PINK, GREEN } = IRC_COLORS;
        
        let targetChan = "";
        let message = "";

        // --- ROUTAGE PAR CATEGORIE ---
        
        // Nettoyage de la catégorie pour la comparaison (par sécurité)
        const catClean = category.toUpperCase();

        if (catClean.includes("UHD-CLIPS")) {
            targetChan = process.env.IRC_CHAN_UHD || "#XXX2160";
            // Style UHD
            message = `${BOLD}${PINK}${release}${NORMAL} => ${BOLD}${GREEN}${url}${NORMAL}${BOLD}`;

        } else if (catClean.includes("TRANS")) {
            targetChan = process.env.IRC_CHAN_TRANS || "#XXXGAYTRANS";
            // Style Trans
            message = `${BOLD}${LIGHT_BLUE}${release}${NORMAL} => ${BOLD}${ORANGE}${url}${NORMAL}${BOLD}`;

        } else if (catClean.includes("HD-CLIPS")) {
            targetChan = process.env.IRC_CHAN_HD || "#XXX1080";
            // Style HD Classique
            message = `${BOLD}${RED}${release}${NORMAL} => ${BOLD}${YELLOW}${url}${NORMAL}${BOLD}`;

        } else {
            // Fallback si la catégorie n'est pas reconnue (ex: P0RNL0V3R spécifique ou autre)
             if (release.match(/P0RNL0V3R/i)) {
                targetChan = process.env.IRC_CHAN_PORN || "#P0RNL0VER";
            } else {
                targetChan = process.env.IRC_CHAN_HD || "#XXX1080";
            }
            message = `${BOLD}${RED}${release}${NORMAL} => ${BOLD}${YELLOW}${url}${NORMAL}${BOLD}`;
        }

        console.log(`[DEBUG] Envoi IRC -> Cat: [${category}] -> Canal: "${targetChan}"`);

        if (this.irc && targetChan) {
            this.irc.say(targetChan, message);
            this.log(`Annonce IRC envoyée sur ${targetChan} (Cat: ${category})`, 'info');
        } else {
            this.log(`ERREUR IRC: Canal cible inconnu pour ${release}`, 'error');
        }
    }

    async downloadFile(url, destPath, tryGzip = false) {
        try {
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream',
                headers: tryGzip ? { 'Accept-Encoding': 'gzip' } : {}
            });

            const serverSentGzip = response.headers['content-encoding'] === 'gzip';
            const writer = fs.createWriteStream(destPath);

            if (tryGzip && serverSentGzip) {
                const gunzip = zlib.createGunzip();
                await pipeline(response.data, gunzip, writer);
            } else {
                await pipeline(response.data, writer);
            }
        } catch (err) {
            throw new Error(`Download failed (${url}): ${err.message}`);
        }
    }

    async uploadToUnfr(releaseName, nzbPath) {
        try {
            const form = new FormData();
            form.append('rlsname', releaseName);
            form.append('nzb', fs.createReadStream(nzbPath));
            form.append('upload', 'upload');
            const uploadUrl = `${process.env.UPLOAD_API_URL}?apikey=${process.env.UPLOAD_API_KEY}`;
            
            await axios.post(uploadUrl, form, {
                headers: { ...form.getHeaders() },
                timeout: 60000 
            });
            this.log(`Upload UNFR réussi pour ${releaseName}`, 'success');
        } catch (e) {
            this.log(`Erreur Upload UNFR: ${e.message}`, 'error');
        }
    }

    extractFinalName(directory) {
        let name = directory
            .replace(/_SD/g, '')
            .replace(/\.720p/g, '')
            .replace(/\.1080p/g, '')
            .replace(/\.2160p/g, '');
        return name.split('.XXX')[0];
    }
}

module.exports = Processor;
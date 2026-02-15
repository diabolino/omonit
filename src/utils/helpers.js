// src/utils/helpers.js

const CTRL = {
    BOLD: '\x02',
    COLOR: '\x03',
    NORMAL: '\x0f',
    ITALIC: '\x1d',
    UNDERLINE: '\x1f'
};

const IRC_COLORS = {
    BOLD: CTRL.BOLD,
    NORMAL: CTRL.NORMAL,
    WHITE: `${CTRL.COLOR}00`,
    BLACK: `${CTRL.COLOR}01`,
    BLUE: `${CTRL.COLOR}02`,
    GREEN: `${CTRL.COLOR}03`,
    RED: `${CTRL.COLOR}04`,
    BROWN: `${CTRL.COLOR}05`,
    PURPLE: `${CTRL.COLOR}06`,
    ORANGE: `${CTRL.COLOR}07`,
    YELLOW: `${CTRL.COLOR}08`,
    LIGHT_GREEN: `${CTRL.COLOR}09`,
    CYAN: `${CTRL.COLOR}10`,
    LIGHT_BLUE: `${CTRL.COLOR}11`,
    PINK: `${CTRL.COLOR}13`,
    GREY: `${CTRL.COLOR}14`,
    LIGHT_GREY: `${CTRL.COLOR}15`
};

// On ajoute (?:\s*\[.*?\])? entre la taille (groupe 4) et l'ID (groupe 5)
// Cela signifie : "Il peut y avoir un bloc [...] ici, mais on ne le capture pas, et s'il n'est pas là, c'est pas grave."
const MAIN_REGEX = /(?:\[|^)\s*(.*?)\s*\]\s*\[\s*(.*?\.(\d{2}|\d{4}|E\d+)\..*?)\s*\]\s*\[\s*(.*?)\s*\](?:\s*\[.*?\])?\s*\[\s*(.*?)\s*\]/;
const CAT_REGEX = /XXX: (HD-CLIPS|UHD-CLIPS|TRANS)/;
const YEAR_REGEX = /(2021|2022|2023|2024|2025|2026|20|21|22|23|24|25|26)/;

// Fonction de nettoyage des codes IRC
const stripIRCColors = (msg) => {
    if (!msg) return '';
    // Regex robuste pour retirer couleurs (\x03), gras, italique, souligné, reset
    return msg.replace(/\x03\d{0,2}(,\d{1,2})?|[\x02\x0f\x16\x1d\x1f]/g, '');
};

module.exports = { IRC_COLORS, MAIN_REGEX, CAT_REGEX, YEAR_REGEX, stripIRCColors };

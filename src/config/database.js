const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Vérification de la connexion au démarrage
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connecté à la base de données MySQL');
        connection.release();
    } catch (err) {
        console.error('❌ Erreur de connexion DB:', err.message);
    }
})();

module.exports = pool;

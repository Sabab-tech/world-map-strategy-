import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_PATH = path.join(__dirname, 'index.html');
const HEALTH_LOGO_SCRIPT = '<script src="/health-ministry-logo.js"></script>';

const app = express();
const PORT = 3000;

app.use(express.static(__dirname, { index: false }));

app.get('*', (req, res, next) => {
    fs.readFile(INDEX_PATH, 'utf8', (err, html) => {
        if (err) return next(err);
        const output = html.includes('/health-ministry-logo.js')
            ? html
            : html.replace('</body>', `    ${HEALTH_LOGO_SCRIPT}\n</body>`);
        res.type('html').send(output);
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});

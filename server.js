require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

function parseThaiDate(dateStr) {
    const [datePart, timePart] = dateStr.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour - 7, minute, second));
}

function getThaiTimeString(date = new Date()) {
    const thaiOffset = 7 * 60 * 60 * 1000;
    const thaiTime = new Date(date.getTime() + thaiOffset);
    return thaiTime.toISOString().substring(11, 19);
}

const ELECTION_START = parseThaiDate(process.env.StartDate);
const ELECTION_END = parseThaiDate(process.env.EndDate);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

app.get('/api/status', (req, res) => {
    const now = new Date();
    res.json({
        now: getThaiTimeString(now),
        start: getThaiTimeString(ELECTION_START),
        end: getThaiTimeString(ELECTION_END),
        isOpen: now >= ELECTION_START && now <= ELECTION_END
    });
});

app.get('/api/candidates', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, policy_text, image_url FROM candidates ORDER BY id ASC'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).send('Database Error');
    }
});

app.post('/api/vote', async (req, res) => {
    const { candidateId, username } = req.body;
    const now = new Date();

    if (now < ELECTION_START || now > ELECTION_END) {
        return res.status(403).json({
            success: false,
            message: 'ไม่อยู่ในช่วงเวลาเลือกตั้ง'
        });
    }

    if (!username || username.trim() === "") {
        return res.status(400).json({
            success: false,
            message: 'กรุณากรอกชื่อผู้ใช้งาน'
        });
    }

    try {
        const checkVoter = await pool.query(
            'SELECT id FROM voters WHERE username = $1',
            [username]
        );

        if (checkVoter.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'ชื่อผู้ใช้งานนี้เคยลงคะแนนไปแล้ว'
            });
        }

        await pool.query('BEGIN');

        await pool.query(
            'INSERT INTO voters (username, candidate_id) VALUES ($1, $2)',
            [username, candidateId]
        );

        await pool.query(
            'UPDATE candidates SET vote_count = vote_count + 1 WHERE id = $1',
            [candidateId]
        );

        await pool.query('COMMIT');

        res.json({
            success: true,
            message: 'ลงคะแนนสำเร็จ'
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล'
        });
    }
});

app.post('/api/roblox-vote', async (req, res) => {
    const { candidateId, username } = req.body;
    const now = new Date();
    const nowTimeString = getThaiTimeString(now);

    try {
        if (now < ELECTION_START || now > ELECTION_END) {
            return res.status(403).json({
                success: false,
                message: nowTimeString
            });
        }

        const checkVoter = await pool.query(
            'SELECT id FROM voters WHERE username = $1',
            [username]
        );

        if (checkVoter.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: nowTimeString
            });
        }

        await pool.query('BEGIN');

        await pool.query(
            'INSERT INTO voters (username, candidate_id) VALUES ($1, $2)',
            [username, candidateId]
        );

        await pool.query(
            'UPDATE candidates SET vote_count = vote_count + 1 WHERE id = $1',
            [candidateId]
        );

        await pool.query('COMMIT');

        res.json({
            success: true,
            message: nowTimeString
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({
            success: false,
            message: nowTimeString
        });
    }
});

app.get('/', (req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.get('/home', (req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.get('/policy', (req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'policy.html'))
);

app.get('/election', (req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'election.html'))
);

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

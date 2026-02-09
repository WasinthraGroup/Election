require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const ELECTION_START = new Date(process.env.StartDate).getTime(); 
const ELECTION_END = new Date(process.env.EndDate).getTime();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); 

app.get('/api/status', (req, res) => {
    const now = new Date().getTime();
    res.json({
        now: now,
        start: ELECTION_START,
        end: ELECTION_END,
        isOpen: now >= ELECTION_START && now <= ELECTION_END
    });
});

app.get('/api/candidates', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, policy_text, image_url FROM candidates ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Database Error');
    }
});

app.post('/api/vote', async (req, res) => {
    const { candidateId, username } = req.body; 
    const now = new Date().getTime();

    if (now < ELECTION_START || now > ELECTION_END) {
        return res.status(403).json({ success: false, message: 'ไม่อยู่ในช่วงเวลาเลือกตั้ง' });
    }

    if (!username || username.trim() === "") {
        return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้งาน' });
    }

    try {
        const checkVoter = await pool.query('SELECT id FROM voters WHERE username = $1', [username]);
        if (checkVoter.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้งานนี้เคยลงคะแนนไปแล้ว' });
        }

        await pool.query('BEGIN');
        await pool.query('INSERT INTO voters (username) VALUES ($1)', [username]);
        await pool.query('UPDATE candidates SET vote_count = vote_count + 1 WHERE id = $1', [candidateId]);
        await pool.query('COMMIT');

        res.json({ success: true, message: 'ลงคะแนนสำเร็จ' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล' });
    }
});

app.post('/api/roblox-vote', async (req, res) => {
    const { candidateId, username } = req.body;
    try {
        const checkVoter = await pool.query('SELECT id FROM voters WHERE username = $1', [username]);
        if (checkVoter.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Already Voted' });
        }

        await pool.query('BEGIN');
        await pool.query('INSERT INTO voters (username) VALUES ($1)', [username]);
        await pool.query('UPDATE candidates SET vote_count = vote_count + 1 WHERE id = $1', [candidateId]);
        await pool.query('COMMIT');

        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ success: false });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/policy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'policy.html')));
app.get('/election', (req, res) => res.sendFile(path.join(__dirname, 'public', 'election.html')));

app.listen(port, () => {
    console.log(`Server running on port ${port}`);

});






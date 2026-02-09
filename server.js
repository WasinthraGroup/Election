require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// --- ตั้งค่าเวลาเลือกตั้ง (แก้ไขที่นี่) ---
// ตัวอย่าง: เปิดเลือกตั้ง 14 กุมภาพันธ์ 2026 เวลา 08:00
const ELECTION_START = new Date('2026-02-09T08:00:00').getTime(); 
const ELECTION_END = new Date('2026-02-10T17:00:00').getTime();

// เชื่อมต่อ Database
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // ให้เข้าถึงไฟล์ HTML ในโฟลเดอร์ public

// API: ดึงสถานะและเวลา
app.get('/api/status', (req, res) => {
    const now = new Date().getTime();
    res.json({
        now: now,
        start: ELECTION_START,
        end: ELECTION_END,
        isOpen: now >= ELECTION_START && now <= ELECTION_END
    });
});

// API: ดึงข้อมูลผู้สมัคร
app.get('/api/candidates', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, policy_text, image_url FROM candidates ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Database Error');
    }
});

// API: ลงคะแนน
app.post('/api/vote', async (req, res) => {
    const { candidateId, username } = req.body; // รับ username มาด้วย
    const now = new Date().getTime();

    // 1. เช็คเวลา
    if (now < ELECTION_START || now > ELECTION_END) {
        return res.status(403).json({ success: false, message: 'ไม่อยู่ในช่วงเวลาเลือกตั้ง' });
    }

    // 2. เช็คว่ากรอกชื่อมาไหม
    if (!username || username.trim() === "") {
        return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้งาน' });
    }

    try {
        // 3. เช็คว่าชื่อนี้โหวตไปหรือยัง (ใช้ UNIQUE constraint ใน DB ช่วยเช็ค)
        const checkVoter = await pool.query('SELECT id FROM voters WHERE username = $1', [username]);
        if (checkVoter.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้งานนี้เคยลงคะแนนไปแล้ว' });
        }

        // เริ่มต้น Transaction (เพื่อความแม่นยำ)
        await pool.query('BEGIN');
        // เพิ่มชื่อลงในรายชื่อผู้โหวต
        await pool.query('INSERT INTO voters (username) VALUES ($1)', [username]);
        // อัปเดตคะแนน
        await pool.query('UPDATE candidates SET vote_count = vote_count + 1 WHERE id = $1', [candidateId]);
        await pool.query('COMMIT');

        res.json({ success: true, message: 'ลงคะแนนสำเร็จ' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล' });
    }
});

// Routing หน้าเว็บ
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/policy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'policy.html')));
app.get('/election', (req, res) => res.sendFile(path.join(__dirname, 'public', 'election.html')));

app.listen(port, () => {
    console.log(`Server running on port ${port}`);

});



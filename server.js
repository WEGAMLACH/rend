/**
 * server.js — misegesait (R&DMESEGE)
 * Express + PostgreSQL + WebSocket
 * Деплой: Render.com + Render Postgres
 */

const express    = require('express');
const http       = require('http');
const WebSocket  = require('ws');
const { Pool }   = require('pg');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path       = require('path');
const cors       = require('cors');

/* ====================================================
   КОНФИГУРАЦИЯ
   ==================================================== */
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'misegesait_secret_change_in_prod_' + Math.random();

// DATABASE_URL автоматически устанавливается Render при подключении Postgres
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL не задан! Добавьте переменную окружения.');
  process.exit(1);
}

/* ====================================================
   БАЗА ДАННЫХ
   ==================================================== */
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false } // обязательно для Render Postgres
});

/** Создание таблиц при первом запуске */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        VARCHAR(64)  NOT NULL,
      username    VARCHAR(32)  UNIQUE NOT NULL,
      password    VARCHAR(128) NOT NULL,
      created_at  TIMESTAMPTZ  DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_user   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text        TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_messages_pair
      ON messages (from_user, to_user);

    CREATE INDEX IF NOT EXISTS idx_messages_ts
      ON messages (created_at);
  `);
  console.log('✅ БД инициализирована');
}

/* ====================================================
   EXPRESS
   ==================================================== */
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* --- Middleware: проверка JWT --- */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Токен недействителен' });
  }
}

/* ====================================================
   API — AUTH
   ==================================================== */

/** POST /api/register */
app.post('/api/register', async (req, res) => {
  const { name, username, password } = req.body || {};

  if (!name?.trim() || !username?.trim() || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: 'Логин: минимум 3 символа' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Логин: только латиница, цифры, _' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Пароль: минимум 4 символа' });
  }

  try {
    const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'Логин уже занят' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, username, password) VALUES ($1, $2, $3) RETURNING id, name, username',
      [name.trim(), username.trim(), hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, username: user.username } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/** POST /api/login */
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Пользователь не найден' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Неверный пароль' });

    const token = jwt.sign({ id: user.id, username: user.username, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, username: user.username } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ====================================================
   API — ПОЛЬЗОВАТЕЛИ
   ==================================================== */

/** GET /api/users — все пользователи кроме текущего */
app.get('/api/users', authMiddleware, async (req, res) => {
  const q = req.query.q || '';
  try {
    const result = await pool.query(
      `SELECT id, name, username FROM users
       WHERE id != $1
         AND (name ILIKE $2 OR username ILIKE $2)
       ORDER BY name`,
      [req.user.id, `%${q}%`]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/** GET /api/dialogs — список диалогов */
app.get('/api/dialogs', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (partner_id)
        partner_id,
        partner_name,
        partner_username,
        last_text,
        last_ts
      FROM (
        SELECT
          CASE WHEN m.from_user = $1 THEN m.to_user   ELSE m.from_user   END AS partner_id,
          CASE WHEN m.from_user = $1 THEN u2.name     ELSE u1.name       END AS partner_name,
          CASE WHEN m.from_user = $1 THEN u2.username ELSE u1.username   END AS partner_username,
          m.text  AS last_text,
          m.created_at AS last_ts
        FROM messages m
        JOIN users u1 ON u1.id = m.from_user
        JOIN users u2 ON u2.id = m.to_user
        WHERE m.from_user = $1 OR m.to_user = $1
        ORDER BY m.created_at DESC
      ) sub
      ORDER BY partner_id, last_ts DESC
    `, [req.user.id]);

    // Сортируем по времени последнего сообщения
    const rows = result.rows.sort((a, b) => new Date(b.last_ts) - new Date(a.last_ts));
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ====================================================
   API — СООБЩЕНИЯ
   ==================================================== */

/** GET /api/messages/:partnerId — история переписки */
app.get('/api/messages/:partnerId', authMiddleware, async (req, res) => {
  const { partnerId } = req.params;
  const since = req.query.since || '1970-01-01'; // для инкрементального обновления

  try {
    const result = await pool.query(`
      SELECT m.id, m.from_user, m.to_user, m.text,
             m.created_at AS ts,
             u.name AS from_name
      FROM messages m
      JOIN users u ON u.id = m.from_user
      WHERE ((m.from_user = $1 AND m.to_user = $2)
          OR (m.from_user = $2 AND m.to_user = $1))
        AND m.created_at > $3
      ORDER BY m.created_at ASC
      LIMIT 200
    `, [req.user.id, partnerId, since]);

    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/** POST /api/messages — отправить сообщение */
app.post('/api/messages', authMiddleware, async (req, res) => {
  const { toUser, text } = req.body || {};
  if (!toUser || !text?.trim()) {
    return res.status(400).json({ error: 'Нет получателя или текста' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO messages (from_user, to_user, text)
       VALUES ($1, $2, $3)
       RETURNING id, from_user, to_user, text, created_at AS ts`,
      [req.user.id, toUser, text.trim()]
    );
    const msg = result.rows[0];

    // Рассылаем через WebSocket всем подключённым участникам диалога
    broadcastMessage(msg);

    res.json(msg);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ====================================================
   WEBSOCKET — реальное время
   ==================================================== */
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// Map: userId -> Set<WebSocket>
const clients = new Map();

wss.on('connection', (ws, req) => {
  let userId = null;

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);

      // Аутентификация по токену при подключении
      if (data.type === 'auth') {
        try {
          const payload = jwt.verify(data.token, JWT_SECRET);
          userId = payload.id;
          if (!clients.has(userId)) clients.set(userId, new Set());
          clients.get(userId).add(ws);
          ws.send(JSON.stringify({ type: 'auth_ok' }));
        } catch {
          ws.send(JSON.stringify({ type: 'auth_err' }));
        }
      }
    } catch {}
  });

  ws.on('close', () => {
    if (userId && clients.has(userId)) {
      clients.get(userId).delete(ws);
      if (clients.get(userId).size === 0) clients.delete(userId);
    }
  });
});

/** Отправить сообщение обоим участникам через WS */
function broadcastMessage(msg) {
  const payload = JSON.stringify({ type: 'message', msg });
  for (const uid of [msg.from_user, msg.to_user]) {
    const sockets = clients.get(uid);
    if (sockets) {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  }
}

/* ====================================================
   SPA — все остальные пути → index.html
   ==================================================== */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ====================================================
   ЗАПУСК
   ==================================================== */
initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 misegesait запущен на порту ${PORT}`);
  });
}).catch(err => {
  console.error('❌ Ошибка инициализации БД:', err);
  process.exit(1);
});

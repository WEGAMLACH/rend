# misegesait — R&DMESEGE
### Деплой на Render.com + PostgreSQL

---

## 📁 Структура проекта

```
misegesait-render/
├── server.js          — Node.js сервер (Express + WebSocket + PostgreSQL)
├── package.json       — зависимости
├── render.yaml        — конфигурация Render (IaC)
├── .gitignore
└── public/
    ├── index.html     — SPA-интерфейс
    ├── style.css      — стили (две темы)
    └── script.js      — фронтенд (API + WebSocket)
```

---

## 🚀 Деплой на Render.com — пошаговая инструкция

### Шаг 1: Загрузить код на GitHub

```bash
# Инициализировать git-репозиторий
cd misegesait-render
git init
git add .
git commit -m "initial commit"

# Создайте репозиторий на https://github.com/new (например: misegesait)
git remote add origin https://github.com/ВАШ_ЛОГИН/misegesait.git
git branch -M main
git push -u origin main
```

### Шаг 2: Зарегистрироваться на Render

Перейдите на https://render.com и войдите через GitHub.

### Шаг 3: Создать PostgreSQL базу данных

1. Dashboard → **New +** → **PostgreSQL**
2. Заполните:
   - **Name:** `misegesait-db`
   - **Database:** `misegesait`
   - **User:** `misegesait_user`
   - **Region:** Frankfurt (EU) или ближайший
   - **Plan:** **Free**
3. Нажмите **Create Database**
4. Подождите ~1 мин, скопируйте **Internal Database URL** — понадобится на следующем шаге

### Шаг 4: Создать Web Service

1. Dashboard → **New +** → **Web Service**
2. Подключите ваш GitHub-репозиторий
3. Настройки:
   - **Name:** `misegesait`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** **Free**

4. В разделе **Environment Variables** добавьте:

   | Ключ | Значение |
   |------|----------|
   | `DATABASE_URL` | (Internal Database URL из Шага 3) |
   | `JWT_SECRET` | любая длинная случайная строка |
   | `NODE_ENV` | `production` |

5. Нажмите **Create Web Service**

### Шаг 5: Готово! 🎉

Через 2–3 минуты сайт будет доступен по адресу:
`https://misegesait.onrender.com`

> ⚠️ **Бесплатный тариф Render:** сервис "засыпает" после 15 мин неактивности.
> Первый запрос после сна занимает ~30 сек. Это нормально для бесплатного тарифа.

---

## ⚡ Альтернатива: автодеплой через render.yaml

Если в корне репозитория есть `render.yaml`, Render может создать
всё автоматически:

1. Dashboard → **New +** → **Blueprint**
2. Выберите репозиторий
3. Render прочитает `render.yaml` и создаст и базу, и сервис

---

## 💻 Локальный запуск

### 1. Установить зависимости
```bash
npm install
```

### 2. Создать файл `.env`
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/misegesait
JWT_SECRET=my_local_secret_123
PORT=3000
```

### 3. Локальный PostgreSQL (если нет — используйте Render DB)
```bash
# macOS
brew install postgresql && brew services start postgresql
createdb misegesait

# Ubuntu
sudo apt install postgresql
sudo -u postgres createdb misegesait
```

Или используйте облачный Render Postgres бесплатно —
просто скопируйте **External Database URL** в `.env`.

### 4. Запуск
```bash
npm start
# Открыть: http://localhost:3000
```

---

## 🔧 Переменные окружения

| Переменная | Описание | Обязательна |
|-----------|----------|-------------|
| `DATABASE_URL` | Connection string PostgreSQL | ✅ |
| `JWT_SECRET` | Секрет для подписи токенов | ✅ |
| `PORT` | Порт сервера (Render ставит сам) | ❌ |
| `NODE_ENV` | `production` / `development` | ❌ |

---

## 📡 API Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/register` | Регистрация |
| POST | `/api/login` | Вход |
| GET | `/api/users?q=` | Список пользователей |
| GET | `/api/dialogs` | Мои диалоги |
| GET | `/api/messages/:id` | История чата |
| POST | `/api/messages` | Отправить сообщение |
| WS | `wss://...` | Реальное время |

---

## 🛠️ Стек

| Компонент | Технология |
|-----------|-----------|
| Сервер | Node.js + Express |
| База данных | PostgreSQL (Render Postgres) |
| Реальное время | WebSocket (ws) |
| Аутентификация | JWT + bcrypt |
| Хостинг | Render.com (Free tier) |
| Фронтенд | Vanilla JS + CSS |

---

**R&DMESEGE · misegesait**

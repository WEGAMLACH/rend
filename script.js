/**
 * script.js — misegesait (R&DMESEGE)
 * Основная логика приложения.
 * Состояние, навигация, чат, темы, поиск.
 */

/* =====================================================
   СОСТОЯНИЕ ПРИЛОЖЕНИЯ
   ===================================================== */
const App = {
  currentUser: null,      // объект текущего пользователя
  activeChatId: null,     // id собеседника активного чата
  activeChatName: null,   // имя собеседника
  sideTab: 'chats',       // 'chats' | 'users'
  pollingInterval: null,  // интервал обновления сообщений
  theme: 'modern',        // 'modern' | 'google'
  lastMsgCount: 0         // для определения новых сообщений
};

/* =====================================================
   ИНИЦИАЛИЗАЦИЯ
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // Восстановить тему из localStorage
  const savedTheme = localStorage.getItem('msgt_theme') || 'modern';
  applyTheme(savedTheme, false);

  // Проверить активную сессию
  const user = DB.getCurrentUser();
  if (user) {
    App.currentUser = user;
    showMainScreen();
  } else {
    showAuthScreen();
  }
});

/* =====================================================
   НАВИГАЦИЯ МЕЖДУ ЭКРАНАМИ
   ===================================================== */
function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('main-screen').classList.add('hidden');
  stopPolling();
}

function showMainScreen() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('main-screen').classList.remove('hidden');

  // Заполнить профиль
  const avatar = document.getElementById('current-avatar');
  const dispName = document.getElementById('current-display-name');
  const username = document.getElementById('current-username');

  avatar.textContent = App.currentUser.name[0].toUpperCase();
  dispName.textContent = App.currentUser.name;
  username.textContent = '@' + App.currentUser.username;

  // Загрузить чаты
  renderDialogs();

  // Запустить опрос (псевдо-реальное время — каждые 2 сек)
  startPolling();
}

/* =====================================================
   АВТОРИЗАЦИЯ
   ===================================================== */

/** Переключение вкладок login/register */
function switchTab(tab) {
  document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('login-error').textContent = '';
  document.getElementById('reg-error').textContent = '';
}

function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');

  if (!username || !password) {
    errEl.textContent = 'Введите логин и пароль';
    return;
  }

  const result = DB.loginUser(username, password);
  if (!result.ok) {
    errEl.textContent = result.error;
    return;
  }

  App.currentUser = result.user;
  showMainScreen();
}

function doRegister() {
  const name = document.getElementById('reg-name').value;
  const username = document.getElementById('reg-username').value;
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('reg-error');

  const result = DB.registerUser(name, username, password);
  if (!result.ok) {
    errEl.textContent = result.error;
    return;
  }

  // Авто-войти после регистрации
  DB.loginUser(username, password);
  App.currentUser = result.user;
  showToast('Добро пожаловать, ' + result.user.name + '!');
  showMainScreen();
}

function doLogout() {
  DB.logout();
  App.currentUser = null;
  App.activeChatId = null;
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  showAuthScreen();
}

/* =====================================================
   SIDEBAR — ДИАЛОГИ И ПОЛЬЗОВАТЕЛИ
   ===================================================== */

function showSideTab(tab) {
  App.sideTab = tab;
  document.getElementById('stab-chats').classList.toggle('active', tab === 'chats');
  document.getElementById('stab-users').classList.toggle('active', tab === 'users');
  document.getElementById('chats-list').classList.toggle('hidden', tab !== 'chats');
  document.getElementById('users-list').classList.toggle('hidden', tab !== 'users');

  if (tab === 'users') renderUsersList();
  else renderDialogs();
}

/** Рендер списка диалогов */
function renderDialogs() {
  const container = document.getElementById('chats-list');
  const dialogs = DB.getDialogs(App.currentUser.id);

  if (dialogs.length === 0) {
    container.innerHTML = '<div class="empty-list">Нет диалогов.<br>Перейдите во вкладку «Люди»</div>';
    return;
  }

  container.innerHTML = dialogs.map(d => `
    <div class="contact-item ${App.activeChatId === d.partnerId ? 'active' : ''}"
         onclick="openChat('${d.partnerId}', '${escHtml(d.partnerName)}')">
      <div class="contact-avatar">${d.partnerName[0].toUpperCase()}</div>
      <div class="contact-info">
        <div class="contact-name">${escHtml(d.partnerName)}</div>
        <div class="contact-preview">${escHtml(truncate(d.lastMsg, 36))}</div>
      </div>
      <div class="contact-meta">
        <div class="contact-time">${formatTime(d.lastTs)}</div>
      </div>
    </div>
  `).join('');
}

/** Рендер всех пользователей */
function renderUsersList(query) {
  const container = document.getElementById('users-list');
  const users = query
    ? DB.searchUsers(query, App.currentUser.id)
    : DB.getOtherUsers(App.currentUser.id);

  if (users.length === 0) {
    container.innerHTML = '<div class="empty-list">' +
      (query ? 'Никого не найдено' : 'Пока нет других пользователей') +
      '</div>';
    return;
  }

  container.innerHTML = users.map(u => `
    <div class="contact-item ${App.activeChatId === u.id ? 'active' : ''}"
         onclick="openChat('${u.id}', '${escHtml(u.name)}')">
      <div class="contact-avatar">${u.name[0].toUpperCase()}</div>
      <div class="contact-info">
        <div class="contact-name">${escHtml(u.name)}</div>
        <div class="contact-preview">@${escHtml(u.username)}</div>
      </div>
    </div>
  `).join('');
}

function searchUsers(query) {
  if (App.sideTab === 'users') {
    renderUsersList(query);
  } else {
    // Поиск по диалогам — фильтруем отображение
    const container = document.getElementById('chats-list');
    if (!query) { renderDialogs(); return; }
    const dialogs = DB.getDialogs(App.currentUser.id)
      .filter(d => d.partnerName.toLowerCase().includes(query.toLowerCase()) ||
                   d.partnerUsername.toLowerCase().includes(query.toLowerCase()));
    if (dialogs.length === 0) {
      container.innerHTML = '<div class="empty-list">Не найдено</div>';
      return;
    }
    container.innerHTML = dialogs.map(d => `
      <div class="contact-item" onclick="openChat('${d.partnerId}', '${escHtml(d.partnerName)}')">
        <div class="contact-avatar">${d.partnerName[0].toUpperCase()}</div>
        <div class="contact-info">
          <div class="contact-name">${escHtml(d.partnerName)}</div>
          <div class="contact-preview">${escHtml(truncate(d.lastMsg, 36))}</div>
        </div>
      </div>
    `).join('');
  }
}

/* =====================================================
   ЧАТ
   ===================================================== */

function openChat(partnerId, partnerName) {
  App.activeChatId = partnerId;
  App.activeChatName = partnerName;
  App.lastMsgCount = 0;

  // Обновить шапку чата
  document.getElementById('chat-partner-name').textContent = partnerName;
  document.getElementById('chat-partner-avatar').textContent = partnerName[0].toUpperCase();

  // Показать чат
  document.getElementById('chat-empty').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');

  // На мобильных — выдвинуть чат
  document.querySelector('.chat-area').classList.add('open');

  // Отметить активный элемент в списке
  document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
  event && event.currentTarget && event.currentTarget.classList.add('active');

  renderMessages();
  document.getElementById('msg-input').focus();
}

function closeChat() {
  document.querySelector('.chat-area').classList.remove('open');
  App.activeChatId = null;
}

/** Рендер сообщений активного чата */
function renderMessages() {
  if (!App.activeChatId) return;
  const msgs = DB.getConversation(App.currentUser.id, App.activeChatId);
  const container = document.getElementById('messages-container');
  App.lastMsgCount = msgs.length;

  if (msgs.length === 0) {
    container.innerHTML = '<div class="empty-list" style="margin-top:40px">Начните разговор! 👋</div>';
    return;
  }

  let lastDate = null;
  let html = '';

  msgs.forEach(msg => {
    const msgDate = new Date(msg.ts).toLocaleDateString('ru-RU', { day:'numeric', month:'long' });
    if (msgDate !== lastDate) {
      html += `<div class="date-divider">${msgDate}</div>`;
      lastDate = msgDate;
    }
    const dir = msg.from === App.currentUser.id ? 'out' : 'in';
    html += `
      <div class="msg-row ${dir}">
        <div class="msg-bubble">
          ${escHtml(msg.text).replace(/\n/g, '<br>')}
          <div class="msg-time">${formatTimeFull(msg.ts)}</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  scrollToBottom();
}

function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !App.activeChatId) return;

  DB.sendMessage(App.currentUser.id, App.activeChatId, text);
  input.value = '';
  input.style.height = 'auto';

  renderMessages();
  renderDialogs(); // обновить превью в sidebar
}

/** Enter = отправить, Shift+Enter = новая строка */
function handleMsgKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

/** Авто-расширение textarea */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

function scrollToBottom() {
  const wrap = document.getElementById('messages-wrap');
  wrap.scrollTop = wrap.scrollHeight;
}

/* =====================================================
   ОПРОС (псевдо-реальное время)
   ===================================================== */

function startPolling() {
  stopPolling();
  App.pollingInterval = setInterval(() => {
    if (!App.activeChatId) return;
    const msgs = DB.getConversation(App.currentUser.id, App.activeChatId);
    if (msgs.length !== App.lastMsgCount) {
      renderMessages();
      renderDialogs();
    }
  }, 1500);
}

function stopPolling() {
  if (App.pollingInterval) {
    clearInterval(App.pollingInterval);
    App.pollingInterval = null;
  }
}

/* =====================================================
   ТЕМА
   ===================================================== */

function applyTheme(theme, animate) {
  App.theme = theme;
  document.body.className = 'theme-' + theme;
  localStorage.setItem('msgt_theme', theme);

  // Обновить label кнопок переключения
  const label = theme === 'modern' ? 'Google-стиль' : 'Modern-стиль';
  const authLabel = document.getElementById('theme-label-auth');
  if (authLabel) authLabel.textContent = label;

  if (animate) {
    document.body.style.transition = 'background-color 0.3s ease';
  }
}

function toggleTheme() {
  const next = App.theme === 'modern' ? 'google' : 'modern';
  applyTheme(next, true);
  showToast('Тема: ' + (next === 'modern' ? 'Modern' : 'Google-стиль'));
}

/* =====================================================
   TOAST (уведомления)
   ===================================================== */
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* =====================================================
   УТИЛИТЫ
   ===================================================== */

/** Экранирование HTML */
function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Обрезать текст */
function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

/** Форматировать время для списка */
function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** Форматировать время для сообщения */
function formatTimeFull(ts) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

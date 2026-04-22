/**
 * db.js — misegesait
 * Слой данных на основе localStorage.
 * Структура хранилища:
 *   msgt_users   — массив пользователей [{id, name, username, passwordHash}]
 *   msgt_msgs    — массив сообщений [{id, from, to, text, ts}]
 *   msgt_session — {userId} текущая сессия
 */

const DB = (() => {

  /* ---------- Хелперы ---------- */
  const get  = key => { try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; } };
  const save = (key, val) => localStorage.setItem(key, JSON.stringify(val));

  /** Простой хэш (не криптографический — только для демо) */
  function hashPassword(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return 'h' + Math.abs(hash).toString(36);
  }

  /* ---------- ПОЛЬЗОВАТЕЛИ ---------- */

  function getUsers() {
    return get('msgt_users') || [];
  }

  function findUserByUsername(username) {
    return getUsers().find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  function findUserById(id) {
    return getUsers().find(u => u.id === id);
  }

  /**
   * Регистрация нового пользователя.
   * Возвращает {ok: true, user} или {ok: false, error}
   */
  function registerUser(name, username, password) {
    if (!name.trim() || !username.trim() || !password) {
      return { ok: false, error: 'Заполните все поля' };
    }
    if (username.length < 3) {
      return { ok: false, error: 'Логин: минимум 3 символа' };
    }
    if (password.length < 4) {
      return { ok: false, error: 'Пароль: минимум 4 символа' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { ok: false, error: 'Логин: только латиница, цифры, _' };
    }
    if (findUserByUsername(username)) {
      return { ok: false, error: 'Такой логин уже занят' };
    }
    const users = getUsers();
    const user = {
      id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: name.trim(),
      username: username.trim(),
      passwordHash: hashPassword(password),
      createdAt: Date.now()
    };
    users.push(user);
    save('msgt_users', users);
    return { ok: true, user };
  }

  /**
   * Вход. Возвращает {ok: true, user} или {ok: false, error}
   */
  function loginUser(username, password) {
    const user = findUserByUsername(username);
    if (!user) return { ok: false, error: 'Пользователь не найден' };
    if (user.passwordHash !== hashPassword(password)) {
      return { ok: false, error: 'Неверный пароль' };
    }
    save('msgt_session', { userId: user.id });
    return { ok: true, user };
  }

  function logout() {
    localStorage.removeItem('msgt_session');
  }

  function getCurrentUser() {
    const session = get('msgt_session');
    if (!session) return null;
    return findUserById(session.userId) || null;
  }

  /** Получить всех пользователей кроме текущего */
  function getOtherUsers(currentId) {
    return getUsers().filter(u => u.id !== currentId);
  }

  /* ---------- СООБЩЕНИЯ ---------- */

  function getMessages() {
    return get('msgt_msgs') || [];
  }

  /**
   * Получить переписку между двумя пользователями (по id)
   */
  function getConversation(userId1, userId2) {
    return getMessages().filter(m =>
      (m.from === userId1 && m.to === userId2) ||
      (m.from === userId2 && m.to === userId1)
    ).sort((a, b) => a.ts - b.ts);
  }

  /**
   * Отправить сообщение. Возвращает объект сообщения.
   */
  function sendMessage(fromId, toId, text) {
    text = text.trim();
    if (!text) return null;
    const msgs = getMessages();
    const msg = {
      id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      from: fromId,
      to: toId,
      text: text,
      ts: Date.now()
    };
    msgs.push(msg);
    save('msgt_msgs', msgs);
    return msg;
  }

  /**
   * Получить список диалогов текущего пользователя.
   * Возвращает [{partnerId, partnerName, partnerUsername, lastMsg, lastTs, unread}]
   */
  function getDialogs(currentId) {
    const msgs = getMessages().filter(m => m.from === currentId || m.to === currentId);
    const seen = new Set();
    const dialogs = [];

    // Сортируем по времени убывания
    msgs.sort((a, b) => b.ts - a.ts);

    for (const m of msgs) {
      const partnerId = m.from === currentId ? m.to : m.from;
      if (seen.has(partnerId)) continue;
      seen.add(partnerId);
      const partner = findUserById(partnerId);
      if (!partner) continue;
      dialogs.push({
        partnerId,
        partnerName: partner.name,
        partnerUsername: partner.username,
        lastMsg: m.text,
        lastTs: m.ts
      });
    }

    return dialogs;
  }

  /**
   * Поиск пользователей по имени или логину
   */
  function searchUsers(query, currentId) {
    query = query.toLowerCase().trim();
    return getOtherUsers(currentId).filter(u =>
      u.name.toLowerCase().includes(query) ||
      u.username.toLowerCase().includes(query)
    );
  }

  /* ---------- ЭКСПОРТ ---------- */
  return {
    registerUser,
    loginUser,
    logout,
    getCurrentUser,
    getOtherUsers,
    getConversation,
    sendMessage,
    getDialogs,
    searchUsers,
    findUserById
  };

})();

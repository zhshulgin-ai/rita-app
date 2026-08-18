// api.js — all /api/* route handlers. Plain JSON in, JSON out. No framework.
const fs = require('node:fs');
const path = require('node:path');
const { db, uuid, inviteCode } = require('./db');
const {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
} = require('./auth');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true }); // some deploy methods (e.g. GitHub's web upload) drop empty dirs
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB decoded

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    birthdayMonth: u.birthday_month,
    birthdayDay: u.birthday_day,
    bio: u.bio,
    avatarPath: u.avatar_path || null,
    inviteCode: u.invite_code,
    createdAt: u.created_at,
  };
}

function publicFriend(u) {
  // Slightly narrower view of a friend (no email exposed in lists that don't need it).
  return {
    id: u.id,
    name: u.name,
    birthdayMonth: u.birthday_month,
    birthdayDay: u.birthday_day,
    bio: u.bio,
    avatarPath: u.avatar_path || null,
  };
}

function daysUntilBirthday(month, day, from = new Date()) {
  if (!month || !day) return null;
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let next = new Date(from.getFullYear(), month - 1, day);
  if (next < today) next = new Date(from.getFullYear() + 1, month - 1, day);
  return Math.round((next - today) / (1000 * 60 * 60 * 24));
}

function savePhoto(photoDataUrl) {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(photoDataUrl || '');
  if (!match) throw new ApiError(400, 'Invalid photo data');
  const mime = match[1];
  const b64 = match[2];
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime] || 'jpg';
  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length > MAX_PHOTO_BYTES) throw new ApiError(413, 'Photo too large');
  const filename = `${uuid()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

function requireUser(user) {
  if (!user) throw new ApiError(401, 'Not signed in');
  return user;
}

function claimInfo(momentId, currentUserId) {
  const claims = db
    .prepare(
      `SELECT claims.claimer_id as claimerId, users.name as claimerName
       FROM claims JOIN users ON users.id = claims.claimer_id
       WHERE moment_id = ?`
    )
    .all(momentId);
  return {
    claimCount: claims.length,
    claimedByMe: claims.some((c) => c.claimerId === currentUserId),
    claimedBy: claims.map((c) => c.claimerName),
  };
}

function areFriends(userId, otherId) {
  const row = db
    .prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?')
    .get(userId, otherId);
  return !!row;
}

const handlers = {
  'POST /api/signup': (req, res, user, body) => {
    const name = (body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const birthdayMonth = body.birthdayMonth ? Number(body.birthdayMonth) : null;
    const birthdayDay = body.birthdayDay ? Number(body.birthdayDay) : null;

    if (!name) throw new ApiError(400, 'Name is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Valid email is required');
    if (password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters');

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) throw new ApiError(409, 'An account with that email already exists');

    const { hash, salt } = hashPassword(password);
    const id = uuid();
    let code = inviteCode();
    // extremely unlikely collision, but guard anyway
    while (db.prepare('SELECT id FROM users WHERE invite_code = ?').get(code)) code = inviteCode();

    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, password_salt, birthday_month, birthday_day, bio, invite_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)`
    ).run(id, name, email, hash, salt, birthdayMonth, birthdayDay, code, new Date().toISOString());

    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const session = createSession(id);
    setSessionCookie(res, session.token, session.expiresAt);
    return { status: 201, body: { user: publicUser(created) } };
  },

  'POST /api/login': (req, res, user, body) => {
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const found = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!found || !verifyPassword(password, found.password_salt, found.password_hash)) {
      throw new ApiError(401, 'Invalid email or password');
    }
    const session = createSession(found.id);
    setSessionCookie(res, session.token, session.expiresAt);
    return { status: 200, body: { user: publicUser(found) } };
  },

  'POST /api/logout': (req, res, user, body, cookies) => {
    if (cookies.rita_session) destroySession(cookies.rita_session);
    clearSessionCookie(res);
    return { status: 200, body: { ok: true } };
  },

  'GET /api/me': (req, res, user) => {
    requireUser(user);
    return { status: 200, body: { user: publicUser(user) } };
  },

  'PUT /api/me': (req, res, user, body) => {
    requireUser(user);
    const name = body.name !== undefined ? String(body.name).trim() : user.name;
    const bio = body.bio !== undefined ? String(body.bio).slice(0, 500) : user.bio;
    const birthdayMonth = body.birthdayMonth !== undefined ? Number(body.birthdayMonth) || null : user.birthday_month;
    const birthdayDay = body.birthdayDay !== undefined ? Number(body.birthdayDay) || null : user.birthday_day;
    if (!name) throw new ApiError(400, 'Name is required');
    db.prepare(
      'UPDATE users SET name = ?, bio = ?, birthday_month = ?, birthday_day = ? WHERE id = ?'
    ).run(name, bio, birthdayMonth, birthdayDay, user.id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    return { status: 200, body: { user: publicUser(updated) } };
  },

  'PUT /api/me/avatar': (req, res, user, body) => {
    requireUser(user);
    if (!body.avatarDataUrl) throw new ApiError(400, 'No photo provided');
    const newPath = savePhoto(body.avatarDataUrl);
    if (user.avatar_path) {
      const oldFile = path.join(__dirname, user.avatar_path.replace(/^\//, ''));
      fs.existsSync(oldFile) && fs.unlinkSync(oldFile);
    }
    db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(newPath, user.id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    return { status: 200, body: { user: publicUser(updated) } };
  },

  'POST /api/moments': (req, res, user, body) => {
    requireUser(user);
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      throw new ApiError(400, 'Rating must be an integer from 1 to 10');
    }
    const note = String(body.note || '').slice(0, 1000);
    const location = String(body.location || '').slice(0, 200);
    let photoPath = null;
    if (body.photoDataUrl) photoPath = savePhoto(body.photoDataUrl);

    const id = uuid();
    db.prepare(
      `INSERT INTO moments (id, owner_id, photo_path, rating, note, location, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, user.id, photoPath, rating, note, location, new Date().toISOString());

    const created = db.prepare('SELECT * FROM moments WHERE id = ?').get(id);
    return { status: 201, body: { moment: created } };
  },

  'GET /api/moments': (req, res, user) => {
    requireUser(user);
    const moments = db
      .prepare('SELECT * FROM moments WHERE owner_id = ? ORDER BY created_at DESC')
      .all(user.id);
    return { status: 200, body: { moments } };
  },

  'DELETE /api/moments/:id': (req, res, user, body, cookies, params) => {
    requireUser(user);
    const moment = db.prepare('SELECT * FROM moments WHERE id = ?').get(params.id);
    if (!moment || moment.owner_id !== user.id) throw new ApiError(404, 'Moment not found');
    if (moment.photo_path) {
      const filePath = path.join(__dirname, moment.photo_path.replace(/^\//, ''));
      fs.existsSync(filePath) && fs.unlinkSync(filePath);
    }
    db.prepare('DELETE FROM claims WHERE moment_id = ?').run(moment.id);
    db.prepare('DELETE FROM moments WHERE id = ?').run(moment.id);
    return { status: 200, body: { ok: true } };
  },

  'GET /api/friends': (req, res, user) => {
    requireUser(user);
    const friends = db
      .prepare(
        `SELECT users.* FROM friendships JOIN users ON users.id = friendships.friend_id
         WHERE friendships.user_id = ? ORDER BY users.name COLLATE NOCASE ASC`
      )
      .all(user.id);
    return {
      status: 200,
      body: { friends: friends.map(publicFriend), inviteCode: user.invite_code },
    };
  },

  'POST /api/friends/connect': (req, res, user, body) => {
    requireUser(user);
    const code = String(body.code || '').trim().toLowerCase();
    if (!code) throw new ApiError(400, 'Invite code is required');
    const friend = db.prepare('SELECT * FROM users WHERE invite_code = ?').get(code);
    if (!friend) throw new ApiError(404, 'No account found for that invite code');
    if (friend.id === user.id) throw new ApiError(400, "That's your own invite code");

    const now = new Date().toISOString();
    db.prepare(
      'INSERT OR IGNORE INTO friendships (id, user_id, friend_id, created_at) VALUES (?, ?, ?, ?)'
    ).run(uuid(), user.id, friend.id, now);
    db.prepare(
      'INSERT OR IGNORE INTO friendships (id, user_id, friend_id, created_at) VALUES (?, ?, ?, ?)'
    ).run(uuid(), friend.id, user.id, now);

    return { status: 200, body: { friend: publicFriend(friend) } };
  },

  'GET /api/occasions': (req, res, user) => {
    requireUser(user);
    const friends = db
      .prepare(
        `SELECT users.* FROM friendships JOIN users ON users.id = friendships.friend_id
         WHERE friendships.user_id = ?`
      )
      .all(user.id);

    const occasions = friends.map((friend) => {
      const moments = db
        .prepare('SELECT * FROM moments WHERE owner_id = ? ORDER BY created_at DESC')
        .all(friend.id)
        .map((m) => ({ ...m, ...claimInfo(m.id, user.id) }));
      return {
        friend: publicFriend(friend),
        daysUntilBirthday: daysUntilBirthday(friend.birthday_month, friend.birthday_day),
        moments,
      };
    });

    occasions.sort((a, b) => {
      if (a.daysUntilBirthday === null) return 1;
      if (b.daysUntilBirthday === null) return -1;
      return a.daysUntilBirthday - b.daysUntilBirthday;
    });

    return { status: 200, body: { occasions } };
  },

  'POST /api/moments/:id/claim': (req, res, user, body, cookies, params) => {
    requireUser(user);
    const moment = db.prepare('SELECT * FROM moments WHERE id = ?').get(params.id);
    if (!moment) throw new ApiError(404, 'Moment not found');
    if (moment.owner_id === user.id) throw new ApiError(400, "You can't claim your own moment");
    if (!areFriends(user.id, moment.owner_id)) throw new ApiError(403, 'Not in your circle');
    db.prepare(
      'INSERT OR IGNORE INTO claims (id, moment_id, claimer_id, created_at) VALUES (?, ?, ?, ?)'
    ).run(uuid(), moment.id, user.id, new Date().toISOString());
    return { status: 200, body: claimInfo(moment.id, user.id) };
  },

  'DELETE /api/moments/:id/claim': (req, res, user, body, cookies, params) => {
    requireUser(user);
    db.prepare('DELETE FROM claims WHERE moment_id = ? AND claimer_id = ?').run(params.id, user.id);
    return { status: 200, body: claimInfo(params.id, user.id) };
  },

  'GET /api/friends/:id/moments': (req, res, user, body, cookies, params) => {
    requireUser(user);
    if (!areFriends(user.id, params.id)) throw new ApiError(403, 'Not in your circle');
    const friend = db.prepare('SELECT * FROM users WHERE id = ?').get(params.id);
    if (!friend) throw new ApiError(404, 'Not found');
    const moments = db
      .prepare('SELECT * FROM moments WHERE owner_id = ? ORDER BY created_at DESC')
      .all(friend.id)
      .map((m) => ({ ...m, ...claimInfo(m.id, user.id) }));
    return { status: 200, body: { friend: publicFriend(friend), moments } };
  },
};

module.exports = { handlers, ApiError };

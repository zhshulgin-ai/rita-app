// app.js — the entire client. No build step, no framework: state + string templates + DOM.
(() => {
  'use strict';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const app = document.getElementById('app');

  const ICONS = {
    feed: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V21h3.5a1 1 0 0 0 1-1V9.5"/></svg>',
    circle: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8" r="3"/><circle cx="16.3" cy="9.2" r="2.5"/><path d="M2.3 20a6.2 6.2 0 0 1 12.4 0"/><path d="M14.7 14.4a5.3 5.3 0 0 1 7 5.6"/></svg>',
    profile: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>',
    camera: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    share: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8 15.8 6.2M8.2 13.2l7.6 4.6"/></svg>',
  };

  const state = {
    user: null,
    view: 'feed', // feed | capture | friends | friend | profile
    authMode: 'login', // login | signup
    error: null,
    loading: true,
    occasions: null, // powers the feed
    myMoments: null, // used on the profile grid
    friends: null,
    inviteCode: null,
    pendingInviteCode: new URLSearchParams(location.search).get('invite') || '',
    photoDataUrl: null,
    friendDetailId: null,
    friendDetail: null, // { friend, moments }
    friendSort: 'new', // new | rating
    friendPeriod: 'all', // 'all' or 'YYYY-MM'
    openMoment: null, // { moment, mode: 'own'|'friend', friend } — powers the grid-click lightbox
  };

  // ---------------------------------------------------------------- helpers
  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function initials(name) {
    return (name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('');
  }

  function handle(name) {
    return (name || '').toLowerCase().replace(/\s+/g, '');
  }

  function avatarNode(user, sizeClass = '') {
    const cls = `avatar ${sizeClass}`.trim();
    if (user && user.avatarPath) {
      return `<img class="${cls}" src="${esc(user.avatarPath)}" alt="" />`;
    }
    return `<div class="${cls}">${esc(initials(user && user.name))}</div>`;
  }

  function formatPostDate(iso) {
    const d = new Date(iso);
    return `${MONTHS_FULL[d.getMonth()]}, ${d.getDate()}. ${d.getFullYear()}`;
  }

  function formatShortDate(iso) {
    const d = new Date(iso);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  function mapsUrl(location) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  }

  // Same cold→hot stops as the .rating-bar-track gradient in styles.css, so the
  // big number on the capture screen previews the color the saved bar will show.
  const RATING_COLOR_STOPS = [
    [0, [63, 127, 217]],
    [20, [59, 173, 217]],
    [38, [59, 201, 160]],
    [52, [143, 201, 59]],
    [66, [224, 201, 59]],
    [80, [224, 151, 59]],
    [100, [221, 74, 53]],
  ];
  function ratingColor(rating) {
    const pct = Math.max(0, Math.min(100, (rating - 1) * (100 / 9)));
    let lo = RATING_COLOR_STOPS[0], hi = RATING_COLOR_STOPS[RATING_COLOR_STOPS.length - 1];
    for (let i = 0; i < RATING_COLOR_STOPS.length - 1; i++) {
      if (pct >= RATING_COLOR_STOPS[i][0] && pct <= RATING_COLOR_STOPS[i + 1][0]) {
        lo = RATING_COLOR_STOPS[i]; hi = RATING_COLOR_STOPS[i + 1]; break;
      }
    }
    const span = hi[0] - lo[0];
    const t = span === 0 ? 0 : (pct - lo[0]) / span;
    const rgb = lo[1].map((c, i) => Math.round(c + (hi[1][i] - c) * t));
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  async function api(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function inviteUrlFor(code) {
    return code ? `${location.origin}/?invite=${code}` : '';
  }

  async function shareProfile() {
    const url = inviteUrlFor(state.inviteCode);
    const text = "Join my circle on Rita — see what I've saved before my birthday.";
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join me on Rita', text, url });
      } catch {
        // user backed out of the native share sheet — nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url || state.inviteCode || '');
      alert('Invite link copied!');
    } catch {
      alert(`Share this code: ${state.inviteCode}`);
    }
  }

  function setView(view) {
    state.view = view;
    state.error = null;
    render();
    loadViewData(view);
  }

  function openFriend(friendId) {
    state.view = 'friend';
    state.friendDetailId = friendId;
    state.friendDetail = null;
    state.friendSort = 'new';
    state.friendPeriod = 'all';
    state.error = null;
    render();
    loadViewData('friend');
  }

  // ---------------------------------------------------------------- data loading
  async function loadOccasions() {
    const { occasions } = await api('GET', '/api/occasions');
    state.occasions = occasions;
  }

  async function loadViewData(view) {
    try {
      if (view === 'feed') {
        if (state.occasions === null) render();
        await loadOccasions();
      } else if (view === 'friends') {
        state.friends = null; render();
        const { friends, inviteCode } = await api('GET', '/api/friends');
        state.friends = friends;
        state.inviteCode = inviteCode;
      } else if (view === 'friend') {
        const { friend, moments } = await api('GET', `/api/friends/${state.friendDetailId}/moments`);
        state.friendDetail = { friend, moments };
      } else if (view === 'profile') {
        state.myMoments = null; render();
        const [momentsRes, friendsRes] = await Promise.all([
          api('GET', '/api/moments'),
          api('GET', '/api/friends'),
        ]);
        state.myMoments = momentsRes.moments;
        state.friends = friendsRes.friends;
        state.inviteCode = friendsRes.inviteCode;
      }
      render();
    } catch (e) {
      state.error = e.message;
      render();
    }
  }

  // ---------------------------------------------------------------- render root
  function render() {
    app.innerHTML = '';
    if (state.loading) {
      app.innerHTML = '<div class="spinner-row">Loading Rita…</div>';
      return;
    }
    if (!state.user) {
      app.appendChild(renderAuth());
      return;
    }
    const wrap = document.createElement('div');
    wrap.style.display = 'contents';
    wrap.appendChild(renderTopbar());
    wrap.appendChild(renderScreen());
    wrap.appendChild(renderBottomNav());
    app.appendChild(wrap);
    if (state.openMoment) app.appendChild(renderMomentModal());
  }

  // ---------------------------------------------------------------- auth screens
  function renderAuth() {
    const el = document.createElement('div');
    el.className = 'auth-screen';
    const isLogin = state.authMode === 'login';
    el.innerHTML = `
      <div class="auth-hero">
        <span class="wordmark">Rita</span>
        <p>Save the moments where you noticed something —<br>so the people who love you don't have to guess.</p>
      </div>
      ${state.error ? `<div class="error-banner">${esc(state.error)}</div>` : ''}
      <div class="auth-card">
        <form id="auth-form">
          ${!isLogin ? `
          <div class="field"><label>Your name</label><input name="name" required autocomplete="name" /></div>
          ` : ''}
          <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email" /></div>
          <div class="field"><label>Password</label><input name="password" type="password" required minlength="6" autocomplete="${isLogin ? 'current-password' : 'new-password'}" /></div>
          ${!isLogin ? `
          <div class="field-row">
            <div class="field">
              <label>Birth month</label>
              <select name="birthdayMonth"><option value="">—</option>${MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
            </div>
            <div class="field">
              <label>Birth day</label>
              <input name="birthdayDay" type="number" min="1" max="31" placeholder="14" />
            </div>
          </div>
          ` : ''}
          <button class="btn" type="submit">${isLogin ? 'Log in' : 'Create account'}</button>
        </form>
      </div>
      <div style="text-align:center; margin-top:18px;">
        ${isLogin
          ? `New to Rita? <button class="link-btn" id="switch-mode">Create an account</button>`
          : `Already have an account? <button class="link-btn" id="switch-mode">Log in</button>`}
      </div>
    `;
    el.querySelector('#switch-mode').addEventListener('click', () => {
      state.authMode = isLogin ? 'signup' : 'login';
      state.error = null;
      render();
    });
    el.querySelector('#auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        const { user } = await api('POST', isLogin ? '/api/login' : '/api/signup', payload);
        state.user = user;
        state.error = null;
        setView('feed');
      } catch (err) {
        state.error = err.message;
        render();
      }
    });
    return el;
  }

  // ---------------------------------------------------------------- shell
  function renderTopbar() {
    const el = document.createElement('div');
    el.className = 'topbar';
    const titles = { feed: '', capture: 'Save a moment', friends: 'Circle', profile: 'Profile' };
    if (state.view === 'friend') {
      const name = state.friendDetail ? state.friendDetail.friend.name : '…';
      el.innerHTML = `
        <button class="topbar-back" id="topbar-back" aria-label="Back">←</button>
        <h1>${esc(name)}</h1>
        <span style="width:26px;"></span>
      `;
      el.querySelector('#topbar-back').addEventListener('click', () => setView('friends'));
      return el;
    }
    el.innerHTML = `
      <h1>${state.view === 'feed' ? '<span class="wordmark">Rita</span>' : esc(titles[state.view] || '')}</h1>
      ${state.view !== 'capture' ? '<button class="topbar-add" id="topbar-add" aria-label="Save a Rita">+</button>' : ''}
    `;
    const addBtn = el.querySelector('#topbar-add');
    if (addBtn) addBtn.addEventListener('click', () => setView('capture'));
    return el;
  }

  function renderBottomNav() {
    const el = document.createElement('div');
    el.className = 'bottom-nav';
    const items = [
      { id: 'feed', icon: ICONS.feed, label: 'Feed' },
      { id: 'friends', icon: ICONS.circle, label: 'Circle' },
      { id: 'profile', icon: ICONS.profile, label: 'Profile' },
    ];
    el.innerHTML = items.map((it) => {
      const isActive = state.view === it.id || (it.id === 'friends' && state.view === 'friend');
      return `
      <button class="nav-btn ${isActive ? 'active' : ''}" data-view="${it.id}">
        <span class="icon">${it.icon}</span>
        <span>${it.label}</span>
      </button>
    `;
    }).join('');
    el.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => setView(btn.dataset.view));
    });
    return el;
  }

  function renderScreen() {
    const el = document.createElement('div');
    el.className = 'screen';
    if (state.view === 'feed') el.classList.add('screen-feed');
    if (state.error) {
      const banner = document.createElement('div');
      banner.className = 'error-banner';
      banner.textContent = state.error;
      el.appendChild(banner);
    }
    const map = { feed: renderFeed, capture: renderCapture, friends: renderFriends, friend: renderFriendDetail, profile: renderProfile };
    el.appendChild((map[state.view] || renderFeed)());
    return el;
  }

  // ---------------------------------------------------------------- feed (Instagram-style, the landing screen)
  function renderFeed() {
    const el = document.createElement('div');
    if (state.occasions === null) {
      el.innerHTML = '<div class="spinner-row">Loading…</div>';
      return el;
    }
    if (state.occasions.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <span class="emoji">👥</span>
          Add people to your circle to start seeing what they've saved.
        </div>`;
      return el;
    }

    const posts = [];
    state.occasions.forEach((occ) => {
      occ.moments.forEach((m) => posts.push({ ...m, friend: occ.friend, occasion: occ.occasion }));
    });
    posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (posts.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <span class="emoji">✨</span>
          No one in your circle has saved anything yet. Once they do, it shows up here.
        </div>`;
      return el;
    }

    posts.forEach((post) => el.appendChild(renderFeedPost(post)));
    return el;
  }

  function renderFeedPost(post) {
    const card = document.createElement('div');
    card.className = 'feed-post';
    const occ = post.occasion;
    const showPill = occ && occ.days <= 45;
    const pillText = occ ? `${occ.emoji} ${occ.days === 0 ? 'today' : occ.days === 1 ? 'tomorrow' : `in ${occ.days}d`}` : '';
    card.innerHTML = `
      <div class="feed-post-header">
        <div class="feed-user-row">
          <div class="row-main">
            ${avatarNode(post.friend)}
            <span class="feed-username">${esc(handle(post.friend.name))}</span>
          </div>
          ${showPill ? `<span class="pill soon">${pillText}</span>` : ''}
        </div>
        <div class="feed-meta-row">
          <span class="feed-date">${formatShortDate(post.created_at)}</span>
          ${post.location ? `
          <span class="meta-dot">·</span>
          <a class="feed-location-link" href="${mapsUrl(post.location)}" target="_blank" rel="noopener">📍 ${esc(post.location)}</a>
          ` : ''}
        </div>
      </div>
      ${post.photo_path
        ? `<img class="feed-photo" src="${esc(post.photo_path)}" alt="" />`
        : `<div class="feed-photo placeholder">✨</div>`}
      <div class="feed-body">
        <div class="rating-bar-row">
          <div class="rating-bar-track"><div class="rating-bar-cover" style="width:${100 - post.rating * 10}%"></div></div>
          <span class="rating-bar-label">${post.rating}/10</span>
        </div>
        ${post.note ? `<div class="feed-caption">${esc(post.note)}</div>` : ''}
        <div class="moment-actions"></div>
      </div>
    `;
    card.querySelector('.feed-date').title = formatPostDate(post.created_at);
    const actions = card.querySelector('.moment-actions');
    if (post.claimedByMe) {
      const btn = document.createElement('button');
      btn.className = 'btn small claimed';
      btn.textContent = '✓ Getting this';
      btn.addEventListener('click', async () => {
        await api('DELETE', `/api/moments/${post.id}/claim`);
        loadViewData('feed');
      });
      actions.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn small ghost';
      btn.textContent = 'Claim this';
      btn.addEventListener('click', async () => {
        await api('POST', `/api/moments/${post.id}/claim`);
        loadViewData('feed');
      });
      actions.appendChild(btn);
    }
    if (post.claimCount > 0) {
      const note = document.createElement('div');
      note.className = 'claim-note';
      note.textContent = post.claimedByMe && post.claimCount === 1
        ? 'Only you, so far'
        : `Considered by: ${esc(post.claimedBy.join(', '))}`;
      actions.after(note);
    }
    return card;
  }

  // ---------------------------------------------------------------- moments grid + lightbox (profile & friend detail)
  // Instagram-profile-style: a 3-column grid of square thumbnails with a small
  // rating badge, opening into a full-detail modal on click.
  function renderMomentsGrid(moments, opts) {
    const grid = document.createElement('div');
    grid.className = 'moments-grid';
    moments.forEach((m) => {
      const item = document.createElement('div');
      item.className = 'grid-item';
      item.innerHTML = `
        ${m.photo_path
          ? `<img class="grid-photo" src="${esc(m.photo_path)}" alt="" />`
          : `<div class="grid-photo placeholder">✨</div>`}
        <div class="grid-badge" style="background:${ratingColor(m.rating)}">${m.rating}</div>
      `;
      item.addEventListener('click', () => openMomentModal(m, opts));
      grid.appendChild(item);
    });
    return grid;
  }

  function openMomentModal(moment, { mode, friend }) {
    state.openMoment = { moment, mode, friend: friend || null };
    render();
  }

  function closeMomentModal() {
    state.openMoment = null;
    render();
  }

  function renderMomentModal() {
    const { moment: m, mode, friend } = state.openMoment;
    const owner = mode === 'own' ? state.user : friend;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeMomentModal(); });
    overlay.innerHTML = `
      <div class="modal-post">
        <div class="modal-photo">
          ${m.photo_path
            ? `<img src="${esc(m.photo_path)}" alt="" />`
            : `<div class="modal-photo-placeholder">✨</div>`}
        </div>
        <div class="modal-side">
          <div class="modal-header">
            ${avatarNode(owner, 'modal-avatar')}
            <div>
              <div class="modal-username">${esc(handle(owner && owner.name))}</div>
              <div class="modal-date">${formatPostDate(m.created_at)}</div>
            </div>
            <button class="modal-close" id="modal-close" aria-label="Close">✕</button>
          </div>
          <div class="modal-body">
            ${m.location ? `<div class="modal-location">📍 <a href="${mapsUrl(m.location)}" target="_blank" rel="noopener">${esc(m.location)}</a></div>` : ''}
            ${m.note ? `<div class="modal-caption">${esc(m.note)}</div>` : ''}
            <div class="modal-footer">
              <div class="modal-actions"></div>
              <div class="rating-bar-row">
                <div class="rating-bar-track"><div class="rating-bar-cover" style="width:${100 - m.rating * 10}%"></div></div>
                <span class="rating-bar-label">${m.rating}/10</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    overlay.querySelector('#modal-close').addEventListener('click', closeMomentModal);

    const actionsWrap = overlay.querySelector('.modal-actions');
    if (mode === 'own') {
      const btn = document.createElement('button');
      btn.className = 'btn small ghost';
      btn.textContent = 'Delete';
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this saved moment?')) return;
        await api('DELETE', `/api/moments/${m.id}`);
        closeMomentModal();
        loadViewData('profile');
      });
      actionsWrap.appendChild(btn);
    } else {
      if (m.claimedByMe) {
        const btn = document.createElement('button');
        btn.className = 'btn small claimed';
        btn.textContent = '✓ Getting this';
        btn.addEventListener('click', async () => {
          await api('DELETE', `/api/moments/${m.id}/claim`);
          closeMomentModal();
          loadViewData('friend');
        });
        actionsWrap.appendChild(btn);
      } else {
        const btn = document.createElement('button');
        btn.className = 'btn small ghost';
        btn.textContent = 'Claim this';
        btn.addEventListener('click', async () => {
          await api('POST', `/api/moments/${m.id}/claim`);
          closeMomentModal();
          loadViewData('friend');
        });
        actionsWrap.appendChild(btn);
      }
      if (m.claimCount > 0) {
        const note = document.createElement('div');
        note.className = 'claim-note';
        note.textContent = m.claimedByMe && m.claimCount === 1
          ? 'Only you, so far'
          : `Considered by: ${esc(m.claimedBy.join(', '))}`;
        actionsWrap.after(note);
      }
    }
    return overlay;
  }

  // ---------------------------------------------------------------- capture
  function renderCapture() {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="photo-picker" id="photo-picker">
        ${state.photoDataUrl
          ? `<img class="photo-preview" src="${state.photoDataUrl}" alt="" />`
          : `<div class="photo-picker-empty">✨<br><span style="font-size:12px;">Add a photo — optional, but it helps you remember</span></div>`}
      </div>
      <div class="photo-source-row">
        <label class="btn secondary small photo-source-btn">
          📷 Take a photo
          <input type="file" accept="image/*" capture="environment" id="photo-input-camera" />
        </label>
        <label class="btn ghost small photo-source-btn">
          🖼️ Add a screenshot
          <input type="file" accept="image/*" id="photo-input-library" />
        </label>
      </div>
      <form id="capture-form">
        <div class="rating-value" id="rating-value">6</div>
        <div class="rating-caption">How much do they want it?</div>
        <input class="rating-slider" type="range" min="1" max="10" value="6" id="rating-slider" name="rating" />
        <div class="field">
          <label>What's the story?</label>
          <textarea name="note" placeholder="Loved this band when I was younger…"></textarea>
        </div>
        <div class="field">
          <label>Where did you see it? (optional)</label>
          <div class="location-input-row">
            <input name="location" id="location-input" placeholder="Flea market, downtown" />
            <button type="button" class="btn small secondary location-btn" id="use-location-btn">📍 Use my location</button>
          </div>
        </div>
        <button class="btn" type="submit">Save this moment</button>
      </form>
    `;
    const locBtn = el.querySelector('#use-location-btn');
    const locInput = el.querySelector('#location-input');
    locBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        alert("Your browser doesn't support location.");
        return;
      }
      locBtn.disabled = true;
      locBtn.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1`,
              { headers: { Accept: 'application/json' } }
            );
            const data = await res.json();
            const a = data.address || {};
            const label =
              a.attraction || a.shop || a.amenity || a.building || a.leisure ||
              a.road || a.neighbourhood || a.suburb || a.village || a.town || a.city ||
              data.display_name;
            locInput.value = label || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          } catch {
            locInput.value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          } finally {
            locBtn.disabled = false;
            locBtn.textContent = '📍 Use my location';
          }
        },
        () => {
          alert("Couldn't get your location — check your browser's location permission for this site.");
          locBtn.disabled = false;
          locBtn.textContent = '📍 Use my location';
        },
        { enableHighAccuracy: false, timeout: 8000 }
      );
    });
    function handlePhotoFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.photoDataUrl = reader.result;
        render();
      };
      reader.readAsDataURL(file);
    }
    el.querySelector('#photo-input-camera').addEventListener('change', (e) => handlePhotoFile(e.target.files[0]));
    el.querySelector('#photo-input-library').addEventListener('change', (e) => handlePhotoFile(e.target.files[0]));
    const slider = el.querySelector('#rating-slider');
    const ratingValueEl = el.querySelector('#rating-value');
    ratingValueEl.style.color = ratingColor(Number(slider.value));
    slider.addEventListener('input', () => {
      ratingValueEl.textContent = slider.value;
      ratingValueEl.style.color = ratingColor(Number(slider.value));
    });
    el.querySelector('#capture-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';
      try {
        await api('POST', '/api/moments', {
          rating: Number(fd.get('rating')),
          note: fd.get('note'),
          location: fd.get('location'),
          photoDataUrl: state.photoDataUrl,
        });
        state.photoDataUrl = null;
        setView('profile');
      } catch (err) {
        state.error = err.message;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save this moment';
        render();
      }
    });
    return el;
  }

  // ---------------------------------------------------------------- friends / circle
  // The "Coming up" strip at the top is where occasion/countdown info lives — the plain
  // list below stays a quiet, alphabetical directory so it doesn't repeat the same dates.
  function occasionSubtitle(f) {
    const n = f.momentCount || 0;
    return `${n} moment${n === 1 ? '' : 's'}`;
  }

  function renderFriends() {
    const el = document.createElement('div');
    el.innerHTML = `
      <div id="upcoming-strip"></div>
      <div class="section-title">People in your circle</div>
      <div id="friends-list"></div>
      <div class="section-title">Your invite</div>
      <div class="card">
        <div style="font-size:14px; color:var(--ink-soft);">Share this so friends can join your circle.</div>
        <button class="btn" id="share-profile-btn" style="margin-top:12px;">${ICONS.share} Share profile</button>
        <div class="invite-box">
          <span class="invite-code" id="invite-code">${state.inviteCode ? esc(state.inviteCode) : '…'}</span>
          <button class="btn small secondary" id="copy-invite">Copy code</button>
        </div>
      </div>
      <div class="section-title">Join someone's circle</div>
      <div class="card">
        <form id="connect-form">
          <div class="field">
            <label>Their invite code</label>
            <input name="code" id="connect-input" value="${esc(state.pendingInviteCode)}" placeholder="e.g. 4f2a91c8d0" required />
          </div>
          <button class="btn secondary" type="submit">Connect</button>
        </form>
      </div>
    `;
    el.querySelector('#share-profile-btn').addEventListener('click', shareProfile);
    el.querySelector('#copy-invite').addEventListener('click', async () => {
      const btn = el.querySelector('#copy-invite');
      try {
        await navigator.clipboard.writeText(inviteUrlFor(state.inviteCode) || state.inviteCode);
        btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = 'Copy code'), 1500);
      } catch {
        alert(`Share this code: ${state.inviteCode}`);
      }
    });
    el.querySelector('#connect-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('POST', '/api/friends/connect', { code: fd.get('code') });
        state.pendingInviteCode = '';
        loadViewData('friends');
      } catch (err) {
        state.error = err.message;
        render();
      }
    });

    const stripWrap = el.querySelector('#upcoming-strip');
    const list = el.querySelector('#friends-list');

    if (state.friends === null) {
      list.innerHTML = '<div class="spinner-row">Loading…</div>';
    } else if (state.friends.length === 0) {
      stripWrap.innerHTML = '';
      list.innerHTML = '<div class="empty-state" style="padding:20px 4px;">No one yet — share your invite below.</div>';
    } else {
      // Facebook-style "coming up soon" strip — small round avatars, nearest occasion first.
      const upcoming = state.friends.filter((f) => f.occasion && f.occasion.days <= 30).slice(0, 10);
      if (upcoming.length > 0) {
        stripWrap.innerHTML = `
          <div class="section-title">Coming up</div>
          <div class="upcoming-scroll">
            ${upcoming.map((f) => `
              <button class="upcoming-item" data-id="${f.id}">
                ${avatarNode(f, 'avatar-lg')}
                <span class="upcoming-badge">${f.occasion.emoji} ${f.occasion.days === 0 ? 'today' : `${f.occasion.days}d`}</span>
                <span class="upcoming-name">${esc(f.name.split(' ')[0])}</span>
              </button>
            `).join('')}
          </div>
        `;
        stripWrap.querySelectorAll('.upcoming-item').forEach((btn) => {
          btn.addEventListener('click', () => openFriend(btn.dataset.id));
        });
      } else {
        stripWrap.innerHTML = '';
      }

      const alphabetical = [...state.friends].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      list.innerHTML = `<div class="card" style="padding: 4px 4px;">${alphabetical.map((f) => `
        <div class="list-row friend-row" data-id="${f.id}">
          <div class="row-main">
            ${avatarNode(f)}
            <div>
              <div class="row-title">${esc(f.name)}</div>
              <div class="row-sub">${occasionSubtitle(f)}</div>
            </div>
          </div>
        </div>
      `).join('')}</div>`;
      list.querySelectorAll('.friend-row').forEach((row) => {
        row.addEventListener('click', () => openFriend(row.dataset.id));
      });
    }
    return el;
  }

  // ---------------------------------------------------------------- individual friend's page
  function renderFriendDetail() {
    const el = document.createElement('div');
    if (!state.friendDetail) {
      el.innerHTML = '<div class="spinner-row">Loading…</div>';
      return el;
    }
    const { friend, moments } = state.friendDetail;
    const occ = friend.occasion;

    // build the period filter options from the moments we have
    const periods = Array.from(new Set(moments.map((m) => {
      const d = new Date(m.created_at);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }))).sort().reverse();

    let filtered = state.friendPeriod === 'all'
      ? moments
      : moments.filter((m) => {
        const d = new Date(m.created_at);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === state.friendPeriod;
      });
    filtered = [...filtered].sort((a, b) => (
      state.friendSort === 'rating' ? b.rating - a.rating : new Date(b.created_at) - new Date(a.created_at)
    ));

    el.innerHTML = `
      <div class="friend-detail-header">
        ${avatarNode(friend, 'avatar-xl')}
        <div class="name">${esc(handle(friend.name))}</div>
        ${occ ? `<div class="occ-note">${occ.emoji} ${occ.label} ${occ.days === 0 ? 'is today' : occ.days === 1 ? 'is tomorrow' : `in ${occ.days} days`}</div>` : ''}
      </div>
      <div class="sort-row">
        <button class="sort-btn ${state.friendSort === 'new' ? 'active' : ''}" data-sort="new">Newest</button>
        <button class="sort-btn ${state.friendSort === 'rating' ? 'active' : ''}" data-sort="rating">Most wanted</button>
      </div>
      ${periods.length > 1 ? `
      <div class="filter-row">
        <select id="period-filter" class="filter-select">
          <option value="all" ${state.friendPeriod === 'all' ? 'selected' : ''}>All time</option>
          ${periods.map((p) => {
            const [y, m] = p.split('-');
            return `<option value="${p}" ${state.friendPeriod === p ? 'selected' : ''}>${MONTHS_FULL[Number(m) - 1]} ${y}</option>`;
          }).join('')}
        </select>
      </div>
      ` : ''}
      <div id="friend-moments"></div>
    `;
    el.querySelectorAll('.sort-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.friendSort = btn.dataset.sort;
        render();
      });
    });
    const periodSelect = el.querySelector('#period-filter');
    if (periodSelect) {
      periodSelect.addEventListener('change', () => {
        state.friendPeriod = periodSelect.value;
        render();
      });
    }

    const wrap = el.querySelector('#friend-moments');
    if (filtered.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <span class="emoji">✨</span>
          ${moments.length === 0 ? "Nothing saved yet." : 'Nothing in this period.'}
        </div>`;
    } else {
      wrap.appendChild(renderMomentsGrid(filtered, { mode: 'friend', friend }));
    }
    return el;
  }

  // ---------------------------------------------------------------- profile (own info + own moments grid)
  function renderProfile() {
    const el = document.createElement('div');
    const u = state.user;
    el.innerHTML = `
      <div class="profile-header">
        <label class="avatar-edit" id="avatar-edit">
          ${avatarNode(u, 'avatar-xl')}
          <span class="avatar-edit-badge">${ICONS.camera}</span>
          <input type="file" accept="image/*" id="avatar-input" />
        </label>
        <div class="name">${esc(u.name)}</div>
        ${u.bio ? `<div class="profile-bio">${esc(u.bio)}</div>` : ''}
        <div class="email">${esc(u.email)}</div>
        <div class="profile-stats">
          <div class="stat"><span class="stat-num">${state.myMoments ? state.myMoments.length : '—'}</span><span class="stat-label">moments</span></div>
          <div class="stat"><span class="stat-num">${state.friends ? state.friends.length : '—'}</span><span class="stat-label">circle</span></div>
        </div>
        <button class="btn secondary small" id="share-profile-btn">${ICONS.share} Share profile</button>
      </div>
      <details class="card">
        <summary class="profile-edit-summary">Edit profile</summary>
        <form id="profile-form">
          <div class="field"><label>Name</label><input name="name" value="${esc(u.name)}" required /></div>
          <div class="field-row">
            <div class="field">
              <label>Birth month</label>
              <select name="birthdayMonth">
                <option value="">—</option>
                ${MONTHS.map((m, i) => `<option value="${i + 1}" ${u.birthdayMonth === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Birth day</label>
              <input name="birthdayDay" type="number" min="1" max="31" value="${u.birthdayDay || ''}" />
            </div>
          </div>
          <div class="field"><label>About you (optional)</label><textarea name="bio" placeholder="Anything worth knowing about your taste">${esc(u.bio || '')}</textarea></div>
          <button class="btn" type="submit">Save changes</button>
        </form>
      </details>
      <div class="section-title">Your moments</div>
      <div id="my-moments-grid"></div>
      <button class="btn ghost" id="logout-btn" style="margin-top:20px;">Log out</button>
    `;
    el.querySelector('#share-profile-btn').addEventListener('click', shareProfile);
    el.querySelector('#avatar-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const badge = el.querySelector('.avatar-edit-badge');
      const reader = new FileReader();
      reader.onload = async () => {
        if (badge) badge.innerHTML = '…';
        try {
          const { user } = await api('PUT', '/api/me/avatar', { avatarDataUrl: reader.result });
          state.user = user;
          render();
        } catch (err) {
          state.error = err.message;
          render();
        }
      };
      reader.readAsDataURL(file);
    });
    el.querySelector('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const { user } = await api('PUT', '/api/me', {
          name: fd.get('name'),
          bio: fd.get('bio'),
          birthdayMonth: fd.get('birthdayMonth') || null,
          birthdayDay: fd.get('birthdayDay') || null,
        });
        state.user = user;
        render();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });
    el.querySelector('#logout-btn').addEventListener('click', async () => {
      await api('POST', '/api/logout');
      state.user = null;
      state.view = 'feed';
      render();
    });

    const gridWrap = el.querySelector('#my-moments-grid');
    if (state.myMoments === null) {
      gridWrap.innerHTML = '<div class="spinner-row">Loading…</div>';
    } else if (state.myMoments.length === 0) {
      gridWrap.innerHTML = `
        <div class="empty-state">
          <span class="emoji">✨</span>
          Nothing saved yet. Next time you spot something that feels like <em>you</em>, save it.
        </div>`;
    } else {
      gridWrap.appendChild(renderMomentsGrid(state.myMoments, { mode: 'own' }));
    }
    return el;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.openMoment) closeMomentModal();
  });

  // ---------------------------------------------------------------- boot
  async function boot() {
    try {
      const { user } = await api('GET', '/api/me');
      state.user = user;
    } catch {
      state.user = null;
    }
    state.loading = false;
    render();
    if (state.user) loadViewData('feed');
  }

  boot();
})();

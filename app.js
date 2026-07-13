/* =========================================================
   On Book — تطبيق كامل من جانب المتصفح (localStorage)
   لا يوجد خادم، ولا حسابات مطوّر خفية، ولا صلاحيات مخفية.
   ========================================================= */

/* ---------- تخزين ---------- */
const DB_KEYS = {
  USERS: "onbook_users",
  POSTS: "onbook_posts",
  REQUESTS: "onbook_friend_requests",
  FRIENDS: "onbook_friends",
  SESSION: "onbook_session",
};

function loadDB(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch (e) { return []; }
}
function saveDB(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    alert("تعذر الحفظ: مساحة التخزين المحلي ممتلئة. جرّب ملفًا أصغر.");
    return false;
  }
}

let users = loadDB(DB_KEYS.USERS);
let posts = loadDB(DB_KEYS.POSTS);
let friendRequests = loadDB(DB_KEYS.REQUESTS);
let friends = loadDB(DB_KEYS.FRIENDS);

function persistUsers() { saveDB(DB_KEYS.USERS, users); }
function persistPosts() { saveDB(DB_KEYS.POSTS, posts); }
function persistRequests() { saveDB(DB_KEYS.REQUESTS, friendRequests); }
function persistFriends() { saveDB(DB_KEYS.FRIENDS, friends); }

function getSession() {
  try { return JSON.parse(localStorage.getItem(DB_KEYS.SESSION)); }
  catch (e) { return null; }
}
function setSession(userId) { localStorage.setItem(DB_KEYS.SESSION, JSON.stringify({ userId })); }
function clearSession() { localStorage.removeItem(DB_KEYS.SESSION); }

/* ---------- أدوات مساعدة ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "الآن";
  if (diff < 3600) return Math.floor(diff / 60) + " د";
  if (diff < 86400) return Math.floor(diff / 3600) + " س";
  return Math.floor(diff / 86400) + " يوم";
}

// تنسيق بريد منطقي: username@domain.tld (يدعم gmail.com, hotmail.com, outlook.com, yahoo.com ...)
const EMAIL_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,63})@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;

function validateEmail(email) {
  if (!EMAIL_REGEX.test(email)) return false;
  const domain = email.split("@")[1].toLowerCase();
  const commonDomains = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com"];
  // نسمح بأي دومين صحيح شكليًا، لكن ننبه فقط لو لم يكن من القائمة الشائعة (تحسين تجربة لا حظر)
  return true;
}

// هاش بسيط لكلمة المرور عبر SHA-256 (Web Crypto) — لا نخزن كلمات المرور كنص واضح
async function hashPassword(password) {
  const enc = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function defaultAvatar(username) {
  const letter = (username || "?").trim().charAt(0).toUpperCase();
  const colors = ["#1877f2", "#42b72a", "#f02849", "#f7b928", "#8e44ad", "#16a085"];
  const color = colors[letter.charCodeAt(0) % colors.length];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>
    <rect width='100%' height='100%' fill='${color}'/>
    <text x='50%' y='55%' font-size='60' fill='#fff' text-anchor='middle' font-family='Arial' dy='.1em'>${letter}</text>
  </svg>`;
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

function getUserById(id) { return users.find(u => u.id === id); }

/* ---------- المصادقة ---------- */
async function registerUser({ username, email, password, bio }) {
  username = username.trim();
  email = email.trim().toLowerCase();

  if (username.length < 3) throw new Error("اسم المستخدم يجب أن يكون 3 أحرف على الأقل");
  if (!validateEmail(email)) throw new Error("صيغة البريد الإلكتروني غير صحيحة (مثال: user@gmail.com)");
  if (password.length < 6) throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase()))
    throw new Error("اسم المستخدم مستخدم من قبل");
  if (users.some(u => u.email === email))
    throw new Error("البريد الإلكتروني مستخدم من قبل");

  const passwordHash = await hashPassword(password);
  const user = {
    id: uid(),
    username,
    email,
    passwordHash,
    bio: bio || "",
    avatar: defaultAvatar(username),
    suspended: false,
    suspendReason: "",
    createdAt: Date.now(),
  };
  users.push(user);
  persistUsers();
  return user;
}

async function loginUser(identifier, password) {
  identifier = identifier.trim().toLowerCase();
  const user = users.find(u => u.username.toLowerCase() === identifier || u.email === identifier);
  if (!user) throw new Error("لا يوجد حساب بهذا الاسم أو البريد");

  if (user.suspended) throw new Error("هذا الحساب غير متوفر حاليًا");

  const passwordHash = await hashPassword(password);
  if (passwordHash !== user.passwordHash) throw new Error("كلمة المرور غير صحيحة");

  setSession(user.id);
  return user;
}

function logoutUser() { clearSession(); }

function currentUser() {
  const s = getSession();
  if (!s) return null;
  const u = getUserById(s.userId);
  if (!u || u.suspended) return null;
  return u;
}

/* ---------- المنشورات ---------- */
function createPost({ authorId, type, mediaDataUrl, caption }) {
  const post = {
    id: uid(),
    authorId,
    type, // "post" | "reel"
    mediaDataUrl: mediaDataUrl || null,
    caption: caption || "",
    likes: [],
    dislikes: [],
    comments: [],
    createdAt: Date.now(),
  };
  posts.unshift(post);
  persistPosts();
  return post;
}

function toggleLike(postId, userId) {
  const p = posts.find(x => x.id === postId);
  if (!p) return;
  p.dislikes = p.dislikes.filter(id => id !== userId);
  if (p.likes.includes(userId)) p.likes = p.likes.filter(id => id !== userId);
  else p.likes.push(userId);
  persistPosts();
}

function toggleDislike(postId, userId) {
  const p = posts.find(x => x.id === postId);
  if (!p) return;
  p.likes = p.likes.filter(id => id !== userId);
  if (p.dislikes.includes(userId)) p.dislikes = p.dislikes.filter(id => id !== userId);
  else p.dislikes.push(userId);
  persistPosts();
}

function addComment(postId, userId, text) {
  const p = posts.find(x => x.id === postId);
  if (!p || !text.trim()) return;
  p.comments.push({ id: uid(), userId, text: text.trim(), createdAt: Date.now() });
  persistPosts();
}

/* ---------- الصداقة ---------- */
function friendshipStatus(userId, otherId) {
  if (friends.some(f => (f.a === userId && f.b === otherId) || (f.a === otherId && f.b === userId)))
    return "friends";
  const sent = friendRequests.find(r => r.from === userId && r.to === otherId && r.status === "pending");
  if (sent) return "pending_sent";
  const received = friendRequests.find(r => r.from === otherId && r.to === userId && r.status === "pending");
  if (received) return "pending_received";
  return "none";
}

function sendFriendRequest(fromId, toId) {
  if (fromId === toId) return;
  if (friendshipStatus(fromId, toId) !== "none") return;
  friendRequests.push({ id: uid(), from: fromId, to: toId, status: "pending", createdAt: Date.now() });
  persistRequests();
}

function respondFriendRequest(requestId, accept) {
  const r = friendRequests.find(x => x.id === requestId);
  if (!r) return;
  r.status = accept ? "accepted" : "rejected";
  if (accept) {
    friends.push({ a: r.from, b: r.to });
    persistFriends();
  }
  persistRequests();
}

function pendingRequestsFor(userId) {
  return friendRequests.filter(r => r.to === userId && r.status === "pending");
}

/* ---------- التوجيه (Router) ---------- */
let route = { name: "auth", params: {} };

function navigate(name, params = {}) {
  route = { name, params };
  render();
}

/* ---------- العرض (Rendering) ---------- */
const app = document.getElementById("app");
const navbar = document.getElementById("navbar");
const modalRoot = document.getElementById("modalRoot");

function render() {
  const me = currentUser();

  if (!me) {
    navbar.classList.add("hidden");
    renderAuth();
    return;
  }

  navbar.classList.remove("hidden");
  document.getElementById("navAvatar").src = me.avatar;
  const reqCount = pendingRequestsFor(me.id).length;
  const badge = document.getElementById("friendReqCount");
  if (reqCount > 0) { badge.textContent = reqCount; badge.classList.remove("hidden"); }
  else badge.classList.add("hidden");

  if (route.name === "feed") renderFeed(me);
  else if (route.name === "profile") renderProfile(me, route.params.userId || me.id);
  else if (route.name === "requests") renderRequests(me);
  else renderFeed(me);
}

/* ----- صفحات الدخول/التسجيل ----- */
function renderAuth() {
  const mode = route.params.mode || "login";

  if (mode === "login") {
    app.innerHTML = `
      <div class="auth-wrapper">
        <div class="auth-box">
          <h1>On Book</h1>
          <p class="subtitle">تواصل مع أصدقائك بسهولة</p>
          <form id="loginForm">
            <div class="field">
              <label>اسم المستخدم أو البريد الإلكتروني</label>
              <input type="text" id="loginId" required placeholder="username أو username@gmail.com">
            </div>
            <div class="field">
              <label>كلمة المرور</label>
              <input type="password" id="loginPass" required>
            </div>
            <div class="field"><small class="err hidden" id="loginError"></small></div>
            <button type="submit" class="btn-primary">تسجيل الدخول</button>
          </form>
          <div class="switch-link">ليس لديك حساب؟ <a id="goRegister">أنشئ حسابًا جديدًا</a></div>
        </div>
      </div>`;

    document.getElementById("goRegister").onclick = () => navigate("auth", { mode: "register" });
    document.getElementById("loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const id = document.getElementById("loginId").value;
      const pass = document.getElementById("loginPass").value;
      const errEl = document.getElementById("loginError");
      try {
        await loginUser(id, pass);
        navigate("feed");
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove("hidden");
      }
    };
  } else {
    app.innerHTML = `
      <div class="auth-wrapper">
        <div class="auth-box">
          <h1>On Book</h1>
          <p class="subtitle">إنشاء حساب جديد</p>
          <form id="registerForm">
            <div class="field">
              <label>اسم المستخدم</label>
              <input type="text" id="regUsername" required minlength="3">
            </div>
            <div class="field">
              <label>البريد الإلكتروني</label>
              <input type="email" id="regEmail" required placeholder="username@gmail.com">
            </div>
            <div class="field">
              <label>كلمة المرور</label>
              <input type="password" id="regPass" required minlength="6">
            </div>
            <div class="field">
              <label>نبذة عنك (Bio)</label>
              <textarea id="regBio" rows="3" placeholder="اكتب شيئًا عن نفسك..."></textarea>
            </div>
            <div class="field"><small class="err hidden" id="registerError"></small></div>
            <button type="submit" class="btn-secondary">إنشاء الحساب</button>
          </form>
          <div class="switch-link">لديك حساب؟ <a id="goLogin">سجّل الدخول</a></div>
        </div>
      </div>`;

    document.getElementById("goLogin").onclick = () => navigate("auth", { mode: "login" });
    document.getElementById("registerForm").onsubmit = async (e) => {
      e.preventDefault();
      const errEl = document.getElementById("registerError");
      try {
        const user = await registerUser({
          username: document.getElementById("regUsername").value,
          email: document.getElementById("regEmail").value,
          password: document.getElementById("regPass").value,
          bio: document.getElementById("regBio").value,
        });
        setSession(user.id);
        navigate("feed");
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove("hidden");
      }
    };
  }
}

/* ----- الصفحة الرئيسية (الخلاصة) ----- */
function renderFeed(me) {
  if (posts.length === 0) {
    app.innerHTML = `<div class="feed-wrapper"><div class="card empty-state">لا توجد منشورات بعد. كن أول من ينشر!</div></div>`;
    return;
  }

  app.innerHTML = `<div class="feed-wrapper">${posts.map(p => postCardHTML(p, me)).join("")}</div>`;
  posts.forEach(p => wirePostCard(p, me));
}

function postCardHTML(post, me) {
  const author = getUserById(post.authorId);
  if (!author) return "";
  const liked = post.likes.includes(me.id);
  const disliked = post.dislikes.includes(me.id);

  const mediaHTML = post.mediaDataUrl
    ? (post.type === "reel"
        ? `<video class="post-media" src="${post.mediaDataUrl}" controls></video>`
        : `<img class="post-media" src="${post.mediaDataUrl}">`)
    : "";

  return `
    <div class="card" data-post="${post.id}">
      <div class="post-header">
        <img src="${author.avatar}" data-user="${author.id}">
        <div class="who" data-user="${author.id}">
          <div class="name">${escapeHTML(author.username)}</div>
          <div class="time">${timeAgo(post.createdAt)}</div>
        </div>
      </div>
      ${post.type === "reel" ? `<span class="reel-badge">ريل</span>` : ""}
      ${post.caption ? `<div class="post-caption">${escapeHTML(post.caption)}</div>` : ""}
      ${mediaHTML}
      <div class="stats-row">
        <span>${post.likes.length} لايك · ${post.dislikes.length} ديسلايك</span>
        <span>${post.comments.length} تعليق</span>
      </div>
      <div class="actions-row">
        <button class="like-btn ${liked ? "active" : ""}">👍 لايك</button>
        <button class="dislike-btn ${disliked ? "active dislike" : ""}">👎 ديسلايك</button>
        <button class="comment-toggle-btn">💬 تعليق</button>
      </div>
      <div class="comments-section hidden">
        ${post.comments.map(c => commentHTML(c)).join("")}
        <div class="comment-input-row">
          <input type="text" placeholder="اكتب تعليقًا...">
          <button class="send-comment-btn">إرسال</button>
        </div>
      </div>
    </div>`;
}

function commentHTML(c) {
  const u = getUserById(c.userId);
  if (!u) return "";
  return `
    <div class="comment">
      <img src="${u.avatar}">
      <div class="bubble">
        <div class="cname">${escapeHTML(u.username)}</div>
        <div>${escapeHTML(c.text)}</div>
      </div>
    </div>`;
}

function wirePostCard(post, me) {
  const card = document.querySelector(`[data-post="${post.id}"]`);
  if (!card) return;

  card.querySelectorAll("[data-user]").forEach(el => {
    el.onclick = () => navigate("profile", { userId: el.dataset.user });
  });

  card.querySelector(".like-btn").onclick = () => { toggleLike(post.id, me.id); render(); };
  card.querySelector(".dislike-btn").onclick = () => { toggleDislike(post.id, me.id); render(); };
  card.querySelector(".comment-toggle-btn").onclick = () => {
    card.querySelector(".comments-section").classList.toggle("hidden");
  };
  card.querySelector(".send-comment-btn").onclick = () => {
    const input = card.querySelector(".comment-input-row input");
    addComment(post.id, me.id, input.value);
    render();
  };
  card.querySelector(".comment-input-row input").onkeydown = (e) => {
    if (e.key === "Enter") card.querySelector(".send-comment-btn").click();
  };
}

/* ----- صفحة البروفايل ----- */
function renderProfile(me, userId) {
  const user = getUserById(userId);
  if (!user || user.suspended) {
    app.innerHTML = `<div class="suspended-banner">هذا الحساب غير متوفر حاليًا</div>`;
    return;
  }

  const isMe = user.id === me.id;
  const status = friendshipStatus(me.id, user.id);
  const userPosts = posts.filter(p => p.authorId === user.id);

  let actionBtn = "";
  if (!isMe) {
    if (status === "friends") actionBtn = `<button class="btn-small friend" disabled>أصدقاء ✓</button>`;
    else if (status === "pending_sent") actionBtn = `<button class="btn-small pending" disabled>تم إرسال الطلب</button>`;
    else if (status === "pending_received") actionBtn = `<button class="btn-small friend" id="acceptFromProfile">قبول طلب الصداقة</button>`;
    else actionBtn = `<button class="btn-small friend" id="addFriendBtn">إضافة صديق</button>`;
  }

  app.innerHTML = `
    <div class="feed-wrapper">
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="profile-cover"></div>
        <div class="profile-header">
          <img class="profile-avatar-big" src="${user.avatar}">
          <div class="profile-name-block">
            <h2>${escapeHTML(user.username)}</h2>
          </div>
        </div>
        <div class="profile-bio">${escapeHTML(user.bio || "لا توجد نبذة بعد.")}</div>
        <div class="profile-actions">${actionBtn}</div>
      </div>
      <div id="profilePosts">${userPosts.length ? userPosts.map(p => postCardHTML(p, me)).join("") : `<div class="card empty-state">لا توجد منشورات لهذا المستخدم.</div>`}</div>
    </div>`;

  userPosts.forEach(p => wirePostCard(p, me));

  const addBtn = document.getElementById("addFriendBtn");
  if (addBtn) addBtn.onclick = () => { sendFriendRequest(me.id, user.id); render(); };

  const acceptBtn = document.getElementById("acceptFromProfile");
  if (acceptBtn) acceptBtn.onclick = () => {
    const r = friendRequests.find(x => x.from === user.id && x.to === me.id && x.status === "pending");
    if (r) respondFriendRequest(r.id, true);
    render();
  };
}

/* ----- صفحة طلبات الصداقة ----- */
function renderRequests(me) {
  const reqs = pendingRequestsFor(me.id);
  app.innerHTML = `
    <div class="feed-wrapper">
      <div class="card">
        <h3 style="margin-bottom:10px;">طلبات الصداقة</h3>
        ${reqs.length === 0 ? `<div class="empty-state">لا توجد طلبات صداقة جديدة</div>` :
          reqs.map(r => {
            const u = getUserById(r.from);
            if (!u) return "";
            return `
              <div class="request-item">
                <img src="${u.avatar}">
                <div class="name">${escapeHTML(u.username)}</div>
                <button class="accept" data-req="${r.id}">قبول</button>
                <button class="reject" data-req="${r.id}">رفض</button>
              </div>`;
          }).join("")}
      </div>
    </div>`;

  document.querySelectorAll(".accept").forEach(btn => btn.onclick = () => { respondFriendRequest(btn.dataset.req, true); render(); });
  document.querySelectorAll(".reject").forEach(btn => btn.onclick = () => { respondFriendRequest(btn.dataset.req, false); render(); });
}

/* ----- المودالات: نشر منشور / ريل ----- */
function openModal(html) {
  modalRoot.innerHTML = `<div class="modal-overlay"><div class="modal-box">${html}</div></div>`;
  modalRoot.querySelector(".modal-overlay").onclick = (e) => {
    if (e.target.classList.contains("modal-overlay")) closeModal();
  };
}
function closeModal() { modalRoot.innerHTML = ""; }

function openCreatePostModal() {
  openModal(`
    <button class="modal-close" id="closeModalBtn">×</button>
    <h3>نشر منشور جديد</h3>
    <div class="field">
      <label>صورة (اختياري)</label>
      <input type="file" id="postImageInput" accept="image/*">
    </div>
    <img id="postPreview" class="preview-media hidden">
    <div class="field">
      <label>ماذا يدور في ذهنك؟</label>
      <textarea id="postCaption" rows="4" placeholder="اكتب منشورك..."></textarea>
    </div>
    <small class="err hidden" id="postError"></small>
    <button class="btn-primary" id="submitPostBtn">نشر</button>
  `);

  let mediaDataUrl = null;
  document.getElementById("closeModalBtn").onclick = closeModal;
  document.getElementById("postImageInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showModalError("postError", "الملف يجب أن يكون صورة");
      return;
    }
    mediaDataUrl = await fileToDataURL(file);
    const preview = document.getElementById("postPreview");
    preview.src = mediaDataUrl;
    preview.classList.remove("hidden");
  };

  document.getElementById("submitPostBtn").onclick = () => {
    const caption = document.getElementById("postCaption").value.trim();
    if (!caption && !mediaDataUrl) {
      showModalError("postError", "أضف نصًا أو صورة على الأقل");
      return;
    }
    const me = currentUser();
    createPost({ authorId: me.id, type: "post", mediaDataUrl, caption });
    closeModal();
    navigate("feed");
  };
}

function openCreateReelModal() {
  openModal(`
    <button class="modal-close" id="closeModalBtn">×</button>
    <h3>نشر ريل جديد</h3>
    <div class="field">
      <label>فيديو (بحد أقصى 11 ميغابايت)</label>
      <input type="file" id="reelVideoInput" accept="video/*">
    </div>
    <video id="reelPreview" class="preview-media hidden" controls></video>
    <div class="field">
      <label>وصف الريل (اختياري)</label>
      <textarea id="reelCaption" rows="3"></textarea>
    </div>
    <small class="err hidden" id="reelError"></small>
    <button class="btn-primary" id="submitReelBtn">نشر الريل</button>
  `);

  const MAX_BYTES = 11 * 1024 * 1024; // 11MB
  let mediaDataUrl = null;

  document.getElementById("closeModalBtn").onclick = closeModal;
  document.getElementById("reelVideoInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      showModalError("reelError", "الملف يجب أن يكون فيديو");
      return;
    }
    if (file.size > MAX_BYTES) {
      showModalError("reelError", "حجم الفيديو يتجاوز 11 ميغابايت");
      e.target.value = "";
      return;
    }
    try {
      mediaDataUrl = await fileToDataURL(file);
    } catch (err) {
      showModalError("reelError", "تعذر قراءة الملف");
      return;
    }
    const preview = document.getElementById("reelPreview");
    preview.src = mediaDataUrl;
    preview.classList.remove("hidden");
  };

  document.getElementById("submitReelBtn").onclick = () => {
    if (!mediaDataUrl) {
      showModalError("reelError", "اختر فيديو أولاً");
      return;
    }
    const me = currentUser();
    const ok = createPost({ authorId: me.id, type: "reel", mediaDataUrl, caption: document.getElementById("reelCaption").value.trim() });
    closeModal();
    navigate("feed");
  };
}

function showModalError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove("hidden");
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- ربط عناصر الشريط العلوي ---------- */
document.getElementById("homeBtn").onclick = () => navigate("feed");
document.getElementById("friendReqBtn").onclick = () => navigate("requests");
document.getElementById("createPostBtn").onclick = () => openCreatePostModal();
document.getElementById("createReelBtn").onclick = () => openCreateReelModal();
document.getElementById("goToMyProfile").onclick = () => {
  const me = currentUser();
  document.getElementById("profileDropdown").classList.add("hidden");
  navigate("profile", { userId: me.id });
};
document.getElementById("logoutBtn").onclick = () => {
  logoutUser();
  navigate("auth", { mode: "login" });
};
document.getElementById("navAvatar").onclick = () => {
  document.getElementById("profileDropdown").classList.toggle("hidden");
};

/* بحث عن مستخدمين */
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
searchInput.oninput = () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { searchResults.classList.add("hidden"); return; }
  const me = currentUser();
  const matches = users.filter(u =>
    !u.suspended && u.id !== (me && me.id) && u.username.toLowerCase().includes(q)
  ).slice(0, 8);

  if (matches.length === 0) { searchResults.classList.add("hidden"); return; }

  searchResults.innerHTML = matches.map(u =>
    `<div class="result-item" data-user="${u.id}"><img src="${u.avatar}"><span>${escapeHTML(u.username)}</span></div>`
  ).join("");
  searchResults.classList.remove("hidden");

  searchResults.querySelectorAll(".result-item").forEach(el => {
    el.onclick = () => {
      navigate("profile", { userId: el.dataset.user });
      searchInput.value = "";
      searchResults.classList.add("hidden");
    };
  });
};

document.addEventListener("click", (e) => {
  if (!e.target.closest(".nav-center")) searchResults.classList.add("hidden");
  if (!e.target.closest(".profile-menu") && e.target.id !== "navAvatar" && !e.target.closest("#profileDropdown"))
    document.getElementById("profileDropdown").classList.add("hidden");
});

/* ---------- بدء التشغيل ---------- */
render();

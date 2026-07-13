// app.js
/* =========================================================
   On Book — بدون تسجيل دخول
   مستخدم افتراضي يُنشأ تلقائياً من الخادم
   البيانات تُحفظ في قاعدة بيانات خارجية بسيطة على السيرفر
   ========================================================= */

const API_BASE = "/api";

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

/* ---------- بيانات التطبيق ---------- */
let users = [];
let posts = [];
let friendRequests = [];
let friends = [];
let activeUser = null;
let route = { name: "feed", params: {} };

const app = document.getElementById("app");
const navbar = document.getElementById("navbar");
const modalRoot = document.getElementById("modalRoot");

/* ---------- أدوات ---------- */
function uid() {
  return crypto.randomUUID();
}

function randomUserCode(length = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "الآن";
  if (diff < 3600) return Math.floor(diff / 60) + " د";
  if (diff < 86400) return Math.floor(diff / 3600) + " س";
  return Math.floor(diff / 86400) + " يوم";
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

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getUserById(id) {
  return users.find(u => u.id === id);
}

function currentUser() {
  return activeUser;
}

function persistUsers() { return api("/users", { method: "PUT", body: JSON.stringify(users) }); }
function persistPosts() { return api("/posts", { method: "PUT", body: JSON.stringify(posts) }); }
function persistRequests() { return api("/friend-requests", { method: "PUT", body: JSON.stringify(friendRequests) }); }
function persistFriends() { return api("/friends", { method: "PUT", body: JSON.stringify(friends) }); }

/* ---------- تحميل البيانات ---------- */
async function loadAllData() {
  const data = await api("/bootstrap");
  activeUser = data.me;
  users = data.users || [];
  posts = data.posts || [];
  friendRequests = data.friendRequests || [];
  friends = data.friends || [];

  const avatar = document.getElementById("navAvatar");
  if (avatar) avatar.src = activeUser?.avatar || defaultAvatar("U");

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.classList.add("hidden");
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

  friendRequests.push({
    id: uid(),
    from: fromId,
    to: toId,
    status: "pending",
    createdAt: Date.now()
  });
  void persistRequests();
}

function respondFriendRequest(requestId, accept) {
  const r = friendRequests.find(x => x.id === requestId);
  if (!r) return;

  r.status = accept ? "accepted" : "rejected";
  if (accept) {
    friends.push({ a: r.from, b: r.to });
    void persistFriends();
  }
  void persistRequests();
}

function pendingRequestsFor(userId) {
  return friendRequests.filter(r => r.to === userId && r.status === "pending");
}

/* ---------- المنشورات ---------- */
function createPost({ authorId, type, mediaDataUrl, caption }) {
  const post = {
    id: uid(),
    authorId,
    type, // post | reel
    mediaDataUrl: mediaDataUrl || null,
    caption: caption || "",
    likes: [],
    dislikes: [],
    comments: [],
    createdAt: Date.now()
  };
  posts.unshift(post);
  void persistPosts();
  return post;
}

function toggleLike(postId, userId) {
  const p = posts.find(x => x.id === postId);
  if (!p) return;

  p.dislikes = p.dislikes.filter(id => id !== userId);
  if (p.likes.includes(userId)) p.likes = p.likes.filter(id => id !== userId);
  else p.likes.push(userId);

  void persistPosts();
}

function toggleDislike(postId, userId) {
  const p = posts.find(x => x.id === postId);
  if (!p) return;

  p.likes = p.likes.filter(id => id !== userId);
  if (p.dislikes.includes(userId)) p.dislikes = p.dislikes.filter(id => id !== userId);
  else p.dislikes.push(userId);

  void persistPosts();
}

function addComment(postId, userId, text) {
  const p = posts.find(x => x.id === postId);
  if (!p || !text.trim()) return;

  p.comments.push({
    id: uid(),
    userId,
    text: text.trim(),
    createdAt: Date.now()
  });

  void persistPosts();
}

/* ---------- التنقل ---------- */
function navigate(name, params = {}) {
  route = { name, params };
  render();
}

/* ---------- العرض ---------- */
function render() {
  const me = currentUser();
  if (!me) return;

  navbar.classList.remove("hidden");
  const navAvatar = document.getElementById("navAvatar");
  if (navAvatar) navAvatar.src = me.avatar || defaultAvatar(me.username);

  const reqCount = pendingRequestsFor(me.id).length;
  const badge = document.getElementById("friendReqCount");
  if (badge) {
    if (reqCount > 0) {
      badge.textContent = reqCount;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  if (route.name === "profile") renderProfile(me, route.params.userId || me.id);
  else if (route.name === "requests") renderRequests(me);
  else renderFeed(me);
}

/* ---------- الصفحة الرئيسية ---------- */
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

  const likeBtn = card.querySelector(".like-btn");
  const dislikeBtn = card.querySelector(".dislike-btn");
  const toggleCommentsBtn = card.querySelector(".comment-toggle-btn");
  const sendCommentBtn = card.querySelector(".send-comment-btn");
  const commentInput = card.querySelector(".comment-input-row input");
  const commentsSection = card.querySelector(".comments-section");

  likeBtn.onclick = () => { toggleLike(post.id, me.id); render(); };
  dislikeBtn.onclick = () => { toggleDislike(post.id, me.id); render(); };
  toggleCommentsBtn.onclick = () => commentsSection.classList.toggle("hidden");

  sendCommentBtn.onclick = () => {
    addComment(post.id, me.id, commentInput.value);
    render();
  };

  commentInput.onkeydown = (e) => {
    if (e.key === "Enter") sendCommentBtn.click();
  };
}

/* ---------- البروفايل ---------- */
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
      <div id="profilePosts">
        ${userPosts.length ? userPosts.map(p => postCardHTML(p, me)).join("") : `<div class="card empty-state">لا توجد منشورات لهذا المستخدم.</div>`}
      </div>
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

/* ---------- طلبات الصداقة ---------- */
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

  document.querySelectorAll(".accept").forEach(btn => {
    btn.onclick = () => { respondFriendRequest(btn.dataset.req, true); render(); };
  });

  document.querySelectorAll(".reject").forEach(btn => {
    btn.onclick = () => { respondFriendRequest(btn.dataset.req, false); render(); };
  });
}

/* ---------- المودالات ---------- */
function openModal(html) {
  modalRoot.innerHTML = `<div class="modal-overlay"><div class="modal-box">${html}</div></div>`;
  modalRoot.querySelector(".modal-overlay").onclick = (e) => {
    if (e.target.classList.contains("modal-overlay")) closeModal();
  };
}

function closeModal() {
  modalRoot.innerHTML = "";
}

function showModalError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

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

  document.getElementById("submitPostBtn").onclick = async () => {
    const caption = document.getElementById("postCaption").value.trim();
    if (!caption && !mediaDataUrl) {
      showModalError("postError", "أضف نصًا أو صورة على الأقل");
      return;
    }

    const me = currentUser();
    createPost({ authorId: me.id, type: "post", mediaDataUrl, caption });
    await persistPosts();
    closeModal();
    render();
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

  const MAX_BYTES = 11 * 1024 * 1024;
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
    } catch {
      showModalError("reelError", "تعذر قراءة الملف");
      return;
    }

    const preview = document.getElementById("reelPreview");
    preview.src = mediaDataUrl;
    preview.classList.remove("hidden");
  };

  document.getElementById("submitReelBtn").onclick = async () => {
    if (!mediaDataUrl) {
      showModalError("reelError", "اختر فيديو أولاً");
      return;
    }

    const me = currentUser();
    createPost({
      authorId: me.id,
      type: "reel",
      mediaDataUrl,
      caption: document.getElementById("reelCaption").value.trim()
    });

    await persistPosts();
    closeModal();
    render();
  };
}

/* ---------- الشريط العلوي ---------- */
document.getElementById("homeBtn").onclick = () => navigate("feed");
document.getElementById("friendReqBtn").onclick = () => navigate("requests");
document.getElementById("createPostBtn").onclick = () => openCreatePostModal();
document.getElementById("createReelBtn").onclick = () => openCreateReelModal();

document.getElementById("goToMyProfile").onclick = () => {
  const me = currentUser();
  document.getElementById("profileDropdown").classList.add("hidden");
  navigate("profile", { userId: me.id });
};

const navAvatar = document.getElementById("navAvatar");
navAvatar.onclick = () => {
  document.getElementById("profileDropdown").classList.toggle("hidden");
};

/* ---------- البحث ---------- */
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

searchInput.oninput = () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    searchResults.classList.add("hidden");
    return;
  }

  const me = currentUser();
  const matches = users.filter(u =>
    !u.suspended && u.id !== me.id && u.username.toLowerCase().includes(q)
  ).slice(0, 8);

  if (matches.length === 0) {
    searchResults.classList.add("hidden");
    return;
  }

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
  if (!e.target.closest("#profileDropdown") && e.target.id !== "navAvatar")
    document.getElementById("profileDropdown").classList.add("hidden");
});

/* ---------- التشغيل ---------- */
(async function init() {
  try {
    await loadAllData();
    navigate("feed");
  } catch (err) {
    app.innerHTML = `<div class="feed-wrapper"><div class="card empty-state">حدث خطأ في تحميل البيانات: ${escapeHTML(err.message)}</div></div>`;
  }
})();

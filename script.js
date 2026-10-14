
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  orderBy,
  getDocs,
  limit
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// ===== Firebase Configuration =====

const firebaseConfig = {
  apiKey: "AIzaSyAAhOyR-mnBi-92V-yrVJbRDngJ51ymg8w",
  authDomain: "chatvibe-c7c4c.firebaseapp.com",
  projectId: "chatvibe-c7c4c",
  storageBucket: "chatvibe-c7c4c.firebasestorage.app",
  messagingSenderId: "176638215379",
  appId: "1:176638215379:web:7bd9ac04ebe6aab5bb4026"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

const status = (message) => {
  const element = $("status");
  if (element) element.textContent = message;
};

const usernameKey = (username) =>
  (username || "").trim().toLowerCase();

const authEmailForUsername = (username) =>
  `${usernameKey(username)}@chatvibe.app`;

const validUsername = (username) =>
  /^[a-z0-9._]{3,20}$/.test(username);

const chatIdFor = (a, b) =>
  [a, b].sort().join("_");

const displayUsername = (email) =>
  email?.split("@")[0] || "User";

// ===== Application State =====

let currentUser = null;
let currentUsername = "";
let activeChat = null;
let activeFriendId = null;

let unsubscribeChats = null;
let unsubscribeMessages = null;
let unsubscribePresence = null;

let presenceTimer = null;
let selectedImageData = null;

// ===== Cute Themes 🎀 =====

const themeNames = [
  "theme-pink",
  "theme-lavender",
  "theme-peach",
  "theme-mint"
];

function applyTheme(theme, save = true) {
  if (!themeNames.includes(theme)) {
    theme = "theme-lavender";
  }

  document.body.classList.remove(...themeNames);
  document.body.classList.add(theme);

  document.querySelectorAll(".theme-btn").forEach((button) => {
    const selected = button.dataset.theme === theme;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  if (save) {
    localStorage.setItem("chatvibe_theme", theme);
  }
}

document.querySelectorAll(".theme-btn").forEach((button) => {
  button.addEventListener("click", () => {
    applyTheme(button.dataset.theme);
    status("Your cute theme has been changed! 🎀");
  });
});

applyTheme(
  localStorage.getItem("chatvibe_theme") || "theme-lavender",
  false
);

// ===== Emoji Picker 😊 =====

const emojiBtn = $("emojiBtn");
const emojiPicker = $("emojiPicker");
const messageInput = $("messageInput");

if (emojiBtn && emojiPicker && messageInput) {
  emojiBtn.addEventListener("click", (event) => {
    event.stopPropagation();

    if (!messageInput.disabled) {
      emojiPicker.hidden = !emojiPicker.hidden;
    }
  });

  emojiPicker.addEventListener("click", (event) => {
    const button = event.target.closest(".emoji-option");

    if (!button || messageInput.disabled) return;

    const start = messageInput.selectionStart;
    const end = messageInput.selectionEnd;
    const value = messageInput.value;
    const emoji = button.textContent;

    messageInput.value =
      value.slice(0, start) + emoji + value.slice(end);

    const position = start + emoji.length;

    messageInput.focus();
    messageInput.setSelectionRange(position, position);
    emojiPicker.hidden = true;
  });

  document.addEventListener("click", (event) => {
    if (
      !emojiPicker.contains(event.target) &&
      !emojiBtn.contains(event.target)
    ) {
      emojiPicker.hidden = true;
    }
  });
}

// ===== Signup 🌷 =====

$("signupBtn").onclick = async () => {
  const username = usernameKey($("username").value);
  const password = $("password").value;
  const confirmPassword = $("confirmPassword").value;

  if ($("confirmPassword").classList.contains("hidden")) {
    $("confirmPassword").classList.remove("hidden");
    $("password").setAttribute("autocomplete", "new-password");
    status("Enter your password again to confirm 💗");
    return;
  }

  if (!validUsername(username)) {
    status("Username must be 3-20 characters: letters, numbers, dots or underscores.");
    return;
  }

  if (password.length < 6) {
    status("Password must contain at least 6 characters.");
    return;
  }

  if (password !== confirmPassword) {
    status("Passwords do not match 💕");
    return;
  }

  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      authEmailForUsername(username),
      password
    );

    await setDoc(doc(db, "users", credential.user.uid), {
      username,
      email: credential.user.email,
      online: true,
      lastActive: serverTimestamp(),
      createdAt: serverTimestamp()
    });

    $("confirmPassword").value = "";
    $("confirmPassword").classList.add("hidden");

    status("Account created! Welcome to ChatVibe 💜");
  } catch (error) {
    console.error("Signup error:", error);

    if (error.code === "auth/email-already-in-use") {
      status("Username already taken. Try another one.");
    } else {
      status("Signup error: " + error.code);
    }
  }
};

// ===== Login 💌 =====

$("loginBtn").onclick = async () => {
  const username = usernameKey($("username").value);
  const password = $("password").value;

  if (!validUsername(username)) {
    status("Enter a valid username.");
    return;
  }

  if (!password) {
    status("Please enter your password.");
    return;
  }

  try {
    await signInWithEmailAndPassword(
      auth,
      authEmailForUsername(username),
      password
    );

    status("Welcome back! 💗");
  } catch (error) {
    console.error("Login error:", error);
    status("Login failed. Check your username and password.");
  }
};

// ===== Online / Offline Presence 🟢 =====

// IMPORTANT: Keep only this one updatePresence function.

async function updatePresence(isOnline) {
  if (!currentUser) return;

  const userRef = doc(db, "users", currentUser.uid);

  const fields = {
    online: isOnline,
    lastActive: serverTimestamp()
  };

  if (!isOnline) {
    fields.lastSeen = serverTimestamp();
  }

  try {
    // Merge preserves existing email and username profile fields.
    await setDoc(userRef, fields, { merge: true });
  } catch (error) {
    console.error("Presence update failed:", error);
  }
}

function startPresence() {
  clearInterval(presenceTimer);

  updatePresence(true);

  presenceTimer = setInterval(() => {
    if (currentUser) {
      updatePresence(true);
    }
  }, 45000);
}

function stopPresence() {
  clearInterval(presenceTimer);
  presenceTimer = null;

  if (currentUser) {
    updatePresence(false);
  }
}

window.addEventListener("pagehide", () => {
  if (!currentUser) return;

  const userRef = doc(db, "users", currentUser.uid);

  setDoc(userRef, {
    online: false,
    lastSeen: serverTimestamp(),
    lastActive: serverTimestamp()
  }, { merge: true }).catch((error) => {
    console.warn("Page-close presence update failed:", error);
  });
});

// ===== Authentication State =====

onAuthStateChanged(auth, async (user) => {
  if (unsubscribeChats) unsubscribeChats();
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribePresence) unsubscribePresence();

  unsubscribeChats = null;
  unsubscribeMessages = null;
  unsubscribePresence = null;

  clearInterval(presenceTimer);
  presenceTimer = null;

  currentUser = user;
  currentUsername = "";
  activeChat = null;
  activeFriendId = null;
  selectedImageData = null;

  $("authView").classList.toggle("hidden", !!user);
  $("chatView").classList.toggle("hidden", !user);

  $("conversationList").replaceChildren();
  $("messages").replaceChildren();
  $("threadTitle").textContent = "Choose a conversation 🌸";
  $("friendPresence").textContent = "💌 Select a friend to chat";

  $("messageInput").disabled = true;
  $("sendBtn").disabled = true;
  $("emojiBtn").disabled = true;
  $("chatPhotoInput").disabled = true;
  $("emojiPicker").hidden = true;
  $("imagePreview").classList.add("hidden");

  if (!user) {
    $("myPresence").textContent = "";
    return;
  }

  try {
    const profileRef = doc(db, "users", user.uid);
    const profileSnapshot = await getDoc(profileRef);

    if (profileSnapshot.exists()) {
      currentUsername =
        profileSnapshot.data().username || displayUsername(user.email);
    } else {
      currentUsername = displayUsername(user.email);

      await setDoc(profileRef, {
        username: currentUsername,
        email: user.email,
        online: false
      }, { merge: true });
    }

    $("myUsername").textContent = "@" + currentUsername;
    $("myPresence").textContent = "🟢 Online";

    startPresence();

    const chatsQuery = query(
      collection(db, "chats"),
      where("members", "array-contains", user.uid)
    );

    unsubscribeChats = onSnapshot(
      chatsQuery,
      (snapshot) => {
        $("conversationList").replaceChildren();

        snapshot.forEach((chat) => {
          const data = chat.data();
          const members = data.members || [];
          const friendId = members.find((id) => id !== user.uid);

          const names = data.memberUsernames || [];
          const friendUsername =
            names.find((name) =>
              usernameKey(name) !== currentUsername
            ) || "Friend";

          const button = document.createElement("button");
          button.className =
            "conversation" +
            (activeChat === chat.id ? " active" : "");

          button.textContent = "💌 @" + friendUsername;

          button.onclick = () => {
            openChat(chat.id, friendUsername, friendId);
          };

          $("conversationList").append(button);
        });
      },
      (error) => {
        console.error("Conversations error:", error);
        status("Conversations error: " + error.message);
      }
    );
  } catch (error) {
    console.error("Profile setup error:", error);
    status("Profile setup error: " + error.message);
  }
});

// ===== Start Chat Using Username =====

$("startBtn").onclick = async () => {
  const friendUsername = usernameKey($("friendUsername").value);

  if (!currentUser) {
    status("Please log in first.");
    return;
  }

  if (!validUsername(friendUsername)) {
    status("Enter a valid friend's username.");
    return;
  }

  if (friendUsername === currentUsername) {
    status("You cannot chat with yourself.");
    return;
  }

  try {
    const results = await getDocs(query(
      collection(db, "users"),
      where("username", "==", friendUsername),
      limit(1)
    ));

    if (results.empty) {
      status("Username not found. Ask your friend to sign up.");
      return;
    }

    const friendDoc = results.docs[0];
    const friendId = friendDoc.id;
    const friendProfile = friendDoc.data();

    if (friendId === currentUser.uid) {
      status("You cannot chat with yourself.");
      return;
    }

    const chatId = chatIdFor(currentUser.uid, friendId);
    const chatRef = doc(db, "chats", chatId);
    const chatSnapshot = await getDoc(chatRef);

    if (!chatSnapshot.exists()) {
      const members = [currentUser.uid, friendId].sort();

      const usernameByUid = {
        [currentUser.uid]: currentUsername,
        [friendId]: friendProfile.username
      };

      const emailByUid = {
        [currentUser.uid]: currentUser.email,
        [friendId]: friendProfile.email
      };

      await setDoc(chatRef, {
        members,
        memberEmails: members.map((id) => emailByUid[id]),
        memberUsernames: members.map((id) => usernameByUid[id]),
        createdAt: serverTimestamp()
      });
    }

    $("friendUsername").value = "";
    openChat(chatId, friendProfile.username, friendId);
    status("Chat ready! 💗");
  } catch (error) {
    console.error("Start chat error:", error);
    status("Start chat error: " + error.code);
  }
};

// ===== Friend Online / Last Seen =====

function listenToFriendPresence(friendId) {
  if (unsubscribePresence) unsubscribePresence();
  unsubscribePresence = null;

  if (!friendId) {
    $("friendPresence").textContent = "Status unavailable";
    return;
  }

  $("friendPresence").textContent = "Checking status…";

  unsubscribePresence = onSnapshot(
    doc(db, "users", friendId),
    (snapshot) => {
      if (!snapshot.exists()) {
        $("friendPresence").textContent = "Status unavailable";
        return;
      }

      const data = snapshot.data();
      const lastActive = data.lastActive?.toDate?.();
      const lastSeen = data.lastSeen?.toDate?.();

      const recentlyActive = lastActive &&
        Date.now() - lastActive.getTime() < 90000;

      if (data.online === true && recentlyActive) {
        $("friendPresence").textContent = "🟢 Online now";
      } else if (lastSeen) {
        $("friendPresence").textContent =
          "Last seen " +
          lastSeen.toLocaleString([], {
            dateStyle: "short",
            timeStyle: "short"
          });
      } else if (lastActive) {
        $("friendPresence").textContent =
          "Last active " +
          lastActive.toLocaleString([], {
            dateStyle: "short",
            timeStyle: "short"
          });
      } else {
        $("friendPresence").textContent = "Status unavailable";
      }
    },
    (error) => {
      console.error("Presence listener error:", error);
      $("friendPresence").textContent = "Status unavailable";
    }
  );
}

// ===== Open Chat =====

function openChat(id, friendUsername, friendId = null) {
  if (unsubscribeMessages) unsubscribeMessages();

  activeChat = id;
  activeFriendId = friendId;

  $("threadTitle").textContent = "@" + friendUsername + " 🌸";
  $("messageInput").disabled = false;
  $("sendBtn").disabled = false;
  $("emojiBtn").disabled = false;
  $("chatPhotoInput").disabled = false;
  $("emojiPicker").hidden = true;

  $("messages").replaceChildren();
  clearSelectedImage();

  listenToFriendPresence(friendId);

  document.querySelectorAll(".conversation").forEach((button) => {
    button.classList.toggle(
      "active",
      button.textContent.trim() === "💌 @" + friendUsername
    );
  });

  const messagesQuery = query(
    collection(db, "chats", id, "messages"),
    orderBy("createdAt", "asc")
  );

  unsubscribeMessages = onSnapshot(
    messagesQuery,
    (snapshot) => {
      $("messages").replaceChildren();

      snapshot.forEach((item) => {
        const data = item.data();
        const bubble = document.createElement("div");

        bubble.className =
          "message " +
          (data.senderId === currentUser?.uid ? "mine" : "theirs");

        if (data.text) {
          const text = document.createElement("span");
          text.textContent = data.text;
          bubble.appendChild(text);
        }

        if (data.imageData) {
          const image = document.createElement("img");
          image.src = data.imageData;
          image.alt = "Shared chat photo";
          image.loading = "lazy";
          image.style.display = "block";
          image.style.maxWidth = "100%";
          image.style.maxHeight = "280px";
          image.style.objectFit = "contain";
          image.style.borderRadius = "12px";
          image.style.marginTop = data.text ? "8px" : "0";
          bubble.appendChild(image);
        }

        const time = document.createElement("small");

        time.textContent = data.createdAt?.toDate
          ? data.createdAt.toDate().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            })
          : "Sending…";

        bubble.appendChild(time);
        $("messages").appendChild(bubble);
      });

      $("messages").scrollTop = $("messages").scrollHeight;
    },
    (error) => {
      console.error("Messages error:", error);
      status("Messages error: " + error.message);
    }
  );
}

// ===== Compress Images for Firestore 📸 =====

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please select an image file."));
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("Choose a photo smaller than 8 MB."));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () =>
      reject(new Error("Could not read the photo."));

    reader.onload = () => {
      const image = new Image();

      image.onerror = () =>
        reject(new Error("Invalid image file."));

      image.onload = () => {
        const maxDimension = 700;
        const scale = Math.min(
          1,
          maxDimension / Math.max(image.width, image.height)
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Image processing is unavailable."));
          return;
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.55);

        if (dataUrl.length > 650000) {
          reject(new Error(
            "Photo is too large after compression. Choose another photo."
          ));
          return;
        }

        resolve(dataUrl);
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

// ===== Chat Photo Preview =====

const chatPhotoInput = $("chatPhotoInput");

chatPhotoInput.addEventListener("change", async () => {
  const file = chatPhotoInput.files?.[0];
  if (!file) return;

  try {
    status("Preparing your photo... 📸");

    selectedImageData = await compressImage(file);

    $("previewImage").src = selectedImageData;
    $("imagePreview").classList.remove("hidden");

    status("Photo ready to send! 💗");
  } catch (error) {
    selectedImageData = null;
    $("imagePreview").classList.add("hidden");
    status(error.message);
  }
});

function clearSelectedImage() {
  selectedImageData = null;
  chatPhotoInput.value = "";
  $("previewImage").removeAttribute("src");
  $("imagePreview").classList.add("hidden");
}

$("cancelImageBtn").addEventListener("click", clearSelectedImage);

// ===== Send Text or Photo 💌 =====

$("messageForm").onsubmit = async (event) => {
  event.preventDefault();

  const text = $("messageInput").value.trim();

  if (!currentUser || !activeChat) {
    status("Choose a conversation first.");
    return;
  }

  if (!text && !selectedImageData) return;

  const sendButton = $("sendBtn");
  sendButton.disabled = true;

  try {
    const message = {
      text,
      senderId: currentUser.uid,
      createdAt: serverTimestamp()
    };

    if (selectedImageData) {
      message.imageData = selectedImageData;
    }

    await addDoc(
      collection(db, "chats", activeChat, "messages"),
      message
    );

    $("messageInput").value = "";
    clearSelectedImage();
    $("emojiPicker").hidden = true;

    status("Message sent! 💗");
  } catch (error) {
    console.error("Send message error:", error);
    status("Send failed: " + error.code);
  } finally {
    sendButton.disabled = !activeChat;
  }
};

// ===== Profile Photo: This Device Only 📷 =====

const photoInput = $("photoInput");
const myPhoto = $("myPhoto");

try {
  const savedPhoto = localStorage.getItem("chatvibe_profile_photo");
  if (savedPhoto) myPhoto.src = savedPhoto;
} catch {
  // Browser storage may be unavailable.
}

photoInput.addEventListener("change", async () => {
  const file = photoInput.files?.[0];
  if (!file) return;

  try {
    const dataUrl = await compressImage(file);

    try {
      localStorage.setItem("chatvibe_profile_photo", dataUrl);
    } catch {
      status("Photo updated, but could not be saved locally.");
    }

    myPhoto.src = dataUrl;
    status("Profile photo updated! 💗");
  } catch (error) {
    status(error.message);
  } finally {
    photoInput.value = "";
  }
});

// ===== Logout =====

$("logoutBtn").onclick = async () => {
  try {
    await updatePresence(false);
    clearInterval(presenceTimer);
    presenceTimer = null;

    await signOut(auth);
    status("Logged out successfully 💜");
  } catch (error) {
    console.error("Logout error:", error);
    status("Logout error: " + error.message);
  }
};

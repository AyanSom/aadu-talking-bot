let recognition;
let isSpeaking = false;
let childName = "";
let topic = "";
let selectedBook = "";
let endTimeout = null;
let listening = false;
let isTimeoutMode = false;
let audioWarmupDone = false;
let greetingDone = false;

window.onload = () => {
  document.getElementById("topic").addEventListener("change", async () => {
    const topicVal = document.getElementById("topic").value;
    const bookOptionsDiv = document.getElementById("bookOptions");
    bookOptionsDiv.innerHTML = "";
    bookOptionsDiv.style.display = topicVal === "Books" ? "block" : "none";

    if (topicVal === "Books") {
      const res = await fetch("/books");
      const data = await res.json();
      data.books.forEach((book, idx) => {
        const id = `book${idx}`;
        const label = document.createElement("label");
        label.innerHTML = `
          <input type="radio" name="bookSelect" id="${id}" value="${book}" ${idx === 0 ? "checked" : ""}>
          ${book.replace(".pdf", "")}
        `;
        bookOptionsDiv.appendChild(label);
        bookOptionsDiv.appendChild(document.createElement("br"));
      });
    }
  });

  document.getElementById("startForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    childName = document.getElementById("childName").value.trim();
    topic = document.getElementById("topic").value;
    const selected = document.querySelector("input[name='bookSelect']:checked");
    selectedBook = selected ? selected.value : "Gruffalo.pdf";

    await fetch("/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        child_name: childName,
        topic,
        book_name: selectedBook,
        language: document.getElementById("language").value
      })
    });

    document.getElementById("startScreen").classList.remove("active");
    document.getElementById("sessionScreen").classList.add("active");
    document.getElementById("bookOptions").style.display = "none";
    document.getElementById("pageHeading").innerText = `${childName} & Tina Aunty's Learning`;
    document.getElementById("sessionTitle").innerText = `Yay! Let's learn ${topic}, ${childName}`;

   
    if (topic === "Books") {
      document.getElementById("pdfViewer").src = `/pdf/${selectedBook}`;
      document.getElementById("pdfContainer").style.display = "block";
      document.getElementById("pdfContainer").style.position = "relative";
      document.getElementById("pdfContainer").style.height = "50vh";
      document.getElementById("whiteboard").style.display = "block";
      document.getElementById("micControls").style.display = "flex";
    } else {
      document.getElementById("whiteboard").style.display = "block";
    }

    setupRecognition();
  });

  document.getElementById("minimizeBtn").addEventListener("click", () => {
    document.getElementById("pdfContainer").style.display = "none";
    document.getElementById("restoreBtn").style.display = "inline-block";
    document.getElementById("micControls").style.display = "flex";
  });

  document.getElementById("restoreBtn").addEventListener("click", () => {
    document.getElementById("pdfContainer").style.display = "block";
    document.getElementById("restoreBtn").style.display = "none";
    document.getElementById("micControls").style.display = "flex";
  });

  document.getElementById("micBtn").addEventListener("click", () => {
    if (!audioWarmupDone) warmupAudio();
    if (!greetingDone) {
      greetingDone = true;
      greetChild();
    } else {
      startListening();
    }
  });
};

function greetChild() {
  const greeting = `Hi ${childName}! Tina Aunty is here to learn with you.`;
  postSpeak(greeting).then(() => {
    startListening();
  });
}

function warmupAudio() {
  try {
    const silentAudio = new Audio("data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA");
    silentAudio.play().then(() => {
      audioWarmupDone = true;
      console.log("✅ Audio context unlocked");
    }).catch(err => console.warn("⚠️ Audio warmup failed", err));
  } catch (e) {
    console.warn("Silent warmup not supported", e);
  }
}

function setupRecognition() {
  if (!("webkitSpeechRecognition" in window)) {
    alert("Speech recognition not supported.");
    return;
  }

  recognition = new webkitSpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
  };

  recognition.onstart = () => {
    listening = true;
    if (endTimeout) clearTimeout(endTimeout);
    if (!isTimeoutMode) {
      endTimeout = setTimeout(() => {
        if (listening && !isTimeoutMode) {
          listening = false;
          recognition.stop();
          postSpeak("Are you still there, my little friend? Tina Aunty is waiting to hear you.");
        }
      }, 15000);
    }
  };

  recognition.onresult = async (event) => {
    if (endTimeout) clearTimeout(endTimeout);
    const transcript = event.results[0][0].transcript.trim().toLowerCase();

    const res = await fetch("/check_timeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: transcript })
    });
    const data = await res.json();

    if (data.is_timeout) {
      isTimeoutMode = true;
      postSpeak("Okay, take your time. Tina Aunty will wait for you.");
      return;
    }

    if (isTimeoutMode && transcript.match(/i['’]?m back|i am back|returned|here again/)) {
      isTimeoutMode = false;
      disableMic();
      postSpeak("Welcome back! Let's continue where we left off.");
      return;
    }

    if (isTimeoutMode) return;

    listening = false;

    if (transcript.includes("bye")) {
      postSpeak(`Bye-bye ${childName}! Tina Aunty will see you next time!`);
      return;
    }

    getBotResponse(transcript);
  };

  recognition.onend = () => {
    listening = false;
    if (endTimeout) clearTimeout(endTimeout);
  };
}

function startListening() {
  if (recognition && !isSpeaking) recognition.start();
}

async function getBotResponse(message) {
  disableMic();
  const res = await fetch("/talk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  const data = await res.json();
  const cleanText = data.response;

  if (topic !== "Books") updateWhiteboard(cleanText);

  const imageContainer = document.getElementById("imageContainer");
  if (topic === "ABCD" && data.image_url) {
    imageContainer.innerHTML = `<img src="${data.image_url}" alt="Letter Image" />`;
  } else {
    imageContainer.innerHTML = "";
  }

  await postSpeak(cleanText);
}

function updateWhiteboard(text) {
  const whiteboard = document.getElementById("whiteboard");
  const match = text.match(/([A-Z])\s+is\s+for\s+(\w+)/i);
  if (match) {
    whiteboard.innerHTML = `<strong style="font-size: 2em;">${match[1]}</strong><br>is for<br><strong>${match[2]}</strong>`;
  } else {
    whiteboard.innerText = text.split(".")[0];
  }
}

async function postSpeak(text) {
  try {
    disableMic();
    isSpeaking = true;
    const res = await fetch("/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    const data = await res.json();

    if (data && data.url) {
      const audio = new Audio(data.url + `?t=${Date.now()}`);
      audio.setAttribute("preload", "auto");
      audio.setAttribute("autoplay", "true");

      try {
        await audio.play();
      } catch (err) {
        console.warn("Autoplay blocked, showing manual play option");
        const manualBtn = document.createElement("button");
        manualBtn.innerText = "▶️ Tap to Hear Tina Aunty";
        manualBtn.style = "margin-top: 10px; font-size: 18px;";
        manualBtn.onclick = () => {
          audio.play();
          manualBtn.remove();
        };
        document.body.appendChild(manualBtn);
      }

      audio.onended = () => {
        isSpeaking = false;
      };

      audio.onerror = (e) => {
        console.error("Audio error:", e);
        isSpeaking = false;
      };
    } else {
      console.error("TTS failed: No audio URL returned");
      isSpeaking = false;
    }
  } catch (err) {
    console.error("TTS fetch error:", err);
    isSpeaking = false;
  }
}

function disableMic() {
  if (recognition) recognition.abort();
}

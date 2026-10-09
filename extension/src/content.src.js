import * as InboxSDK from "@inboxsdk/core";
import { HOST, INGEST_TOKEN, APP_ID } from "../config.js";

const ingest = (path, body) =>
  fetch(HOST + path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + INGEST_TOKEN },
    body: JSON.stringify(body),
  }).catch(() => {});

InboxSDK.load(2, APP_ID).then((sdk) => {
  // --- Compose: per-mail toggle + pixel on send ---
  sdk.Compose.registerComposeViewHandler((composeView) => {
    let enabled = true;
    composeView.addButton({
      title: "메일 추적 (클릭해 켜고 끄기)",
      onClick: (e) => {
        enabled = !enabled;
        e.composeView.getBodyElement(); // keep focus in compose
        alert(enabled ? "이 메일: 추적 켜짐" : "이 메일: 추적 꺼짐");
      },
    });

    composeView.on("presending", () => {
      if (!enabled) return;
      const id = crypto.randomUUID();
      const body = composeView.getBodyElement();
      if (!body) return;
      const img = document.createElement("img");
      img.src = `${HOST}/o/${id}.gif`;
      img.width = 1;
      img.height = 1;
      img.alt = "";
      img.style.cssText = "width:1px;height:1px;border:0;opacity:0";
      body.appendChild(img);

      const recipients = (composeView.getToRecipients() || [])
        .map((c) => c.emailAddress)
        .join(", ");
      ingest("/api/track", {
        id,
        subject: composeView.getSubject() || "",
        recipient: recipients,
        sentAt: Date.now(),
      });
    });
  });

  // --- Reading a thread: flag the sender's own opens so they don't count ---
  sdk.Conversations.registerMessageViewHandler((messageView) => {
    try {
      const el = messageView.getBodyElement();
      const pixel = el && el.querySelector(`img[src*="${new URL(HOST).host}/o/"]`);
      if (!pixel) return;
      const m = pixel.getAttribute("src").match(/\/o\/([^/.?]+)/);
      if (m) ingest("/api/self-open", { id: m[1] });
    } catch (_) {}
  });
});

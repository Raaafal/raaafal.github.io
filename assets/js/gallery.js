/* BUILD & RIDE: the screenshot viewer.
   A tap on a screenshot opens it large; the arrows, a swipe or the arrow keys go to the next and previous ones,
   Escape, the close button, a tap beside the picture or the phone's back button close it.
   Without this script (or with a browser that has no <dialog>) the links still open each picture on its own. */
(() => {
  "use strict";

  const dialog = document.querySelector(".lightbox");
  const gallery = document.querySelector(".gallery");
  if (!dialog || !gallery || typeof dialog.showModal !== "function") return;

  const links = Array.from(gallery.querySelectorAll(".shot a"));
  if (!links.length) return;

  const bar = dialog.querySelector(".lb-bar");
  const stage = dialog.querySelector(".lb-stage");
  const foot = dialog.querySelector(".lb-foot");
  const count = dialog.querySelector(".lb-count");
  const cap = dialog.querySelector(".lb-cap");

  const img = new Image(1600, 900);
  img.className = "lb-img";
  img.draggable = false;
  img.decoding = "async";
  stage.appendChild(img);

  const SIZES = "100vw";
  const ACCENTS = ["c-cyan", "c-pink", "c-gold", "c-violet"];

  const items = links.map((a) => {
    const thumb = a.querySelector("img");
    const figure = a.closest("figure");
    return {
      href: a.href,
      thumb,
      srcset: thumb.getAttribute("srcset") || "",
      alt: thumb.alt,
      caption: figure.querySelector("figcaption"),
      accent: ACCENTS.find((c) => figure.classList.contains(c)) || "c-cyan",
    };
  });
  const n = items.length;

  // The large pictures, loaded and decoded ahead of time so the next one appears at once.
  const cache = new Map();
  function prime(i) {
    i = (i + n) % n;
    if (cache.has(i)) return cache.get(i);
    const pre = new Image();
    pre.sizes = SIZES;
    pre.srcset = items[i].srcset;
    pre.src = items[i].href;
    const entry = { ready: false };
    // On an error the picture is shown anyway: the <img> then shows its own alt text.
    entry.done = pre.decode().catch(() => {}).then(() => { entry.ready = true; });
    entry.pre = pre;
    cache.set(i, entry);
    return entry;
  }

  let current = 0;
  let seq = 0;

  function showLarge(item) {
    img.sizes = SIZES;
    img.srcset = item.srcset;
    img.src = item.href;
    stage.classList.remove("is-loading");
  }

  function slideIn(dir) {
    img.classList.remove("from-next", "from-prev");
    if (!dir) return;
    void img.offsetWidth; // restart the animation
    img.classList.add(dir > 0 ? "from-next" : "from-prev");
  }

  function show(i, dir) {
    current = (i + n) % n;
    const item = items[current];
    const token = ++seq;
    const entry = prime(current);

    dialog.classList.remove(...ACCENTS);
    dialog.classList.add(item.accent);
    count.textContent = `${current + 1} / ${n}`;
    cap.replaceChildren(...Array.from(item.caption.cloneNode(true).childNodes));
    img.alt = item.alt;

    if (entry.ready) {
      showLarge(item);
    } else {
      // Until the large picture is ready, show the small one from the page if it has loaded, or a spinner.
      img.removeAttribute("srcset");
      if (item.thumb.complete && item.thumb.currentSrc) {
        img.src = item.thumb.currentSrc;
      } else {
        stage.classList.add("is-loading");
      }
      entry.done.then(() => { if (token === seq) showLarge(item); });
    }
    slideIn(dir);

    prime(current + 1);
    prime(current - 1);
  }

  const next = () => show(current + 1, 1);
  const prev = () => show(current - 1, -1);

  let viewing = false;
  // The viewer adds a step to the history, so the phone's back button closes it instead of leaving the page.
  let pushed = false;

  function open(i) {
    show(i, 0);
    dialog.showModal();
    viewing = true;
    document.documentElement.classList.add("lb-open");
    if (!pushed) {
      try {
        history.pushState({ lightbox: true }, "");
        pushed = true;
      } catch (e) {
        pushed = false;
      }
    }
  }

  // Runs once whichever way the viewer closes: the buttons and the back button call it straight away,
  // Escape through the dialog's own close event (which the browser fires a little later).
  function closed(byHistory) {
    if (!viewing) return;
    viewing = false;
    seq++;
    document.documentElement.classList.remove("lb-open");
    // Back on the page, the last screenshot you looked at is the one in view and in focus.
    const link = links[current];
    link.focus({ preventScroll: true });
    link.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (pushed) {
      pushed = false;
      if (!byHistory) history.back();
    }
  }

  function close(byHistory) {
    if (dialog.open) dialog.close();
    closed(byHistory);
  }

  dialog.addEventListener("close", () => closed(false));
  window.addEventListener("popstate", () => close(true));

  gallery.addEventListener("click", (e) => {
    const a = e.target.closest(".shot a");
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(links.indexOf(a));
  });

  dialog.querySelector(".lb-close").addEventListener("click", () => close(false));
  dialog.querySelector(".lb-next").addEventListener("click", next);
  dialog.querySelector(".lb-prev").addEventListener("click", prev);

  dialog.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    let handled = true;
    if (e.key === "ArrowRight" || e.key === "PageDown") next();
    else if (e.key === "ArrowLeft" || e.key === "PageUp") prev();
    else if (e.key === "Home") show(0, -1);
    else if (e.key === "End") show(n - 1, 1);
    else handled = false;
    if (handled) e.preventDefault();
  });

  // A tap on the empty space around the picture closes the viewer; a tap after a swipe does not.
  let dragEnd = 0;
  dialog.addEventListener("click", (e) => {
    if (performance.now() - dragEnd < 400) return;
    if (e.target === dialog || e.target === stage || e.target === bar || e.target === foot) close(false);
  });

  // Swipe (or drag with the mouse) sideways to the next or previous screenshot.
  let drag = null;

  stage.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, moving: false };
  });

  stage.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x;
    if (!drag.moving) {
      if (Math.abs(drag.dx) < 8 || Math.abs(drag.dx) < Math.abs(e.clientY - drag.y)) return;
      drag.moving = true;
      try {
        stage.setPointerCapture(e.pointerId);
      } catch (err) {
        // the swipe still works while the finger stays over the picture
      }
      img.classList.add("is-dragging");
    }
    img.style.transform = `translateX(${drag.dx}px)`;
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moving) return;
    dragEnd = performance.now();
    img.classList.remove("is-dragging");
    img.style.transform = "";
    const dist = Math.abs(d.dx);
    const flick = dist / Math.max(1, e.timeStamp - d.t) > 0.45;
    if (!cancelled && (dist > 60 || (flick && dist > 24))) {
      if (d.dx < 0) next();
      else prev();
    }
  }

  stage.addEventListener("pointerup", (e) => endDrag(e, false));
  stage.addEventListener("pointercancel", (e) => endDrag(e, true));
})();

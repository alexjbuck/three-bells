// Three Bells dashboard behaviour. Server responses are HTML fragments swapped
// in by htmx; this file handles the purely client-side parts: dialogs, toasts,
// the timer, local dates, the tutorial and small conveniences.
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, "0");
  const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const storage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* storage unavailable */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* storage unavailable */
      }
    },
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (window.htmx) {
    htmx.config.globalViewTransitions = !reduceMotion && "startViewTransition" in document;
  }

  // -------------------------------------------------------------------------
  // Content setup (runs on load and for every piece of swapped-in HTML)
  // -------------------------------------------------------------------------

  // The server doesn't know the user's timezone, so "today" is filled in here.
  function applyToday(root) {
    const today = localDate(new Date());
    for (const input of $$("input[data-today]", root)) input.value = today;
  }

  // Remember which collapsible sections the user opened or closed so a
  // refresh of the region keeps them that way.
  const detailsState = new Map();
  document.addEventListener(
    "toggle",
    (e) => {
      const el = e.target;
      if (el instanceof HTMLDetailsElement && el.dataset.keep) {
        detailsState.set(el.dataset.keep, el.open);
      }
    },
    true,
  );
  function restoreDetails(root) {
    for (const el of $$("details[data-keep]", root)) {
      if (detailsState.has(el.dataset.keep)) el.open = detailsState.get(el.dataset.keep);
    }
  }

  function setupContent(root) {
    applyToday(root);
    restoreDetails(root);
    for (const form of $$(".entry-fields", root)) updateRangePreview(form);
    const editor = root.matches?.(".is-editing") ? root : $(".is-editing", root);
    if (editor && root !== document) {
      const field = editor.querySelector("input:not([type=hidden])");
      field?.focus({ preventScroll: true });
    }
  }

  // -------------------------------------------------------------------------
  // Keep your place: when regions are re-rendered, keep the element you
  // interacted with (or, if it's gone, something else on screen) at the same
  // spot in the viewport. Native scroll anchoring is disabled in CSS because
  // it guesses wrong when whole regions are replaced inside a view transition.
  // -------------------------------------------------------------------------

  const ANCHOR_SELECTOR = ".log-row, .rmp-card, .month, .section-head, .bundle-bar, .hero";
  let anchors = null;

  function captureAnchors(elt) {
    const list = [];
    const own = elt?.closest?.(ANCHOR_SELECTOR);
    if (own?.id) list.push(own);
    for (const el of $$(ANCHOR_SELECTOR)) {
      if (list.length >= 6) break;
      const r = el.getBoundingClientRect();
      if (el.id && el !== own && r.bottom > 60 && r.top < window.innerHeight) list.push(el);
    }
    anchors = list.map((el) => ({ id: el.id, top: el.getBoundingClientRect().top }));
  }

  function restoreAnchors() {
    if (!anchors) return;
    for (const a of anchors) {
      const el = document.getElementById(a.id);
      if (el) {
        const delta = el.getBoundingClientRect().top - a.top;
        if (Math.abs(delta) > 1) window.scrollBy(0, delta);
        return;
      }
    }
  }

  document.addEventListener("htmx:beforeSwap", (e) => {
    // A request from a dialog has no on-page element to keep in place.
    const elt = e.detail.elt;
    captureAnchors(elt?.closest?.("dialog") ? null : elt);
  });
  document.addEventListener("htmx:afterSwap", restoreAnchors);
  document.addEventListener("htmx:oobAfterSwap", restoreAnchors);
  document.addEventListener("htmx:afterSettle", () => {
    restoreAnchors();
    anchors = null;
  });

  if (window.htmx) {
    htmx.onLoad((el) => setupContent(el));
  } else {
    document.addEventListener("DOMContentLoaded", () => setupContent(document));
  }

  // -------------------------------------------------------------------------
  // Toasts
  // -------------------------------------------------------------------------

  const TOAST_MS = 6000;
  const MAX_TOASTS = 3;

  function dismissToast(toast) {
    if (!toast || toast.classList.contains("is-leaving")) return;
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 200);
  }

  function armToast(toast) {
    let timer = setTimeout(() => dismissToast(toast), TOAST_MS);
    toast.addEventListener("mouseenter", () => clearTimeout(timer));
    toast.addEventListener("mouseleave", () => {
      timer = setTimeout(() => dismissToast(toast), TOAST_MS / 2);
    });
    const container = toast.parentElement;
    const toasts = $$(".toast:not(.is-leaving)", container);
    for (const old of toasts.slice(0, Math.max(0, toasts.length - MAX_TOASTS))) dismissToast(old);
  }

  function showToast(message, tone = "default") {
    const container = $("#toasts");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${tone}`;
    toast.setAttribute("role", tone === "error" ? "alert" : "status");
    const msg = document.createElement("span");
    msg.className = "toast-msg";
    msg.textContent = message;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-close";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    toast.append(msg, close);
    container.append(toast);
  }

  const toastsEl = document.getElementById("toasts");
  if (toastsEl) {
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains("toast")) armToast(node);
        }
      }
    }).observe(toastsEl, { childList: true });
    toastsEl.addEventListener("click", (e) => {
      const toast = e.target.closest(".toast");
      if (e.target.closest(".toast-close")) dismissToast(toast);
    });
    // An undo click dismisses its toast once the request is done.
    toastsEl.addEventListener("htmx:afterRequest", (e) => dismissToast(e.target.closest(".toast")));
  }

  document.addEventListener("htmx:responseError", (e) => {
    const xhr = e.detail.xhr;
    const type = xhr.getResponseHeader("Content-Type") || "";
    const text = type.startsWith("text/plain") ? xhr.responseText.trim() : "";
    showToast(
      text && text.length < 200 ? text : "Something went wrong. Please try again.",
      "error",
    );
  });
  document.addEventListener("htmx:sendError", () => {
    showToast("Can't reach the server. Check your connection and try again.", "error");
  });

  // -------------------------------------------------------------------------
  // Entry dialog
  // -------------------------------------------------------------------------

  const entryDialog = $("#entryDialog");
  const pristineEntryForm = $("#entryForm")?.outerHTML;

  function resetEntryForm() {
    const form = $("#entryForm");
    if (!form || !pristineEntryForm) return;
    form.outerHTML = pristineEntryForm;
    const fresh = $("#entryForm");
    if (window.htmx) htmx.process(fresh);
    setupContent(fresh);
  }

  function openEntryDialog(prefill) {
    if (!entryDialog) return;
    const form = $("#entryForm");
    if (prefill) {
      resetEntryForm();
      const fresh = $("#entryForm");
      for (const [name, value] of Object.entries(prefill)) {
        const input = fresh.elements[name];
        if (input instanceof RadioNodeList) {
          for (const radio of input) radio.checked = radio.value === value;
        } else if (input) {
          input.value = value;
          input.removeAttribute("data-today");
        }
      }
      updateRangePreview(fresh);
    } else if (form) {
      applyToday(form);
    }
    entryDialog.showModal();
    const focusTarget = prefill
      ? $("#entryForm input[name=note]")
      : $("#entryForm input[name=workDate]");
    focusTarget?.focus();
  }

  document.body.addEventListener("entry-saved", () => {
    entryDialog?.close();
    resetEntryForm();
  });

  if (entryDialog) {
    // Clicking the backdrop closes the dialog.
    entryDialog.addEventListener("click", (e) => {
      if (e.target === entryDialog) entryDialog.close();
    });
  }

  // -------------------------------------------------------------------------
  // Range preview ("= 2.5 hrs") in entry forms
  // -------------------------------------------------------------------------

  function updateRangePreview(scope) {
    const fields = scope.matches?.(".entry-fields") ? scope : $(".entry-fields", scope);
    if (!fields) return;
    const out = $("[data-range-preview]", fields);
    const start = fields.querySelector("input[name=startTime]")?.value;
    const end = fields.querySelector("input[name=endTime]")?.value;
    if (!out) return;
    if (!start || !end || start === end) {
      out.textContent = "";
      return;
    }
    const toMin = (v) => {
      const [hh, mm] = v.split(":").map(Number);
      return hh * 60 + mm;
    };
    let mins = toMin(end) - toMin(start);
    if (mins < 0) mins += 24 * 60;
    const hrs = Math.round((mins / 60) * 100) / 100;
    out.textContent = `= ${hrs} ${hrs === 1 ? "hr" : "hrs"}${toMin(end) < toMin(start) ? " (overnight)" : ""}`;
  }

  document.addEventListener("input", (e) => {
    if (e.target.closest?.(".entry-fields")) updateRangePreview(e.target.closest(".entry-fields"));
  });

  // -------------------------------------------------------------------------
  // Confirm dialog (replaces window.confirm for hx-confirm)
  // -------------------------------------------------------------------------

  const confirmDialog = $("#confirmDialog");
  document.addEventListener("htmx:confirm", (e) => {
    if (!e.detail.question || !confirmDialog) return;
    e.preventDefault();
    $("#confirmMessage").textContent = e.detail.question;
    $("#confirmOk").textContent = e.detail.elt.dataset.confirmLabel || "Confirm";
    confirmDialog.returnValue = "";
    confirmDialog.showModal();
    $("#confirmOk").focus();
    confirmDialog.addEventListener(
      "close",
      () => {
        if (confirmDialog.returnValue === "ok") e.detail.issueRequest(true);
      },
      { once: true },
    );
  });

  // -------------------------------------------------------------------------
  // Clicks: open dialogs, cancel edits, reveal RMPs, copy notes, menus
  // -------------------------------------------------------------------------

  const profileBtn = $("#profileBtn");
  const profileMenu = $("#profileMenu");
  function setMenu(open) {
    if (!profileBtn || !profileMenu) return;
    profileMenu.hidden = !open;
    profileBtn.setAttribute("aria-expanded", String(open));
  }

  document.addEventListener("click", (e) => {
    const target = e.target;

    if (target.closest("[data-open-entry]")) {
      openEntryDialog();
      return;
    }
    const closer = target.closest("[data-close-dialog]");
    if (closer) {
      closer.closest("dialog")?.close();
      return;
    }

    const reveal = target.closest("[data-reveal-rmp]");
    if (reveal) {
      e.preventDefault();
      const card = document.querySelector(reveal.getAttribute("href"));
      if (!card) return;
      for (let el = card.parentElement; el; el = el.parentElement) {
        if (el instanceof HTMLDetailsElement) el.open = true;
      }
      const details = card.querySelector(".rmp-details");
      if (details) details.open = true;
      card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      card.classList.remove("flash");
      void card.offsetWidth;
      card.classList.add("flash");
      return;
    }

    const copyBtn = target.closest("[data-copy]");
    if (copyBtn) {
      navigator.clipboard
        ?.writeText(copyBtn.dataset.copy)
        .then(() => showToast("Notes copied to clipboard"))
        .catch(() => showToast("Couldn't copy notes", "error"));
      return;
    }

    if (target.closest("#profileBtn")) {
      setMenu(profileMenu.hidden);
      return;
    }
    if (!target.closest("#profileMenu")) setMenu(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const editor = e.target.closest?.(".is-editing");
    if (editor) {
      e.preventDefault();
      $("[data-cancel-edit]", editor)?.click();
      return;
    }
    if (profileMenu && !profileMenu.hidden) {
      setMenu(false);
      profileBtn.focus();
    }
  });

  // -------------------------------------------------------------------------
  // Timer (state kept in localStorage so it survives closing the app)
  // -------------------------------------------------------------------------

  const timerEl = $("#timer");
  if (timerEl) {
    const display = $("#timerDisplay");
    const startBtn = $("[data-timer=start]", timerEl);
    const STORAGE_KEY = "timerState";
    const idle = () => ({ status: "idle", startTime: null, elapsedMs: 0 });
    let state = idle();
    let interval = null;

    const format = (ms) => {
      const total = Math.floor(ms / 1000);
      return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
    };
    const save = () => storage.set(STORAGE_KEY, JSON.stringify(state));
    const tick = () => {
      if (state.status === "running") {
        state.elapsedMs = Date.now() - new Date(state.startTime).getTime();
      }
      display.textContent = format(state.elapsedMs);
    };
    const render = () => {
      timerEl.dataset.state = state.status;
      startBtn.title = state.status === "paused" ? "Resume timer" : "Start timer";
      startBtn.setAttribute("aria-label", startBtn.title);
      tick();
    };
    const run = () => {
      clearInterval(interval);
      interval = setInterval(tick, 1000);
    };

    try {
      const saved = JSON.parse(storage.get(STORAGE_KEY) || "null");
      if (saved && (saved.status === "running" || saved.status === "paused") && saved.startTime) {
        state = {
          status: saved.status,
          startTime: saved.startTime,
          elapsedMs: saved.elapsedMs || 0,
        };
        if (state.status === "running") run();
      }
    } catch {
      state = idle();
    }
    render();

    timerEl.addEventListener("click", (e) => {
      const action = e.target.closest("[data-timer]")?.dataset.timer;
      if (!action) return;
      if (action === "start") {
        // Resuming shifts the start so elapsed time excludes the pause.
        state.startTime = new Date(
          Date.now() - (state.status === "paused" ? state.elapsedMs : 0),
        ).toISOString();
        state.status = "running";
        run();
      } else if (action === "pause" && state.status === "running") {
        tick();
        state.status = "paused";
        clearInterval(interval);
      } else if (action === "stop" && state.status !== "idle") {
        tick();
        clearInterval(interval);
        const start = new Date(state.startTime);
        const end = new Date(start.getTime() + state.elapsedMs);
        state = idle();
        storage.remove(STORAGE_KEY);
        render();
        openEntryDialog({
          workDate: localDate(start),
          mode: "range",
          startTime: localTime(start),
          endTime: localTime(end),
          manualHours: "",
        });
        return;
      }
      save();
      render();
    });

    // Catch up after the tab was in the background.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tick();
    });
  }

  // -------------------------------------------------------------------------
  // PWA install prompt
  // -------------------------------------------------------------------------

  const installBtn = $("#installBtn");
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.hidden = false;
  });
  installBtn?.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    if (installBtn) installBtn.hidden = true;
  });

  // -------------------------------------------------------------------------
  // Tutorial (Driver.js)
  // -------------------------------------------------------------------------

  const TUTORIAL_KEY = "threeBells_tutorial_v1";
  const visible = (el) => el && el.getClientRects().length > 0;

  function startTutorial() {
    if (!window.driver?.js?.driver) return;
    const addBtn = [$("#addEntryBtn"), $("#fab")].find(visible);
    const steps = [
      {
        popover: {
          title: "Welcome to Three Bells",
          description: "A quick tour of how to track your RMP hours. It takes about 30 seconds.",
        },
      },
      {
        element: "#summary .hero",
        popover: {
          title: "Your balance",
          description:
            "Unbundled hours and progress toward your next RMP, plus how many RMPs are pending and paid.",
          side: "bottom",
        },
      },
      {
        element: "#timer",
        popover: {
          title: "Track time live",
          description:
            "Start the timer when you begin working. It keeps running even if you close the app. Stop it to log the time.",
          side: "bottom",
          align: "end",
        },
      },
      addBtn && {
        element: addBtn,
        popover: {
          title: "Add an entry",
          description: "Log a time range or a number of hours by hand, with an optional note.",
          side: "bottom",
          align: "end",
        },
      },
      $("#bundleBar") && {
        element: "#bundleBar",
        popover: {
          title: "Ready to file",
          description:
            "Once you have 3 hours, bundle them into an RMP. Your oldest hours go first.",
          side: "bottom",
        },
      },
      {
        element: "#rmpsTitle",
        popover: {
          title: "Your RMPs",
          description:
            "Mark RMPs paid when the money arrives. Expand one to see its entries and copy its notes.",
          side: "bottom",
        },
      },
      {
        element: "#historyTitle",
        popover: {
          title: "History",
          description:
            "Every entry, grouped by month. Edit or delete unbundled entries right in the list.",
          side: "bottom",
        },
      },
      {
        element: "#helpBtn",
        popover: {
          title: "Need a refresher?",
          description: "Replay this tour any time from here.",
          side: "bottom",
          align: "end",
        },
      },
    ].filter(Boolean);

    const tour = window.driver.js.driver({
      showProgress: true,
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Done",
      popoverClass: "tb-tour",
      steps,
      onDestroyStarted: () => {
        storage.set(TUTORIAL_KEY, "complete");
        tour.destroy();
      },
    });
    tour.drive();
  }

  $("#helpBtn")?.addEventListener("click", startTutorial);
  $("#showTutorialLink")?.addEventListener("click", () => {
    setMenu(false);
    startTutorial();
  });
  if ($("#timer") && !storage.get(TUTORIAL_KEY)) {
    window.addEventListener("load", () => setTimeout(startTutorial, 400));
  }
})();

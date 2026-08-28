/* Flavour Frequency — landing page behaviour (no dependencies) */
(function () {
  "use strict";
  document.documentElement.classList.add("js");

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------
     Nav: solid on scroll, mobile menu, scroll-spy
  ------------------------------------------------------------------ */
  var nav = $(".nav");
  var burger = $(".nav__burger");
  var mobileMenu = $("#mobile-menu");

  function onScroll() { nav.classList.toggle("is-scrolled", window.scrollY > 12); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function setMenu(open) {
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    mobileMenu.hidden = !open;
    if (open) nav.classList.add("is-scrolled");
  }
  burger.addEventListener("click", function () { setMenu(mobileMenu.hidden); });
  $$("a", mobileMenu).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !mobileMenu.hidden) { setMenu(false); burger.focus(); } });
  window.matchMedia("(min-width: 961px)").addEventListener("change", function (e) { if (e.matches) setMenu(false); });

  // Scroll-spy: highlight the nav link for the section in view
  var spyLinks = $$(".nav__links a[data-spy]");
  var spyTargets = [$("#top")].concat(["menu", "find-us", "about"].map(function (id) { return document.getElementById(id); }));
  function setActive(id) {
    spyLinks.forEach(function (a) {
      if (a.getAttribute("data-spy") === id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }
  if ("IntersectionObserver" in window) {
    var current = "top";
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { current = en.target.id === "top" ? "top" : en.target.id; setActive(current); }
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    spyTargets.forEach(function (t) { if (t) spy.observe(t); });
    // top of page → Home
    window.addEventListener("scroll", function () { if (window.scrollY < 200) setActive("top"); }, { passive: true });
  }

  /* ------------------------------------------------------------------
     Scroll reveal (staggered within a parent)
  ------------------------------------------------------------------ */
  var reveals = $$("[data-reveal]");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    // stagger siblings that share a parent
    var groups = new Map();
    reveals.forEach(function (el) {
      var p = el.parentElement;
      var n = groups.get(p) || 0;
      el.style.setProperty("--d", Math.min(n, 6));
      groups.set(p, n + 1);
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------
     Menu filters
  ------------------------------------------------------------------ */
  var filterBtns = $$(".filters .tag");
  var cards = $$(".menu-card");
  var emptyMsg = $(".menu__empty");

  function applyFilter(key) {
    filterBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-filter") === key)); });
    var anyVisible = false, i = 0;
    cards.forEach(function (card) {
      var shown = 0;
      $$(".menu-item", card).forEach(function (item) {
        var tags = (item.getAttribute("data-tags") || "").split(/\s+/);
        var show = key === "all" || tags.indexOf(key) !== -1;
        item.classList.toggle("is-hidden", !show);
        item.classList.remove("is-in");
        if (show) {
          shown++;
          if (!reduceMotion) { item.style.setProperty("--i", i++); void item.offsetWidth; item.classList.add("is-in"); }
        }
      });
      card.classList.toggle("is-hidden", shown === 0);
      if (shown) anyVisible = true;
    });
    emptyMsg.hidden = anyVisible;
  }
  filterBtns.forEach(function (b) {
    b.addEventListener("click", function () { applyFilter(b.getAttribute("data-filter")); });
  });

  /* ------------------------------------------------------------------
     Poster lightbox
  ------------------------------------------------------------------ */
  var dialog = $("#poster-dialog");
  var posterBtn = $(".poster");
  if (dialog && posterBtn) {
    if (typeof dialog.showModal === "function") {
      posterBtn.addEventListener("click", function () { dialog.showModal(); });
      $(".lightbox__close", dialog).addEventListener("click", function () { dialog.close(); });
      dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
    } else {
      // very old browsers: open the poster directly
      posterBtn.addEventListener("click", function () { window.open("assets/menu-poster-1055.jpg", "_blank", "noopener"); });
    }
  }

  /* ------------------------------------------------------------------
     Carnival countdown sticker
     Notting Hill Carnival 2026 — Sun 30 & Mon 31 August (BST, UTC+1)
  ------------------------------------------------------------------ */
  var CARNIVAL_START = new Date("2026-08-30T10:00:00+01:00");
  var CARNIVAL_END = new Date("2026-08-31T20:00:00+01:00");
  var sticker = $("#countdown");
  var big = $("[data-countdown-big]", sticker);
  var sub = $("[data-countdown-sub]", sticker);
  var lastSub = "";

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function renderCountdown() {
    var now = new Date();
    if (now < CARNIVAL_START) {
      var diff = CARNIVAL_START - now;
      var d = Math.floor(diff / 864e5), h = Math.floor(diff / 36e5) % 24, m = Math.floor(diff / 6e4) % 60, s = Math.floor(diff / 1e3) % 60;
      sticker.setAttribute("data-state", "before");
      if (d > 0) {
        big.textContent = d + (d === 1 ? " day" : " days");
        sub.textContent = pad(h) + " hrs · " + pad(m) + " min · " + pad(s) + " sec to go";
      } else {
        big.textContent = pad(h) + ":" + pad(m) + ":" + pad(s);
        sub.textContent = "until Carnival · Sun 30 Aug";
      }
    } else if (now <= CARNIVAL_END) {
      sticker.setAttribute("data-state", "live");
      big.textContent = "We're live";
      sub.textContent = "At Carnival now · find our stand →";
    } else {
      sticker.setAttribute("data-state", "after");
      big.textContent = "That's a wrap";
      sub.textContent = "Stay on frequency for the next one";
    }
    if (sub.textContent !== lastSub && !reduceMotion) {
      sub.classList.remove("is-tick"); void sub.offsetWidth; sub.classList.add("is-tick");
    }
    lastSub = sub.textContent;
  }
  if (sticker && big && sub) {
    renderCountdown();
    setInterval(renderCountdown, 1000);
  }

  /* ------------------------------------------------------------------
     Signup — posts to the Cloudflare Pages Function at /api/subscribe.
     Falls back to a mailto link when the endpoint isn't configured.
  ------------------------------------------------------------------ */
  var form = $("#signup");
  if (form) {
    var submitBtn = $(".signup__submit", form);
    var status = $(".signup__status", form);
    var done = $(".signup__done");
    var emailInput = $('input[name="email"]', form);

    function setStatus(msg, isError) {
      status.textContent = "";
      if (typeof msg === "string") status.textContent = msg; else if (msg) status.appendChild(msg);
      status.classList.toggle("is-error", !!isError);
    }
    function fallbackMessage() {
      var frag = document.createDocumentFragment();
      frag.appendChild(document.createTextNode("Signups aren't live yet — "));
      var a = document.createElement("a");
      a.href = "mailto:info@flavourfrequency.com?subject=" + encodeURIComponent("Stay on frequency") + "&body=" + encodeURIComponent("Add me to the list: " + emailInput.value);
      a.textContent = "email us";
      frag.appendChild(a);
      frag.appendChild(document.createTextNode(" and we'll add you by hand."));
      return frag;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = emailInput.value.trim();
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
      emailInput.setAttribute("aria-invalid", String(!valid));
      if (!valid) { setStatus("Drop in a real email and we'll keep you posted.", true); emailInput.focus(); return; }

      var consent = $('input[name="updates"]', form);
      if (!consent.checked) {
        setStatus("Tick the box below so we know it's OK to email you.", true);
        consent.focus();
        return;
      }

      var payload = {
        email: email,
        updates: true,
        frequency_check: $('input[name="frequency_check"]', form).value, // honeypot — stays empty for humans
        source: "flavourfrequency.com"
      };
      submitBtn.setAttribute("aria-busy", "true");
      submitBtn.disabled = true;
      setStatus("");

      var controller = "AbortController" in window ? new AbortController() : null;
      var timer = controller && setTimeout(function () { controller.abort(); }, 12000);

      fetch(form.getAttribute("action"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
        })
        .then(function (r) {
          if (r.ok && r.data && r.data.ok) {
            form.hidden = true;
            done.hidden = false;
            return;
          }
          if (r.status === 501 || r.status === 404 || r.status === 405) { setStatus(fallbackMessage(), true); return; }
          setStatus((r.data && r.data.error) || "Something dropped the signal — try again in a moment.", true);
        })
        .catch(function () { setStatus(fallbackMessage(), true); })
        .then(function () {
          if (timer) clearTimeout(timer);
          submitBtn.removeAttribute("aria-busy");
          submitBtn.disabled = false;
        });
    });
  }

  /* ------------------------------------------------------------------
     Footer year
  ------------------------------------------------------------------ */
  var yearEl = $("[data-year]");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();

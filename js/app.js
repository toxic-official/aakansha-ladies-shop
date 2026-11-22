(function () {
  const CFG = window.AAKANSHA_CONFIG;
  const I18N = window.AAKANSHA_I18N;
  const SEED = window.AAKANSHA_SEED;

  const LANG_COOKIE = "aakansha_lang";
  const WISHLIST_KEY = "aakansha_wishlist_v1";
  const STATE_KEY = "aakansha_store_state_v1";

  let currentLang = getSavedLanguage();
  let state = loadStoreState();
  let wishlist = loadWishlist();
  let bannerIndex = 0;
  let bannerTimer = null;
  let showAllCategories = false;
  let activeCategorySlug = null;
  let highlightedProductId = null;
  let selectedRating = 5;
  let selectedOwnerRole = "Father";
  let currentAdminTab = "overview";
  let authenticatedOwner = null; // { email, role }
  let supabaseClient = null;

  initSupabaseIfConfigured();

  function initSupabaseIfConfigured() {
    if (CFG.supabase && CFG.supabase.url && CFG.supabase.anonKey && window.supabase) {
      supabaseClient = window.supabase.createClient(CFG.supabase.url, CFG.supabase.anonKey);
      supabaseClient.auth.getSession().then(({ data }) => {
        if (data && data.session && data.session.user) {
          const role = data.session.user.user_metadata?.owner_role || inferRoleFromEmail(data.session.user.email);
          authenticatedOwner = { email: data.session.user.email, role };
          syncFromSupabase().then(renderAll);
        }
      });
    }
  }

  function inferRoleFromEmail(email = "") {
    const lower = email.toLowerCase();
    if (lower.includes("mother")) return "Mother";
    if (lower.includes("father")) return "Father";
    return "Me";
  }

  async function syncFromSupabase() {
    if (!supabaseClient) return;
    try {
      const [catsRes, prodsRes, bansRes, fbRes, resRes] = await Promise.all([
        supabaseClient.from("categories").select("*").order("sort_order", { ascending: true }),
        supabaseClient.from("products").select("*").order("sort_order", { ascending: true }),
        supabaseClient.from("banners").select("*").order("sort_order", { ascending: true }),
        supabaseClient.from("feedback").select("*").order("created_at", { ascending: false }),
        authenticatedOwner
          ? supabaseClient.from("reservations").select("*").order("created_at", { ascending: false })
          : Promise.resolve({ data: null })
      ]);
      if (catsRes.data && catsRes.data.length) state.categories = catsRes.data;
      if (prodsRes.data && prodsRes.data.length) state.products = prodsRes.data;
      if (bansRes.data && bansRes.data.length) state.banners = bansRes.data;
      if (fbRes.data && fbRes.data.length) state.feedback = fbRes.data;
      if (resRes.data) state.reservations = resRes.data;
      persistLocalState();
    } catch (err) {
      console.warn("Supabase sync fallback to cached state:", err.message);
    }
  }

  function getSavedLanguage() {
    const match = document.cookie.match(new RegExp("(^| )" + LANG_COOKIE + "=([^;]+)"));
    const val = match ? match[2] : null;
    return ["en", "mr", "hi"].includes(val) ? val : null;
  }

  function setSavedLanguage(lang, immediateOpenHome = false) {
    if (!["en", "mr", "hi"].includes(lang)) return;
    currentLang = lang;
    document.cookie = `${LANG_COOKIE}=${lang}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
    document.documentElement.lang = lang;
    document.body.classList.remove("lang-en", "lang-mr", "lang-hi");
    document.body.classList.add(`lang-${lang}`);

    if (immediateOpenHome) {
      document.getElementById("languageOverlay").classList.add("hidden");
      navigateToHome();
    }
    applyTranslations();
    renderAll();
  }

  function loadStoreState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.products)) {
          return parsed;
        }
      }
    } catch (_) {}
    return JSON.parse(JSON.stringify(SEED));
  }

  function persistLocalState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function loadWishlist() {
    try {
      const raw = localStorage.getItem(WISHLIST_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function persistWishlist() {
    try {
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
    } catch (_) {}
    updateWishlistBadge();
  }

  function t(key) {
    const dict = I18N[currentLang] || I18N.en;
    return dict[key] || I18N.en[key] || key;
  }

  function catName(cat) {
    if (!cat) return "";
    if (currentLang === "mr") return cat.name_mr || cat.name_en;
    if (currentLang === "hi") return cat.name_hi || cat.name_en;
    return cat.name_en;
  }

  function prodName(prod) {
    if (!prod) return "";
    if (currentLang === "mr") return prod.name_mr || prod.name_en;
    if (currentLang === "hi") return prod.name_hi || prod.name_en;
    return prod.name_en;
  }

  function bannerTitle(ban) {
    if (!ban) return "";
    if (currentLang === "mr") return ban.title_mr || ban.title_en;
    if (currentLang === "hi") return ban.title_hi || ban.title_en;
    return ban.title_en;
  }

  function bannerSubtitle(ban) {
    if (!ban) return "";
    if (currentLang === "mr") return ban.subtitle_mr || ban.subtitle_en || "";
    if (currentLang === "hi") return ban.subtitle_hi || ban.subtitle_en || "";
    return ban.subtitle_en || "";
  }

  function formatINR(amount) {
    return "₹" + Number(amount || 0).toLocaleString("en-IN");
  }

  function showToast(msg) {
    const el = document.getElementById("toastBanner");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => el.classList.add("hidden"), 3200);
  }

  function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (t(k)) el.textContent = t(k);
    });
    document.getElementById("storeNoticeText").textContent = t("store_notice");
    document.getElementById("holdRuleBadge").textContent = t("hold_badge");
    document.getElementById("ownerBtnText").textContent = authenticatedOwner ? t("owner_dashboard") : t("owner_login");
    document.getElementById("whatsappActionBtn").textContent = t("whatsapp_btn");
    document.getElementById("callActionBtn").textContent = t("call_btn");
    document.getElementById("mapsActionBtn").textContent = t("maps_btn");

    document.querySelectorAll(".lang-pill").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-lang") === currentLang);
    });

    const moreBtn = document.getElementById("toggleMoreCategoriesBtn");
    if (moreBtn) {
      moreBtn.textContent = showAllCategories ? t("fewer_categories") : t("more_categories");
    }

    updateContactButtons();
  }

  function updateContactButtons() {
    const waBtn = document.getElementById("whatsappActionBtn");
    const callBtn = document.getElementById("callActionBtn");
    const phoneLine = document.getElementById("configuredPhoneLine");

    const waDigits = (CFG.whatsappNumberDigits || "").replace(/\D/g, "");
    const rawPhone = (CFG.shopPhoneRaw || "").trim();

    if (waDigits) {
      waBtn.href = `https://wa.me/${waDigits}?text=${encodeURIComponent("Namaste Aakansha Ladies Shop (Babhaleshwar), I would like to inquire about a product.")}`;
      waBtn.classList.remove("hidden");
    } else {
      waBtn.href = "#contact-location-section";
    }

    if (rawPhone) {
      callBtn.href = `tel:${rawPhone.replace(/[^+\d]/g, "")}`;
      phoneLine.textContent = `Phone: ${rawPhone}`;
    } else {
      callBtn.href = "#contact-location-section";
      phoneLine.textContent = t("phone_not_configured");
    }
  }

  function processExpiredReservationsLocally() {
    const now = Date.now();
    let changed = false;
    state.reservations.forEach((r) => {
      if (r.status === "confirmed" && r.expires_at && new Date(r.expires_at).getTime() <= now) {
        r.status = "expired";
        r.expired_notified = true;
        const prod = state.products.find((p) => p.id === r.product_id);
        if (prod) {
          prod.stock = Number(prod.stock || 0) + Number(r.quantity || 0);
        }
        changed = true;
      }
    });
    if (changed) persistLocalState();
  }

  function triggerBackendExpiryCheck() {
    if (CFG.supabase && CFG.supabase.expireEdgeFunctionUrl) {
      fetch(CFG.supabase.expireEdgeFunctionUrl, { method: "POST" }).catch(() => {});
    }
  }

  // BANNER CAROUSEL
  function renderBanners() {
    const track = document.getElementById("bannerTrack");
    const dotsWrap = document.getElementById("bannerDots");
    const prevBtn = document.getElementById("bannerPrevBtn");
    const nextBtn = document.getElementById("bannerNextBtn");

    const banners = [...state.banners].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    clearInterval(bannerTimer);

    if (!banners.length) {
      track.innerHTML = "";
      dotsWrap.innerHTML = "";
      prevBtn.classList.add("hidden");
      nextBtn.classList.add("hidden");
      return;
    }

    if (bannerIndex >= banners.length) bannerIndex = 0;

    track.innerHTML = banners.map((b) => `
      <div class="banner-slide" data-banner-id="${b.id}">
        <img src="${escapeAttr(b.image)}" alt="${escapeAttr(bannerTitle(b))}" />
        <div class="banner-scrim">
          <div class="banner-caption">
            <span class="banner-badge">Aakansha Ladies Shop</span>
            <h2 class="banner-title">${escapeHtml(bannerTitle(b))}</h2>
            <p class="banner-subtitle">${escapeHtml(bannerSubtitle(b))}</p>
            <span class="banner-cta">Explore Collection &#8594;</span>
          </div>
        </div>
      </div>
    `).join("");

    track.style.transform = `translateX(-${bannerIndex * 100}%)`;

    track.querySelectorAll(".banner-slide").forEach((slide) => {
      slide.addEventListener("click", () => {
        const b = banners.find((item) => item.id === slide.getAttribute("data-banner-id"));
        if (!b) return;
        if (b.product_id) {
          const prod = state.products.find((p) => p.id === b.product_id);
          if (prod) {
            const cat = state.categories.find((c) => c.id === prod.category_id);
            if (cat) openCategoryPage(cat.slug, prod.id);
            return;
          }
        }
        if (b.target_id) {
          const cat = state.categories.find((c) => c.id === b.target_id || c.slug === b.target_id);
          if (cat) openCategoryPage(cat.slug);
        }
      });
    });

    if (banners.length === 1) {
      prevBtn.classList.add("hidden");
      nextBtn.classList.add("hidden");
      dotsWrap.innerHTML = "";
      return;
    }

    prevBtn.classList.remove("hidden");
    nextBtn.classList.remove("hidden");
    dotsWrap.innerHTML = banners.map((_, idx) => `
      <button type="button" class="carousel-dot ${idx === bannerIndex ? "active" : ""}" aria-label="Slide ${idx + 1}" data-dot="${idx}"></button>
    `).join("");

    dotsWrap.querySelectorAll(".carousel-dot").forEach((dot) => {
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        bannerIndex = Number(dot.getAttribute("data-dot"));
        renderBanners();
      });
    });

    bannerTimer = setInterval(() => {
      bannerIndex = (bannerIndex + 1) % banners.length;
      track.style.transform = `translateX(-${bannerIndex * 100}%)`;
      dotsWrap.querySelectorAll(".carousel-dot").forEach((d, i) => d.classList.toggle("active", i === bannerIndex));
    }, CFG.bannerIntervalMs || 3000);
  }

  function setupBannerGestures() {
    const shell = document.getElementById("bannerCarouselShell");
    let startX = 0;
    shell.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
    }, { passive: true });
    shell.addEventListener("touchend", (e) => {
      const endX = e.changedTouches[0].clientX;
      const diff = endX - startX;
      const total = state.banners.length;
      if (total <= 1 || Math.abs(diff) < 40) return;
      if (diff < 0) {
        bannerIndex = (bannerIndex + 1) % total;
      } else {
        bannerIndex = (bannerIndex - 1 + total) % total;
      }
      renderBanners();
    }, { passive: true });

    document.getElementById("bannerPrevBtn").addEventListener("click", () => {
      const total = state.banners.length;
      if (total <= 1) return;
      bannerIndex = (bannerIndex - 1 + total) % total;
      renderBanners();
    });

    document.getElementById("bannerNextBtn").addEventListener("click", () => {
      const total = state.banners.length;
      if (total <= 1) return;
      bannerIndex = (bannerIndex + 1) % total;
      renderBanners();
    });
  }

  // CATEGORIES & SEPARATE CATEGORY PAGE
  function renderCategories() {
    const grid = document.getElementById("categoryGrid");
    const sorted = [...state.categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const visible = showAllCategories ? sorted : sorted.slice(0, 6);

    grid.innerHTML = visible.map((cat) => {
      const count = state.products.filter((p) => p.category_id === cat.id).length;
      return `
        <article class="category-card" data-slug="${escapeAttr(cat.slug)}">
          <img src="${escapeAttr(cat.image)}" alt="${escapeAttr(catName(cat))}" loading="lazy" />
          <div class="category-card-overlay">
            <h3 class="category-card-title">${escapeHtml(catName(cat))}</h3>
            <span class="category-card-meta">${count} ${count === 1 ? "item" : "items"} • Open Page &#8594;</span>
          </div>
        </article>
      `;
    }).join("");

    grid.querySelectorAll(".category-card").forEach((card) => {
      card.addEventListener("click", () => {
        openCategoryPage(card.getAttribute("data-slug"));
      });
    });

    const addCatBtn = document.getElementById("adminAddCategoryInlineBtn");
    addCatBtn.classList.toggle("hidden", !authenticatedOwner);
  }

  function openCategoryPage(slug, highlightId = null) {
    const cat = state.categories.find((c) => c.slug === slug);
    if (!cat) return;
    activeCategorySlug = slug;
    highlightedProductId = highlightId;
    window.location.hash = `#category/${slug}`;
    showView("category");
    renderCategoryPage();
    if (highlightId) {
      setTimeout(() => {
        const el = document.querySelector(`[data-product-card-id="${highlightId}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 140);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function renderCategoryPage() {
    const cat = state.categories.find((c) => c.slug === activeCategorySlug);
    if (!cat) return;

    document.getElementById("categoryHeroBanner").innerHTML = `
      <img src="${escapeAttr(cat.image)}" alt="${escapeAttr(catName(cat))}" />
      <div class="category-hero-scrim">
        <span class="banner-badge">Aakansha Ladies Shop • Babhaleshwar</span>
        <h1 class="banner-title">${escapeHtml(catName(cat))}</h1>
      </div>
    `;

    const query = (document.getElementById("categorySearchInput").value || "").trim().toLowerCase();
    const sort = document.getElementById("categorySortSelect").value;

    let items = state.products.filter((p) => p.category_id === cat.id);
    if (query) {
      items = items.filter((p) =>
        (p.name_en || "").toLowerCase().includes(query) ||
        (p.name_mr || "").toLowerCase().includes(query) ||
        (p.name_hi || "").toLowerCase().includes(query)
      );
    }

    items = sortProducts(items, sort);
    const grid = document.getElementById("categoryProductsGrid");
    if (!items.length) {
      grid.innerHTML = `<p class="muted-copy">No products found in ${escapeHtml(catName(cat))}.</p>`;
      return;
    }
    grid.innerHTML = items.map((p) => buildProductCardHtml(p, highlightedProductId === p.id)).join("");
    bindProductCardEvents(grid);
  }

  function navigateToHome() {
    activeCategorySlug = null;
    highlightedProductId = null;
    if (window.location.hash.startsWith("#category/")) {
      window.location.hash = "#home";
    }
    showView("home");
    renderAll();
  }

  function showView(viewName) {
    document.getElementById("homeView").classList.toggle("hidden", viewName !== "home");
    document.getElementById("categoryPageView").classList.toggle("hidden", viewName !== "category");
    document.getElementById("ownerDashboardView").classList.toggle("hidden", viewName !== "admin");
  }

  // PRODUCT CARDS + NEW ARRIVALS CLICK + OWNER LONG-PRESS
  function sortProducts(list, mode) {
    const copy = [...list];
    if (mode === "price_asc") return copy.sort((a, b) => Number(a.price) - Number(b.price));
    if (mode === "price_desc") return copy.sort((a, b) => Number(b.price) - Number(a.price));
    if (mode === "stock_desc") return copy.sort((a, b) => Number(b.stock) - Number(a.stock));
    return copy.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  function stockBadge(stock) {
    const qty = Number(stock || 0);
    if (qty <= 0) return `<span class="stock-pill stock-out">${t("out_of_stock")} (0)</span>`;
    if (qty <= 3) return `<span class="stock-pill stock-low">${t("low_stock")} (${qty})</span>`;
    return `<span class="stock-pill stock-in">${t("in_stock")} (${qty})</span>`;
  }

  function buildProductCardHtml(prod, isHighlighted = false, isNewArrivalCard = false) {
    const cat = state.categories.find((c) => c.id === prod.category_id);
    const saved = wishlist.includes(prod.id);
    const outOfStock = Number(prod.stock || 0) <= 0;
    return `
      <article class="product-card ${isHighlighted ? "highlighted-arrival" : ""}" data-product-card-id="${prod.id}" data-arrival-card="${isNewArrivalCard ? "1" : "0"}">
        <div class="product-media">
          <img src="${escapeAttr(prod.image)}" alt="${escapeAttr(prodName(prod))}" loading="lazy" />
          <div class="product-badge-row">
            ${prod.is_new_arrival ? `<span class="tag-arrival">New Arrival</span>` : ""}
            ${cat ? `<span class="tag-cat">${escapeHtml(catName(cat))}</span>` : ""}
          </div>
        </div>
        <div class="product-body">
          <h3 class="product-name">${escapeHtml(prodName(prod))}</h3>
          <div class="product-price-stock">
            <span class="product-price">${formatINR(prod.price)}</span>
            ${stockBadge(prod.stock)}
          </div>
          <div class="product-actions">
            <button type="button" class="wishlist-toggle-btn ${saved ? "saved" : ""}" data-wish-id="${prod.id}">
              ${saved ? "&#9829; " + t("btn_saved") : "&#9825; " + t("btn_wishlist")}
            </button>
            <button type="button" class="save-for-me-btn" data-save-id="${prod.id}" ${outOfStock ? "disabled" : ""}>
              ${t("btn_save_for_me")}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function bindProductCardEvents(container, navigateToCategoryOnClick = false) {
    container.querySelectorAll(".product-card").forEach((card) => {
      const prodId = card.getAttribute("data-product-card-id");
      const prod = state.products.find((p) => p.id === prodId);
      if (!prod) return;

      const mediaOrTitle = card.querySelectorAll(".product-media, .product-name");
      mediaOrTitle.forEach((el) => {
        el.addEventListener("click", () => {
          if (navigateToCategoryOnClick) {
            const cat = state.categories.find((c) => c.id === prod.category_id);
            if (cat) openCategoryPage(cat.slug, prod.id);
          }
        });
      });

      // Owner-only long-press (Edit / Delete)
      if (authenticatedOwner) {
        let pressTimer = null;
        const startPress = () => {
          pressTimer = setTimeout(() => {
            openOwnerProductEditor(prod.id, true);
          }, 550);
        };
        const cancelPress = () => clearTimeout(pressTimer);
        card.addEventListener("mousedown", startPress);
        card.addEventListener("touchstart", startPress, { passive: true });
        card.addEventListener("mouseup", cancelPress);
        card.addEventListener("mouseleave", cancelPress);
        card.addEventListener("touchend", cancelPress);
      }
    });

    container.querySelectorAll("[data-wish-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleWishlist(btn.getAttribute("data-wish-id"));
      });
    });

    container.querySelectorAll("[data-save-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openSaveForMeModal(btn.getAttribute("data-save-id"));
      });
    });
  }

  function toggleWishlist(prodId) {
    if (wishlist.includes(prodId)) {
      wishlist = wishlist.filter((id) => id !== prodId);
      showToast("Removed from Wishlist");
    } else {
      wishlist.push(prodId);
      showToast("Added to Wishlist");
    }
    persistWishlist();
    renderAll();
  }

  function updateWishlistBadge() {
    document.getElementById("wishlistCountBadge").textContent = String(wishlist.length);
  }

  // SAVE FOR ME MODAL
  function openSaveForMeModal(prodId) {
    const prod = state.products.find((p) => p.id === prodId);
    if (!prod || Number(prod.stock || 0) <= 0) return;

    document.getElementById("saveProductId").value = prod.id;
    document.getElementById("saveProductPreview").innerHTML = `
      <img src="${escapeAttr(prod.image)}" alt="${escapeAttr(prodName(prod))}" />
      <div>
        <strong>${escapeHtml(prodName(prod))}</strong><br />
        <span>${formatINR(prod.price)} • Available: ${prod.stock}</span>
      </div>
    `;
    const qtyInput = document.getElementById("customerReserveQty");
    qtyInput.max = String(prod.stock);
    qtyInput.value = "1";
    document.getElementById("saveMaxStockHint").textContent = `Maximum available at shop: ${prod.stock}`;
    document.getElementById("saveForMeModal").classList.remove("hidden");
  }

  async function handleSaveForMeSubmit(e) {
    e.preventDefault();
    const prodId = document.getElementById("saveProductId").value;
    const customerName = document.getElementById("customerReserveName").value.trim();
    const customerPhone = document.getElementById("customerReservePhone").value.trim();
    const qty = Number(document.getElementById("customerReserveQty").value);
    const prod = state.products.find((p) => p.id === prodId);

    if (!prod || qty < 1 || qty > Number(prod.stock)) {
      showToast("Please enter a valid quantity within available stock.");
      return;
    }

    const newReservation = {
      id: "res-" + Date.now(),
      product_id: prod.id,
      product_name_en: prod.name_en,
      product_image: prod.image,
      customer_name: customerName,
      customer_phone: customerPhone,
      quantity: qty,
      status: "pending",
      confirmed_at: null,
      expires_at: null,
      created_at: new Date().toISOString()
    };

    if (supabaseClient) {
      const { error } = await supabaseClient.from("reservations").insert([newReservation]);
      if (error) {
        showToast("Could not submit reservation: " + error.message);
        return;
      }
    }

    state.reservations.unshift(newReservation);
    persistLocalState();
    document.getElementById("saveForMeModal").classList.add("hidden");
    document.getElementById("saveForMeForm").reset();
    showToast("Keep-aside request sent to Aakansha Ladies Shop!");
  }

  // FEEDBACK
  function renderFeedback() {
    const listEl = document.getElementById("feedbackList");
    if (!state.feedback.length) {
      listEl.innerHTML = `<p class="muted-copy">No reviews yet. Be the first to review Aakansha Ladies Shop.</p>`;
      return;
    }
    listEl.innerHTML = state.feedback.map((f) => `
      <div class="feedback-card">
        <div class="feedback-stars">${"&#9733;".repeat(Number(f.rating || 5))}${"&#9734;".repeat(5 - Number(f.rating || 5))}</div>
        <p style="margin:0;">${escapeHtml(f.comment)}</p>
        <div class="feedback-author">${escapeHtml(f.customer_name)}</div>
      </div>
    `).join("");
  }

  async function handleFeedbackSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("feedbackName").value.trim();
    const comment = document.getElementById("feedbackComment").value.trim();
    if (!name || !comment) return;

    const item = {
      id: "fb-" + Date.now(),
      customer_name: name,
      rating: selectedRating,
      comment,
      created_at: new Date().toISOString()
    };

    if (supabaseClient) {
      await supabaseClient.from("feedback").insert([item]);
    }

    state.feedback.unshift(item);
    persistLocalState();
    document.getElementById("feedbackForm").reset();
    setSelectedRating(5);
    renderFeedback();
    showToast("Thank you for your feedback!");
  }

  function setSelectedRating(r) {
    selectedRating = Number(r);
    document.querySelectorAll("#starSelector .star-btn").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.getAttribute("data-rating")) <= selectedRating);
    });
    document.getElementById("ratingReadout").textContent = `${selectedRating} / 5`;
  }

  // OWNER AUTHENTICATION & ADMIN DASHBOARD (3 ACCOUNTS: FATHER, MOTHER, ME)
  function openOwnerPortal() {
    if (authenticatedOwner) {
      showView("admin");
      renderAdminDashboard();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      document.getElementById("ownerAuthModal").classList.remove("hidden");
    }
  }

  async function handleOwnerLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById("ownerEmailInput").value.trim();
    const password = document.getElementById("ownerPasswordInput").value;

    if (!supabaseClient) {
      showToast("Configure Supabase URL & Anon Key in js/config.js (or Admin Settings) to sign in with Supabase Auth.");
      return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      showToast("Login failed: " + (error ? error.message : "Invalid credentials"));
      return;
    }

    const role = data.user.user_metadata?.owner_role || selectedOwnerRole || inferRoleFromEmail(email);
    authenticatedOwner = { email: data.user.email, role };
    document.getElementById("ownerAuthModal").classList.add("hidden");
    applyTranslations();
    await syncFromSupabase();
    showView("admin");
    renderAdminDashboard();
    showToast(`Signed in as ${role}`);
  }

  function openAdminTab(tabName) {
    currentAdminTab = tabName;
    openOwnerPortal();
  }

  function renderAdminDashboard() {
    if (!authenticatedOwner) return;
    processExpiredReservationsLocally();

    document.getElementById("activeOwnerSessionBadge").textContent =
      `Signed in as: ${authenticatedOwner.role} (${authenticatedOwner.email})`;

    document.querySelectorAll("#adminTabsBar .admin-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === currentAdminTab);
    });

    const panel = document.getElementById("adminTabContent");
    if (currentAdminTab === "overview") renderAdminOverview(panel);
    else if (currentAdminTab === "products") renderAdminProducts(panel);
    else if (currentAdminTab === "categories") renderAdminCategories(panel);
    else if (currentAdminTab === "banners") renderAdminBanners(panel);
    else if (currentAdminTab === "arrivals") renderAdminArrivals(panel);
    else if (currentAdminTab === "stock") renderAdminStock(panel);
    else if (currentAdminTab === "reservations") renderAdminReservations(panel);
    else if (currentAdminTab === "feedback") renderAdminFeedback(panel);
    else if (currentAdminTab === "settings") renderAdminSettings(panel);
  }

  function renderAdminOverview(panel) {
    const activeHolds = state.reservations.filter((r) => r.status === "confirmed").length;
    const pendingReqs = state.reservations.filter((r) => r.status === "pending").length;
    const lowStockCount = state.products.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= 3).length;

    panel.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-box"><span>Total Categories</span><strong>${state.categories.length}</strong></div>
        <div class="kpi-box"><span>Total Products</span><strong>${state.products.length}</strong></div>
        <div class="kpi-box"><span>Pending Keep-Aside</span><strong>${pendingReqs}</strong></div>
        <div class="kpi-box"><span>Active 48h Holds</span><strong>${activeHolds}</strong></div>
        <div class="kpi-box"><span>Low Stock Items</span><strong>${lowStockCount}</strong></div>
      </div>
      <div class="admin-card">
        <h3>Owner Accounts (Role-Based Access)</h3>
        <p class="muted-copy">Three dedicated owner profiles (<strong>Father</strong>, <strong>Mother</strong>, <strong>Me</strong>) share administrator privileges on this live catalogue.</p>
      </div>
    `;
  }

  function renderAdminProducts(panel) {
    panel.innerHTML = `
      <div class="admin-card">
        <div class="section-header compact">
          <h3>Add New Product</h3>
        </div>
        <form id="adminAddProductForm" class="stack-form">
          <div class="form-group">
            <label>Category</label>
            <select id="newProdCat" required>
              ${state.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name_en)} (${escapeHtml(c.name_mr)})</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label>Product Name (English)</label>
            <input type="text" id="newProdNameEn" required />
          </div>
          <div class="form-group">
            <label>Product Name (मराठी)</label>
            <input type="text" id="newProdNameMr" />
          </div>
          <div class="form-group">
            <label>Product Name (हिंदी)</label>
            <input type="text" id="newProdNameHi" />
          </div>
          <div class="form-group">
            <label>Price (₹)</label>
            <input type="number" id="newProdPrice" min="1" required />
          </div>
          <div class="form-group">
            <label>Stock Quantity</label>
            <input type="number" id="newProdStock" min="0" value="5" required />
          </div>
          <div class="form-group">
            <label>Upload Product Photo (or Paste Image URL)</label>
            <input type="file" id="newProdFile" accept="image/*" />
            <input type="url" id="newProdImgUrl" placeholder="https://..." />
          </div>
          <label><input type="checkbox" id="newProdArrival" /> Mark as New Arrival</label>
          <button type="submit" class="gold-btn">Save Product</button>
        </form>
      </div>

      <div class="admin-card">
        <h3>All Products & Banner Promotion</h3>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Product</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${state.products.map((p) => `
                <tr>
                  <td><img src="${escapeAttr(p.image)}" class="thumb-sm" alt="" /></td>
                  <td><strong>${escapeHtml(p.name_en)}</strong><br /><small>${escapeHtml(p.name_mr || "")}</small></td>
                  <td>${formatINR(p.price)}</td>
                  <td>${p.stock}</td>
                  <td>
                    <button type="button" class="outline-btn" onclick="window.__adminEditProd('${p.id}')">Edit</button>
                    <button type="button" class="secondary-btn" onclick="window.__adminAddToBanner('${p.id}')">ADD TO HOMEPAGE BANNER</button>
                    <button type="button" class="danger-btn" onclick="window.__adminDelProd('${p.id}')">Delete</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById("adminAddProductForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById("newProdFile");
      let imgUrl = document.getElementById("newProdImgUrl").value.trim();
      if (fileInput.files && fileInput.files[0]) {
        imgUrl = await uploadImageOrDataUrl(fileInput.files[0], "products");
      }
      if (!imgUrl) imgUrl = SEED.products[0].image;

      const prod = {
        id: "prod-" + Date.now(),
        category_id: document.getElementById("newProdCat").value,
        name_en: document.getElementById("newProdNameEn").value.trim(),
        name_mr: document.getElementById("newProdNameMr").value.trim() || document.getElementById("newProdNameEn").value.trim(),
        name_hi: document.getElementById("newProdNameHi").value.trim() || document.getElementById("newProdNameEn").value.trim(),
        price: Number(document.getElementById("newProdPrice").value),
        stock: Number(document.getElementById("newProdStock").value),
        image: imgUrl,
        is_new_arrival: document.getElementById("newProdArrival").checked,
        is_popular: false,
        sort_order: state.products.length + 1
      };

      if (supabaseClient) await supabaseClient.from("products").insert([prod]);
      state.products.push(prod);
      persistLocalState();
      renderAll();
      renderAdminDashboard();
      showToast("Product added!");
    });
  }

  window.__adminEditProd = (id) => openOwnerProductEditor(id, false);

  window.__adminDelProd = async (id) => {
    if (!confirm("Delete this product?")) return;
    if (supabaseClient) await supabaseClient.from("products").delete().eq("id", id);
    state.products = state.products.filter((p) => p.id !== id);
    persistLocalState();
    renderAll();
    renderAdminDashboard();
    showToast("Product deleted.");
  };

  window.__adminAddToBanner = async (prodId) => {
    const prod = state.products.find((p) => p.id === prodId);
    if (!prod) return;
    const cat = state.categories.find((c) => c.id === prod.category_id);
    const banner = {
      id: "ban-" + Date.now(),
      title_en: prod.name_en,
      title_mr: prod.name_mr || prod.name_en,
      title_hi: prod.name_hi || prod.name_en,
      subtitle_en: `${formatINR(prod.price)} • Available at Aakansha Ladies Shop, Babhaleshwar`,
      subtitle_mr: `${formatINR(prod.price)} • आकांक्षा लेडीज शॉप, बाभळेश्वर येथे उपलब्ध`,
      subtitle_hi: `${formatINR(prod.price)} • आकांक्षा लेडीज शॉप, बाभलेश्वर में उपलब्ध`,
      image: prod.image,
      target_type: "product",
      target_id: cat ? cat.id : "",
      product_id: prod.id,
      sort_order: state.banners.length + 1
    };
    if (supabaseClient) await supabaseClient.from("banners").insert([banner]);
    state.banners.push(banner);
    persistLocalState();
    renderBanners();
    showToast(`"${prod.name_en}" added to Homepage Banner!`);
  };

  function openOwnerProductEditor(prodId, showDeleteOption) {
    const prod = state.products.find((p) => p.id === prodId);
    if (!prod) return;
    const modal = document.getElementById("ownerProductModal");
    const form = document.getElementById("ownerProductForm");
    form.innerHTML = `
      <div class="form-group"><label>Product Name (English)</label><input type="text" id="editProdEn" value="${escapeAttr(prod.name_en)}" required /></div>
      <div class="form-group"><label>Product Name (मराठी)</label><input type="text" id="editProdMr" value="${escapeAttr(prod.name_mr || "")}" /></div>
      <div class="form-group"><label>Product Name (हिंदी)</label><input type="text" id="editProdHi" value="${escapeAttr(prod.name_hi || "")}" /></div>
      <div class="form-group"><label>Price (₹)</label><input type="number" id="editProdPrice" value="${prod.price}" required /></div>
      <div class="form-group"><label>Stock</label><input type="number" id="editProdStock" value="${prod.stock}" required /></div>
      <label><input type="checkbox" id="editProdArrival" ${prod.is_new_arrival ? "checked" : ""} /> New Arrival</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button type="submit" class="gold-btn">Save Changes</button>
        ${showDeleteOption ? `<button type="button" class="danger-btn" id="longPressDeleteBtn">Delete Product</button>` : ""}
      </div>
    `;
    modal.classList.remove("hidden");

    form.onsubmit = async (ev) => {
      ev.preventDefault();
      prod.name_en = document.getElementById("editProdEn").value.trim();
      prod.name_mr = document.getElementById("editProdMr").value.trim();
      prod.name_hi = document.getElementById("editProdHi").value.trim();
      prod.price = Number(document.getElementById("editProdPrice").value);
      prod.stock = Number(document.getElementById("editProdStock").value);
      prod.is_new_arrival = document.getElementById("editProdArrival").checked;
      if (supabaseClient) await supabaseClient.from("products").update(prod).eq("id", prod.id);
      persistLocalState();
      modal.classList.add("hidden");
      renderAll();
      if (!document.getElementById("ownerDashboardView").classList.contains("hidden")) renderAdminDashboard();
      showToast("Product updated!");
    };

    const delBtn = document.getElementById("longPressDeleteBtn");
    if (delBtn) {
      delBtn.onclick = () => {
        modal.classList.add("hidden");
        window.__adminDelProd(prod.id);
      };
    }
  }

  function renderAdminCategories(panel) {
    panel.innerHTML = `
      <div class="admin-card">
        <h3>Add New Category (+)</h3>
        <form id="adminAddCatForm" class="stack-form">
          <div class="form-group"><label>Category Name (English)</label><input type="text" id="newCatEn" required /></div>
          <div class="form-group"><label>Category Name (मराठी)</label><input type="text" id="newCatMr" /></div>
          <div class="form-group"><label>Category Name (हिंदी)</label><input type="text" id="newCatHi" /></div>
          <div class="form-group">
            <label>Category Image Upload or URL</label>
            <input type="file" id="newCatFile" accept="image/*" />
            <input type="url" id="newCatImg" placeholder="https://..." />
          </div>
          <button type="submit" class="gold-btn">+ Add Category</button>
        </form>
      </div>
      <div class="admin-card">
        <h3>Manage Categories</h3>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Image</th><th>Name</th><th>Order</th><th>Actions</th></tr></thead>
            <tbody>
              ${state.categories.map((c, idx) => `
                <tr>
                  <td><img src="${escapeAttr(c.image)}" class="thumb-sm" alt="" /></td>
                  <td><strong>${escapeHtml(c.name_en)}</strong> • ${escapeHtml(c.name_mr || "")}</td>
                  <td>${c.sort_order}</td>
                  <td>
                    <button type="button" class="outline-btn" onclick="window.__moveCat('${c.id}', -1)" ${idx === 0 ? "disabled" : ""}>&#8593;</button>
                    <button type="button" class="outline-btn" onclick="window.__moveCat('${c.id}', 1)" ${idx === state.categories.length - 1 ? "disabled" : ""}>&#8595;</button>
                    <button type="button" class="danger-btn" onclick="window.__delCat('${c.id}')">Delete</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById("adminAddCatForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameEn = document.getElementById("newCatEn").value.trim();
      const slug = nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || ("cat-" + Date.now());
      let img = document.getElementById("newCatImg").value.trim();
      const file = document.getElementById("newCatFile").files[0];
      if (file) img = await uploadImageOrDataUrl(file, "categories");
      if (!img) img = SEED.categories[0].image;

      const cat = {
        id: "cat-" + Date.now(),
        slug,
        name_en: nameEn,
        name_mr: document.getElementById("newCatMr").value.trim() || nameEn,
        name_hi: document.getElementById("newCatHi").value.trim() || nameEn,
        image: img,
        sort_order: state.categories.length + 1
      };
      if (supabaseClient) await supabaseClient.from("categories").insert([cat]);
      state.categories.push(cat);
      persistLocalState();
      renderCategories();
      renderAdminDashboard();
      showToast("Category added!");
    });
  }

  window.__moveCat = async (id, dir) => {
    const sorted = [...state.categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const idx = sorted.findIndex((c) => c.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const temp = sorted[idx].sort_order;
    sorted[idx].sort_order = sorted[swapIdx].sort_order;
    sorted[swapIdx].sort_order = temp;
    state.categories = sorted;
    persistLocalState();
    renderCategories();
    renderAdminDashboard();
  };

  window.__delCat = async (id) => {
    if (!confirm("Delete this category?")) return;
    if (supabaseClient) await supabaseClient.from("categories").delete().eq("id", id);
    state.categories = state.categories.filter((c) => c.id !== id);
    persistLocalState();
    renderCategories();
    renderAdminDashboard();
  };

  function renderAdminBanners(panel) {
    panel.innerHTML = `
      <div class="admin-card">
        <h3>Homepage Banners (${state.banners.length})</h3>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Image</th><th>Title</th><th>Order</th><th>Actions</th></tr></thead>
            <tbody>
              ${state.banners.map((b, idx) => `
                <tr>
                  <td><img src="${escapeAttr(b.image)}" class="thumb-sm" alt="" /></td>
                  <td>${escapeHtml(b.title_en)}</td>
                  <td>${b.sort_order}</td>
                  <td>
                    <button type="button" class="outline-btn" onclick="window.__moveBanner('${b.id}', -1)" ${idx === 0 ? "disabled" : ""}>&#8593;</button>
                    <button type="button" class="outline-btn" onclick="window.__moveBanner('${b.id}', 1)" ${idx === state.banners.length - 1 ? "disabled" : ""}>&#8595;</button>
                    <button type="button" class="danger-btn" onclick="window.__delBanner('${b.id}')">Remove</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  window.__moveBanner = (id, dir) => {
    const sorted = [...state.banners].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const idx = sorted.findIndex((b) => b.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const tOrder = sorted[idx].sort_order;
    sorted[idx].sort_order = sorted[swapIdx].sort_order;
    sorted[swapIdx].sort_order = tOrder;
    state.banners = sorted;
    persistLocalState();
    renderBanners();
    renderAdminDashboard();
  };

  window.__delBanner = async (id) => {
    if (supabaseClient) await supabaseClient.from("banners").delete().eq("id", id);
    state.banners = state.banners.filter((b) => b.id !== id);
    persistLocalState();
    renderBanners();
    renderAdminDashboard();
  };

  function renderAdminArrivals(panel) {
    panel.innerHTML = `
      <div class="admin-card">
        <h3>Mark / Unmark New Arrivals</h3>
        ${state.products.map((p) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-soft);">
            <span><strong>${escapeHtml(p.name_en)}</strong> (${formatINR(p.price)})</span>
            <label><input type="checkbox" ${p.is_new_arrival ? "checked" : ""} onchange="window.__toggleArrival('${p.id}', this.checked)" /> New Arrival</label>
          </div>
        `).join("")}
      </div>
    `;
  }

  window.__toggleArrival = async (id, checked) => {
    const prod = state.products.find((p) => p.id === id);
    if (!prod) return;
    prod.is_new_arrival = checked;
    if (supabaseClient) await supabaseClient.from("products").update({ is_new_arrival: checked }).eq("id", id);
    persistLocalState();
    renderNewArrivals();
    showToast("New Arrival status updated.");
  };

  function renderAdminStock(panel) {
    panel.innerHTML = `
      <div class="admin-card">
        <h3>Stock & Price Quick Update</h3>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Product</th><th>Price (₹)</th><th>Stock Qty</th><th>Save</th></tr></thead>
            <tbody>
              ${state.products.map((p) => `
                <tr>
                  <td>${escapeHtml(p.name_en)}</td>
                  <td><input type="number" id="stkPrice-${p.id}" value="${p.price}" style="width:95px;" /></td>
                  <td><input type="number" id="stkQty-${p.id}" value="${p.stock}" min="0" style="width:75px;" /></td>
                  <td><button type="button" class="gold-btn" onclick="window.__saveStockRow('${p.id}')">Update</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  window.__saveStockRow = async (id) => {
    const prod = state.products.find((p) => p.id === id);
    if (!prod) return;
    prod.price = Number(document.getElementById(`stkPrice-${id}`).value);
    prod.stock = Number(document.getElementById(`stkQty-${id}`).value);
    if (supabaseClient) await supabaseClient.from("products").update({ price: prod.price, stock: prod.stock }).eq("id", id);
    persistLocalState();
    renderAll();
    showToast(`Updated ${prod.name_en}`);
  };

  function renderAdminReservations(panel) {
    panel.innerHTML = `
      <div class="admin-card">
        <h3>Save For Me Reservations (48-Hour Store Pickup Hold)</h3>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Customer & Phone</th>
                <th>Product & Qty</th>
                <th>Status & 48h Expiry</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${!state.reservations.length ? `<tr><td colspan="4">No reservation requests yet.</td></tr>` : state.reservations.map((r) => `
                <tr>
                  <td><strong>${escapeHtml(r.customer_name)}</strong><br /><small>${escapeHtml(r.customer_phone)}</small></td>
                  <td>${escapeHtml(r.product_name_en)} &times; ${r.quantity}</td>
                  <td>
                    <strong>${escapeHtml(r.status.toUpperCase())}</strong><br />
                    <small>${r.expires_at ? "Expires: " + new Date(r.expires_at).toLocaleString() : "Awaiting confirmation"}</small>
                  </td>
                  <td>
                    <button type="button" class="gold-btn" onclick="window.__resAction('${r.id}', 'confirm')">Accept & Start 48h Hold</button>
                    <button type="button" class="outline-btn" onclick="window.__resAction('${r.id}', 'extend')">+24h Extend</button>
                    <button type="button" class="secondary-btn" onclick="window.__resAction('${r.id}', 'collected')">Collected</button>
                    <button type="button" class="danger-btn" onclick="window.__resAction('${r.id}', 'cancel')">Reject / Cancel</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  window.__resAction = async (resId, action) => {
    const r = state.reservations.find((item) => item.id === resId);
    if (!r) return;
    const prod = state.products.find((p) => p.id === r.product_id);

    if (action === "confirm") {
      if (r.status !== "confirmed") {
        if (!prod || Number(prod.stock) < Number(r.quantity)) {
          showToast("Insufficient stock to confirm reservation.");
          return;
        }
        prod.stock = Number(prod.stock) - Number(r.quantity);
      }
      const now = Date.now();
      r.status = "confirmed";
      r.confirmed_at = new Date(now).toISOString();
      r.expires_at = new Date(now + 48 * 3600 * 1000).toISOString();
    } else if (action === "extend") {
      const baseTime = r.expires_at ? Math.max(Date.now(), new Date(r.expires_at).getTime()) : Date.now();
      r.status = "confirmed";
      r.expires_at = new Date(baseTime + 24 * 3600 * 1000).toISOString();
    } else if (action === "cancel") {
      if (r.status === "confirmed" && prod) {
        prod.stock = Number(prod.stock) + Number(r.quantity);
      }
      r.status = "cancelled";
    } else if (action === "collected") {
      r.status = "collected";
    }

    if (supabaseClient) {
      await supabaseClient.from("reservations").update(r).eq("id", r.id);
      if (prod) await supabaseClient.from("products").update({ stock: prod.stock }).eq("id", prod.id);
    }
    persistLocalState();
    renderAll();
    renderAdminDashboard();
    showToast("Reservation updated.");
  };

  function renderAdminFeedback(panel) {
    panel.innerHTML = `
      <div class="admin-card">
        <h3>All Customer Feedback (${state.feedback.length})</h3>
        ${state.feedback.map((f) => `
          <div style="padding:10px 0;border-bottom:1px solid var(--border-soft);">
            <strong>${escapeHtml(f.customer_name)}</strong> — ${"★".repeat(f.rating)} (${f.rating}/5)
            <p style="margin:4px 0 0;">${escapeHtml(f.comment)}</p>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderAdminSettings(panel) {
    const shareUrl = CFG.publicUrl || window.location.href;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=210x210&data=${encodeURIComponent(shareUrl)}`;

    panel.innerHTML = `
      <div class="admin-card">
        <h3>Shop Contact Phone & Public URL</h3>
        <form id="adminContactSettingsForm" class="stack-form">
          <div class="form-group">
            <label>Shop Phone Number (Displayed on Contact & Call button)</label>
            <input type="text" id="setShopPhone" value="${escapeAttr(CFG.shopPhoneRaw || "")}" placeholder="Enter shop phone number" />
          </div>
          <div class="form-group">
            <label>WhatsApp Digits (e.g., 9198XXXXXXXX)</label>
            <input type="text" id="setWaDigits" value="${escapeAttr(CFG.whatsappNumberDigits || "")}" placeholder="Country code + mobile digits" />
          </div>
          <div class="form-group">
            <label>Public Website URL (for Customer QR Code)</label>
            <input type="url" id="setPublicUrl" value="${escapeAttr(shareUrl)}" />
          </div>
          <button type="submit" class="gold-btn">Save Store Settings</button>
        </form>
      </div>

      <div class="admin-card">
        <h3>Customer QR Code for Shop Counter</h3>
        <p class="muted-copy">Customers can scan this QR code to open Aakansha Ladies Shop immediately.</p>
        <div class="qr-box">
          <img src="${qrApiUrl}" alt="QR Code for Aakansha Ladies Shop" width="210" height="210" />
          <small>${escapeHtml(shareUrl)}</small>
        </div>
      </div>
    `;

    document.getElementById("adminContactSettingsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      CFG.shopPhoneRaw = document.getElementById("setShopPhone").value.trim();
      CFG.whatsappNumberDigits = document.getElementById("setWaDigits").value.trim().replace(/\D/g, "");
      CFG.publicUrl = document.getElementById("setPublicUrl").value.trim() || shareUrl;
      updateContactButtons();
      renderAdminDashboard();
      showToast("Store settings updated!");
    });
  }

  async function uploadImageOrDataUrl(file, folder) {
    if (supabaseClient && CFG.supabase.storageBucket) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabaseClient.storage.from(CFG.supabase.storageBucket).upload(path, file, { upsert: false });
      if (!error) {
        const { data } = supabaseClient.storage.from(CFG.supabase.storageBucket).getPublicUrl(path);
        if (data && data.publicUrl) return data.publicUrl;
      }
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
  }

  function renderAll() {
    processExpiredReservationsLocally();
    updateWishlistBadge();
    renderBanners();
    renderCategories();

    const arrivals = state.products.filter((p) => p.is_new_arrival);
    const arrivalsGrid = document.getElementById("newArrivalsGrid");
    arrivalsGrid.innerHTML = arrivals.map((p) => buildProductCardHtml(p, false, true)).join("");
    bindProductCardEvents(arrivalsGrid, true);

    const popular = state.products.filter((p) => p.is_popular);
    const popularGrid = document.getElementById("popularProductsGrid");
    popularGrid.innerHTML = (popular.length ? popular : state.products.slice(0, 4)).map((p) => buildProductCardHtml(p)).join("");
    bindProductCardEvents(popularGrid, false);

    const q = (document.getElementById("allProductsSearch").value || "").trim().toLowerCase();
    const s = document.getElementById("allProductsSort").value;
    let allFiltered = state.products.filter((p) =>
      !q ||
      (p.name_en || "").toLowerCase().includes(q) ||
      (p.name_mr || "").toLowerCase().includes(q) ||
      (p.name_hi || "").toLowerCase().includes(q)
    );
    allFiltered = sortProducts(allFiltered, s);
    const allGrid = document.getElementById("allProductsGrid");
    allGrid.innerHTML = allFiltered.map((p) => buildProductCardHtml(p)).join("");
    bindProductCardEvents(allGrid, false);

    const wishItems = state.products.filter((p) => wishlist.includes(p.id));
    const wishGrid = document.getElementById("homeWishlistGrid");
    wishGrid.innerHTML = wishItems.length
      ? wishItems.map((p) => buildProductCardHtml(p)).join("")
      : `<p class="muted-copy">No items in your wishlist yet.</p>`;
    bindProductCardEvents(wishGrid, false);

    renderFeedback();
    if (!document.getElementById("categoryPageView").classList.contains("hidden")) {
      renderCategoryPage();
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  // BIND GLOBAL EVENTS
  document.querySelectorAll(".lang-choice-btn").forEach((btn) => {
    btn.addEventListener("click", () => setSavedLanguage(btn.getAttribute("data-lang"), true));
  });

  document.querySelectorAll(".lang-pill").forEach((btn) => {
    btn.addEventListener("click", () => setSavedLanguage(btn.getAttribute("data-lang"), false));
  });

  document.getElementById("brandLogoLink").addEventListener("click", (e) => {
    e.preventDefault();
    navigateToHome();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.getElementById("backToHomeFromCategoryBtn").addEventListener("click", navigateToHome);
  document.getElementById("returnToStoreBtn").addEventListener("click", navigateToHome);

  document.getElementById("toggleMoreCategoriesBtn").addEventListener("click", () => {
    showAllCategories = !showAllCategories;
    applyTranslations();
    renderCategories();
  });

  document.getElementById("allProductsSearch").addEventListener("input", renderAll);
  document.getElementById("allProductsSort").addEventListener("change", renderAll);
  document.getElementById("categorySearchInput").addEventListener("input", renderCategoryPage);
  document.getElementById("categorySortSelect").addEventListener("change", renderCategoryPage);

  document.getElementById("openWishlistBtn").addEventListener("click", () => {
    navigateToHome();
    document.getElementById("wishlist-section").scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("clearWishlistBtn").addEventListener("click", () => {
    wishlist = [];
    persistWishlist();
    renderAll();
    showToast("Wishlist cleared.");
  });

  document.querySelectorAll("#starSelector .star-btn").forEach((btn) => {
    btn.addEventListener("click", () => setSelectedRating(btn.getAttribute("data-rating")));
  });

  document.getElementById("feedbackForm").addEventListener("submit", handleFeedbackSubmit);
  document.getElementById("saveForMeForm").addEventListener("submit", handleSaveForMeSubmit);
  document.getElementById("closeSaveForMeModal").addEventListener("click", () => document.getElementById("saveForMeModal").classList.add("hidden"));

  document.getElementById("openOwnerPortalBtn").addEventListener("click", openOwnerPortal);
  document.getElementById("closeOwnerAuthModal").addEventListener("click", () => document.getElementById("ownerAuthModal").classList.add("hidden"));
  document.getElementById("closeOwnerProductModal").addEventListener("click", () => document.getElementById("ownerProductModal").classList.add("hidden"));
  document.getElementById("ownerLoginForm").addEventListener("submit", handleOwnerLoginSubmit);

  document.querySelectorAll("#ownerRolePills .role-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      selectedOwnerRole = pill.getAttribute("data-role");
      document.querySelectorAll("#ownerRolePills .role-pill").forEach((p) => p.classList.toggle("active", p === pill));
    });
  });

  document.getElementById("ownerLogoutBtn").addEventListener("click", async () => {
    if (supabaseClient) await supabaseClient.auth.signOut();
    authenticatedOwner = null;
    applyTranslations();
    navigateToHome();
    showToast("Signed out.");
  });

  document.querySelectorAll("#adminTabsBar .admin-tab").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      currentAdminTab = tabBtn.getAttribute("data-tab");
      renderAdminDashboard();
    });
  });

  setupBannerGestures();

  // First-visit language screen check
  if (!currentLang) {
    document.getElementById("languageOverlay").classList.remove("hidden");
  } else {
    setSavedLanguage(currentLang, false);
  }

  triggerBackendExpiryCheck();
  setInterval(() => {
    processExpiredReservationsLocally();
    triggerBackendExpiryCheck();
  }, 60000);
})();

/* === OWNER LONG-PRESS CUSTOM HOME BANNER ADD-ON === */
(function () {
  const modal = document.getElementById("ownerProductModal");
  const form = document.getElementById("ownerProductForm");
  if (!modal || !form) return;

  function fileToDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
  }

  function injectHomeBannerOption() {
    if (!form.querySelector("#editProdEn") || form.querySelector("#openCustomBannerBoxBtn")) return;

    const btnRow = form.querySelector('button[type="submit"]')?.parentElement;
    if (!btnRow) return;

    const homeBannerBtn = document.createElement("button");
    homeBannerBtn.type = "button";
    homeBannerBtn.id = "openCustomBannerBoxBtn";
    homeBannerBtn.className = "secondary-btn";
    homeBannerBtn.textContent = "Home Banner";
    btnRow.insertBefore(homeBannerBtn, btnRow.querySelector("#longPressDeleteBtn") || null);

    const prodNameEn = (form.querySelector("#editProdEn")?.value || "").trim();
    const bannerBox = document.createElement("div");
    bannerBox.id = "customHomeBannerBox";
    bannerBox.className = "hidden";
    bannerBox.style.cssText = "margin-top:14px;padding:14px;border:1.5px solid var(--gold-500);border-radius:12px;background:var(--cream-100);";
    bannerBox.innerHTML = `
      <h4 style="margin:0 0 10px;color:var(--maroon-900);">Add Photo for Homepage Banner</h4>
      <div class="form-group">
        <label>Add Photo (Select prepared 50% Discount / Offer photo)</label>
        <input type="file" id="customBannerFile" accept="image/*" />
      </div>
      <div class="form-group" style="margin-top:8px;">
        <label>Banner Headline (e.g., 50% Discount Offer)</label>
        <input type="text" id="customBannerTitle" value="${prodNameEn.replace(/"/g, "&quot;")}" />
      </div>
      <div class="form-group" style="margin-top:8px;">
        <label>Banner Subtitle (Optional)</label>
        <input type="text" id="customBannerSubtitle" placeholder="Tap to view this product" />
      </div>
      <button type="button" class="gold-btn full-width" id="publishCustomBannerBtn" style="margin-top:10px;">
        Publish to Homepage Banner
      </button>
    `;
    form.appendChild(bannerBox);

    homeBannerBtn.addEventListener("click", () => {
      bannerBox.classList.toggle("hidden");
    });

    bannerBox.querySelector("#publishCustomBannerBtn").addEventListener("click", async () => {
      const pubBtn = bannerBox.querySelector("#publishCustomBannerBtn");
      pubBtn.disabled = true;
      pubBtn.textContent = "Adding Banner...";

      try {
        const stateRaw = localStorage.getItem("aakansha_store_state_v1");
        const storeState = stateRaw ? JSON.parse(stateRaw) : window.AAKANSHA_SEED;
        const prod = (storeState.products || []).find((p) => (p.name_en || "").trim() === prodNameEn) || (storeState.products || [])[0];
        const cat = prod ? (storeState.categories || []).find((c) => c.id === prod.category_id) : null;

        let bannerImg = prod ? prod.image : "";
        const file = bannerBox.querySelector("#customBannerFile")?.files?.[0];
        if (file) {
          const cfg = window.AAKANSHA_CONFIG;
          if (cfg?.supabase?.url && cfg?.supabase?.anonKey && window.supabase) {
            try {
              const sb = window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey);
              const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
              const path = `banners/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
              const { error } = await sb.storage.from(cfg.supabase.storageBucket || "shop-media").upload(path, file);
              if (!error) {
                const { data } = sb.storage.from(cfg.supabase.storageBucket || "shop-media").getPublicUrl(path);
                if (data?.publicUrl) bannerImg = data.publicUrl;
              } else {
                bannerImg = await fileToDataUrl(file);
              }
            } catch (_) {
              bannerImg = await fileToDataUrl(file);
            }
          } else {
            bannerImg = await fileToDataUrl(file);
          }
        }

        const titleText = (bannerBox.querySelector("#customBannerTitle").value || "").trim() || (prod ? prod.name_en : "Special Offer");
        const subtitleText = (bannerBox.querySelector("#customBannerSubtitle").value || "").trim() ||
          (prod ? `₹${Number(prod.price || 0).toLocaleString("en-IN")} • Available at Aakansha Ladies Shop` : "Visit Aakansha Ladies Shop");

        const newBanner = {
          id: "ban-" + Date.now(),
          title_en: titleText,
          title_mr: titleText,
          title_hi: titleText,
          subtitle_en: subtitleText,
          subtitle_mr: subtitleText,
          subtitle_hi: subtitleText,
          image: bannerImg,
          target_type: "product",
          target_id: cat ? cat.id : "",
          product_id: prod ? prod.id : "",
          sort_order: (storeState.banners || []).length + 1
        };

        const cfg = window.AAKANSHA_CONFIG;
        if (cfg?.supabase?.url && cfg?.supabase?.anonKey && window.supabase) {
          try {
            const sb = window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey);
            await sb.from("banners").insert([newBanner]);
          } catch (_) {}
        }

        storeState.banners = storeState.banners || [];
        storeState.banners.push(newBanner);
        localStorage.setItem("aakansha_store_state_v1", JSON.stringify(storeState));

        modal.classList.add("hidden");
        window.location.hash = "#home";
        window.location.reload();
      } finally {
        pubBtn.disabled = false;
        pubBtn.textContent = "Publish to Homepage Banner";
      }
    });
  }

  const observer = new MutationObserver(injectHomeBannerOption);
  observer.observe(form, { childList: true });
})();

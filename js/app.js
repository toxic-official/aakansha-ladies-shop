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

/* === OWNER LONG-PRESS CUSTOM HOME BANNER + BANNER LONG-PRESS DELETE + DB SYNC ADD-ON === */
(function () {
  const modal = document.getElementById("ownerProductModal");
  const form = document.getElementById("ownerProductForm");
  if (!modal || !form) return;

  function compressImageToBlob(file, maxWidth = 1200) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.82);
      };
      img.onerror = () => resolve(file);
      img.src = url;
    });
  }

  function getSupabaseWithSession() {
    const cfg = window.AAKANSHA_CONFIG;
    if (!cfg?.supabase?.url || !cfg?.supabase?.anonKey || !window.supabase) return null;
    return window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey);
  }

  async function ensureSession(sb) {
    if (!sb) return false;
    const authKey = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (authKey) {
      try {
        const parsedAuth = JSON.parse(localStorage.getItem(authKey) || "null");
        if (parsedAuth?.access_token && parsedAuth?.refresh_token) {
          await sb.auth.setSession({
            access_token: parsedAuth.access_token,
            refresh_token: parsedAuth.refresh_token
          });
          return true;
        }
      } catch (_) {}
    }
    const { data } = await sb.auth.getSession();
    return Boolean(data?.session);
  }

  async function ensureProductInDb(sb, prod, cat) {
    if (!sb || !prod || !prod.id) return false;
    const { data: found } = await sb.from("products").select("id").eq("id", prod.id).maybeSingle();
    if (found && found.id) return true;

    if (cat && cat.id) {
      await sb.from("categories").upsert([{
        id: cat.id,
        slug: cat.slug || cat.id,
        name_en: cat.name_en || "Category",
        name_mr: cat.name_mr || cat.name_en || "विभाग",
        name_hi: cat.name_hi || cat.name_en || "श्रेणी",
        image: cat.image || prod.image || "",
        sort_order: Number(cat.sort_order || 1)
      }], { onConflict: "id" });
    }

    const { error } = await sb.from("products").upsert([{
      id: prod.id,
      category_id: (cat && cat.id) || prod.category_id || "cat-cosmetics",
      name_en: prod.name_en || "Product",
      name_mr: prod.name_mr || prod.name_en || "उत्पादन",
      name_hi: prod.name_hi || prod.name_en || "उत्पाद",
      price: Number(prod.price || 0),
      stock: Number(prod.stock || 0),
      image: prod.image || "",
      is_new_arrival: Boolean(prod.is_new_arrival),
      is_popular: Boolean(prod.is_popular),
      sort_order: Number(prod.sort_order || 1)
    }], { onConflict: "id" });

    return !error;
  }

  // Push newly added products from localStorage to Supabase so other devices (like Papa's phone) see them
  let syncingNewProd = false;
  async function syncNewestProductToDb() {
    if (syncingNewProd) return;
    syncingNewProd = true;
    try {
      const sb = getSupabaseWithSession();
      const hasSess = await ensureSession(sb);
      if (!sb || !hasSess) return;

      const raw = localStorage.getItem("aakansha_store_state_v1");
      if (!raw) return;
      const storeState = JSON.parse(raw);
      const prods = Array.isArray(storeState.products) ? storeState.products : [];
      const cats = Array.isArray(storeState.categories) ? storeState.categories : [];
      if (!prods.length) return;

      const { data: dbProds } = await sb.from("products").select("id");
      const dbIds = new Set((dbProds || []).map((r) => r.id));

      for (const p of prods) {
        if (p && p.id && !dbIds.has(p.id)) {
          const cat = cats.find((c) => c.id === p.category_id) || null;
          const ok = await ensureProductInDb(sb, p, cat);
          if (!ok) {
            alert("New product DB sync issue for: " + (p.name_en || p.id));
          }
        }
      }
    } finally {
      syncingNewProd = false;
    }
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
        <label>Add Photo (Select 50% Discount / Offer photo)</label>
        <input type="file" id="customBannerFile" accept="image/*" />
      </div>
      <div class="form-group" style="margin-top:8px;">
        <label>Banner Headline</label>
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
      pubBtn.textContent = "Publishing Banner...";

      try {
        const stateRaw = localStorage.getItem("aakansha_store_state_v1");
        const storeState = stateRaw ? JSON.parse(stateRaw) : JSON.parse(JSON.stringify(window.AAKANSHA_SEED));
        const prod = (storeState.products || []).find((p) => (p.name_en || "").trim() === prodNameEn) || (storeState.products || [])[0];
        const cat = prod ? (storeState.categories || []).find((c) => c.id === prod.category_id) : null;

        const cfg = window.AAKANSHA_CONFIG;
        const sb = getSupabaseWithSession();
        await ensureSession(sb);

        let bannerImg = prod ? prod.image : "";
        const rawFile = bannerBox.querySelector("#customBannerFile")?.files?.[0];

        if (rawFile && sb) {
          const compressed = await compressImageToBlob(rawFile, 1200);
          const path = `banners/ban-${Date.now()}.jpg`;
          const { error: upErr } = await sb.storage
            .from(cfg.supabase.storageBucket || "shop-media")
            .upload(path, compressed, { contentType: "image/jpeg", upsert: true });

          if (!upErr) {
            const { data } = sb.storage.from(cfg.supabase.storageBucket || "shop-media").getPublicUrl(path);
            if (data?.publicUrl) bannerImg = data.publicUrl;
          } else {
            alert("Photo upload error: " + upErr.message);
          }
        }

        const titleText = (bannerBox.querySelector("#customBannerTitle").value || "").trim() || (prod ? prod.name_en : "Special Offer");
        const subtitleText = (bannerBox.querySelector("#customBannerSubtitle").value || "").trim() ||
          (prod ? `₹${Number(prod.price || 0).toLocaleString("en-IN")} • Available at Aakansha Ladies Shop` : "Visit Aakansha Ladies Shop");

        const existingBanners = Array.isArray(storeState.banners) ? storeState.banners : [];
        const maxOrder = existingBanners.reduce((m, b) => Math.max(m, Number(b.sort_order || 0)), 0);

        const localBanner = {
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
          sort_order: maxOrder + 1
        };

        const dbBanner = {
          id: localBanner.id,
          title_en: localBanner.title_en,
          title_mr: localBanner.title_mr,
          title_hi: localBanner.title_hi,
          subtitle_en: localBanner.subtitle_en,
          subtitle_mr: localBanner.subtitle_mr,
          subtitle_hi: localBanner.subtitle_hi,
          image: localBanner.image,
          target_type: localBanner.target_type,
          target_id: localBanner.target_id,
          product_id: null,
          sort_order: localBanner.sort_order
        };

        if (sb && prod && prod.id) {
          const synced = await ensureProductInDb(sb, prod, cat);
          if (synced) {
            dbBanner.product_id = prod.id;
          }
        }

        if (sb) {
          const { error: dbErr } = await sb.from("banners").insert([dbBanner]);
          if (dbErr) {
            alert("Database save error: " + dbErr.message);
            return;
          }
        }

        storeState.banners = [...existingBanners, localBanner];
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

  function bindBannerLongPressDelete() {
    const track = document.getElementById("bannerTrack");
    if (!track) return;

    track.querySelectorAll(".banner-slide").forEach((slide) => {
      if (slide.dataset.longPressBound === "1") return;
      slide.dataset.longPressBound = "1";

      let timer = null;
      let longPressed = false;

      const isOwnerLoggedIn = () => {
        const ownerBtnText = (document.getElementById("ownerBtnText")?.textContent || "").toLowerCase();
        return ownerBtnText.includes("dashboard") || ownerBtnText.includes("डॅशबोर्ड") || ownerBtnText.includes("डैशबोर्ड");
      };

      const startTimer = () => {
        if (!isOwnerLoggedIn()) return;
        longPressed = false;
        timer = setTimeout(async () => {
          longPressed = true;
          const bannerId = slide.getAttribute("data-banner-id");
          if (!bannerId) return;

          const ok = confirm("Remove this banner from Homepage?");
          if (!ok) return;

          const sb = getSupabaseWithSession();
          const hasSess = await ensureSession(sb);
          if (sb && hasSess) {
            const { error } = await sb.from("banners").delete().eq("id", bannerId);
            if (error) {
              alert("Could not delete banner: " + error.message);
              return;
            }
          }

          try {
            const raw = localStorage.getItem("aakansha_store_state_v1");
            if (raw) {
              const parsed = JSON.parse(raw);
              parsed.banners = (parsed.banners || []).filter((b) => b.id !== bannerId);
              localStorage.setItem("aakansha_store_state_v1", JSON.stringify(parsed));
            }
          } catch (_) {}

          window.location.reload();
        }, 600);
      };

      const cancelTimer = () => {
        clearTimeout(timer);
      };

      slide.addEventListener("mousedown", startTimer);
      slide.addEventListener("touchstart", startTimer, { passive: true });
      slide.addEventListener("mouseup", cancelTimer);
      slide.addEventListener("mouseleave", cancelTimer);
      slide.addEventListener("touchend", cancelTimer);

      slide.addEventListener("click", (e) => {
        if (longPressed) {
          e.preventDefault();
          e.stopImmediatePropagation();
          longPressed = false;
        }
      }, true);
    });
  }

  const formObserver = new MutationObserver(() => {
    injectHomeBannerOption();
    syncNewestProductToDb();
  });
  formObserver.observe(form, { childList: true });

  const trackEl = document.getElementById("bannerTrack");
  if (trackEl) {
    const trackObserver = new MutationObserver(bindBannerLongPressDelete);
    trackObserver.observe(trackEl, { childList: true });
    bindBannerLongPressDelete();
  }

  setTimeout(syncNewestProductToDb, 1500);
})();
/* === OWNER LONG-PRESS CUSTOM HOME BANNER + LIVE MULTI-DEVICE SYNC ADD-ON === */
(function () {
  const modal = document.getElementById("ownerProductModal");
  const form = document.getElementById("ownerProductForm");

  function compressImageToBlob(file, maxWidth = 1200) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.82);
      };
      img.onerror = () => resolve(file);
      img.src = url;
    });
  }

  function getSupabaseClient() {
    const cfg = window.AAKANSHA_CONFIG;
    if (!cfg?.supabase?.url || !cfg?.supabase?.anonKey || !window.supabase) return null;
    return window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey);
  }

  async function ensureSession(sb) {
    if (!sb) return false;
    const authKey = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (authKey) {
      try {
        const parsedAuth = JSON.parse(localStorage.getItem(authKey) || "null");
        if (parsedAuth?.access_token && parsedAuth?.refresh_token) {
          await sb.auth.setSession({
            access_token: parsedAuth.access_token,
            refresh_token: parsedAuth.refresh_token
          });
          return true;
        }
      } catch (_) {}
    }
    const { data } = await sb.auth.getSession();
    return Boolean(data?.session);
  }

  let pushTimer = null;
  let lastSyncedSnapshot = "";

  async function pushStoreStateToSupabase(forceShowError = false) {
    const raw = localStorage.getItem("aakansha_store_state_v1");
    if (!raw || raw === lastSyncedSnapshot) return;

    const sb = getSupabaseClient();
    const hasSess = await ensureSession(sb);
    if (!sb || !hasSess) return;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return;
    }

    const cats = Array.isArray(parsed.categories) ? parsed.categories : [];
    const prods = Array.isArray(parsed.products) ? parsed.products : [];

    if (cats.length) {
      const catRows = cats.map((c, idx) => ({
        id: c.id,
        slug: c.slug || c.id,
        name_en: c.name_en || "Category",
        name_mr: c.name_mr || c.name_en || "विभाग",
        name_hi: c.name_hi || c.name_en || "श्रेणी",
        image: c.image || "",
        sort_order: Number(c.sort_order ?? idx + 1)
      }));
      const { error: cErr } = await sb.from("categories").upsert(catRows, { onConflict: "id" });
      if (cErr && forceShowError) {
        alert("Category sync error: " + cErr.message);
        return;
      }
    }

    if (prods.length) {
      const prodRows = prods.map((p, idx) => ({
        id: p.id,
        category_id: p.category_id,
        name_en: p.name_en || "Product",
        name_mr: p.name_mr || p.name_en || "उत्पादन",
        name_hi: p.name_hi || p.name_en || "उत्पाद",
        price: Number(p.price || 0),
        stock: Number(p.stock || 0),
        image: p.image || "",
        is_new_arrival: Boolean(p.is_new_arrival),
        is_popular: Boolean(p.is_popular),
        sort_order: Number(p.sort_order ?? idx + 1)
      }));
      const { error: pErr } = await sb.from("products").upsert(prodRows, { onConflict: "id" });
      if (pErr) {
        if (forceShowError) alert("Product sync error: " + pErr.message);
        return;
      }
    }

    lastSyncedSnapshot = raw;
  }

  // Hook localStorage.setItem so ANY add/edit/delete of product or category triggers DB sync
  const origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    origSetItem(key, value);
    if (key === "aakansha_store_state_v1") {
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => pushStoreStateToSupabase(true), 400);
    }
  };

  function injectHomeBannerOption() {
    if (!form || !form.querySelector("#editProdEn") || form.querySelector("#openCustomBannerBoxBtn")) return;

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
        <label>Add Photo (Select 50% Discount / Offer photo)</label>
        <input type="file" id="customBannerFile" accept="image/*" />
      </div>
      <div class="form-group" style="margin-top:8px;">
        <label>Banner Headline</label>
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
      pubBtn.textContent = "Publishing Banner...";

      try {
        const stateRaw = localStorage.getItem("aakansha_store_state_v1");
        const storeState = stateRaw ? JSON.parse(stateRaw) : JSON.parse(JSON.stringify(window.AAKANSHA_SEED));
        const prod = (storeState.products || []).find((p) => (p.name_en || "").trim() === prodNameEn) || (storeState.products || [])[0];
        const cat = prod ? (storeState.categories || []).find((c) => c.id === prod.category_id) : null;

        const cfg = window.AAKANSHA_CONFIG;
        const sb = getSupabaseClient();
        await ensureSession(sb);

        let bannerImg = prod ? prod.image : "";
        const rawFile = bannerBox.querySelector("#customBannerFile")?.files?.[0];

        if (rawFile && sb) {
          const compressed = await compressImageToBlob(rawFile, 1200);
          const path = `banners/ban-${Date.now()}.jpg`;
          const { error: upErr } = await sb.storage
            .from(cfg.supabase.storageBucket || "shop-media")
            .upload(path, compressed, { contentType: "image/jpeg", upsert: true });

          if (!upErr) {
            const { data } = sb.storage.from(cfg.supabase.storageBucket || "shop-media").getPublicUrl(path);
            if (data?.publicUrl) bannerImg = data.publicUrl;
          } else {
            alert("Photo upload error: " + upErr.message);
          }
        }

        const titleText = (bannerBox.querySelector("#customBannerTitle").value || "").trim() || (prod ? prod.name_en : "Special Offer");
        const subtitleText = (bannerBox.querySelector("#customBannerSubtitle").value || "").trim() ||
          (prod ? `₹${Number(prod.price || 0).toLocaleString("en-IN")} • Available at Aakansha Ladies Shop` : "Visit Aakansha Ladies Shop");

        const existingBanners = Array.isArray(storeState.banners) ? storeState.banners : [];
        const maxOrder = existingBanners.reduce((m, b) => Math.max(m, Number(b.sort_order || 0)), 0);

        const localBanner = {
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
          sort_order: maxOrder + 1
        };

        const dbBanner = {
          id: localBanner.id,
          title_en: localBanner.title_en,
          title_mr: localBanner.title_mr,
          title_hi: localBanner.title_hi,
          subtitle_en: localBanner.subtitle_en,
          subtitle_mr: localBanner.subtitle_mr,
          subtitle_hi: localBanner.subtitle_hi,
          image: localBanner.image,
          target_type: localBanner.target_type,
          target_id: localBanner.target_id,
          product_id: null,
          sort_order: localBanner.sort_order
        };

        if (sb && prod && prod.id) {
          const { data: found } = await sb.from("products").select("id").eq("id", prod.id).maybeSingle();
          if (found && found.id) {
            dbBanner.product_id = prod.id;
          }
        }

        if (sb) {
          const { error: dbErr } = await sb.from("banners").insert([dbBanner]);
          if (dbErr) {
            alert("Database save error: " + dbErr.message);
            return;
          }
        }

        storeState.banners = [...existingBanners, localBanner];
        localStorage.setItem("aakansha_store_state_v1", JSON.stringify(storeState));

        if (modal) modal.classList.add("hidden");
        window.location.hash = "#home";
        window.location.reload();
      } finally {
        pubBtn.disabled = false;
        pubBtn.textContent = "Publish to Homepage Banner";
      }
    });
  }

  function bindBannerLongPressDelete() {
    const track = document.getElementById("bannerTrack");
    if (!track) return;

    track.querySelectorAll(".banner-slide").forEach((slide) => {
      if (slide.dataset.longPressBound === "1") return;
      slide.dataset.longPressBound = "1";

      let timer = null;
      let longPressed = false;

      const isOwnerLoggedIn = () => {
        const ownerBtnText = (document.getElementById("ownerBtnText")?.textContent || "").toLowerCase();
        return ownerBtnText.includes("dashboard") || ownerBtnText.includes("डॅशबोर्ड") || ownerBtnText.includes("डैशबोर्ड");
      };

      const startTimer = () => {
        if (!isOwnerLoggedIn()) return;
        longPressed = false;
        timer = setTimeout(async () => {
          longPressed = true;
          const bannerId = slide.getAttribute("data-banner-id");
          if (!bannerId) return;

          const ok = confirm("Remove this banner from Homepage?");
          if (!ok) return;

          const sb = getSupabaseClient();
          const hasSess = await ensureSession(sb);
          if (sb && hasSess) {
            const { error } = await sb.from("banners").delete().eq("id", bannerId);
            if (error) {
              alert("Could not delete banner: " + error.message);
              return;
            }
          }

          try {
            const raw = localStorage.getItem("aakansha_store_state_v1");
            if (raw) {
              const parsed = JSON.parse(raw);
              parsed.banners = (parsed.banners || []).filter((b) => b.id !== bannerId);
              localStorage.setItem("aakansha_store_state_v1", JSON.stringify(parsed));
            }
          } catch (_) {}

          window.location.reload();
        }, 600);
      };

      const cancelTimer = () => {
        clearTimeout(timer);
      };

      slide.addEventListener("mousedown", startTimer);
      slide.addEventListener("touchstart", startTimer, { passive: true });
      slide.addEventListener("mouseup", cancelTimer);
      slide.addEventListener("mouseleave", cancelTimer);
      slide.addEventListener("touchend", cancelTimer);

      slide.addEventListener("click", (e) => {
        if (longPressed) {
          e.preventDefault();
          e.stopImmediatePropagation();
          longPressed = false;
        }
      }, true);
    });
  }

  if (form) {
    const formObserver = new MutationObserver(injectHomeBannerOption);
    formObserver.observe(form, { childList: true });
  }

  const trackEl = document.getElementById("bannerTrack");
  if (trackEl) {
    const trackObserver = new MutationObserver(bindBannerLongPressDelete);
    trackObserver.observe(trackEl, { childList: true });
    bindBannerLongPressDelete();
  }

  setTimeout(() => pushStoreStateToSupabase(false), 1200);
})();
/* === CUSTOMER LOGIN (NAME + PHONE/OTP + GMAIL) + USER NUMBER + PER-USER WISHLIST === */
(function () {
  const STORAGE_KEY = "aakansha_store_state_v1";
  const ACTIVE_CUSTOMER_KEY = "aakansha_active_customer_v1";

  function getSb() {
    const cfg = window.AAKANSHA_CONFIG;
    if (!cfg?.supabase?.url || !cfg?.supabase?.anonKey || !window.supabase) return null;
    return window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey);
  }

  function normalizeCustomerKey(phone, email) {
    const cleanPhone = (phone || "").replace(/\D/g, "").slice(-10);
    const cleanEmail = (email || "").trim().toLowerCase();
    if (cleanPhone.length >= 10) return "phone:" + cleanPhone;
    if (cleanEmail) return "email:" + cleanEmail;
    return "";
  }

  function getActiveCustomer() {
    try {
      const raw = localStorage.getItem(ACTIVE_CUSTOMER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function setActiveCustomer(cust) {
    if (!cust) {
      localStorage.removeItem(ACTIVE_CUSTOMER_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_CUSTOMER_KEY, JSON.stringify(cust));
  }

  function getStoreState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(window.AAKANSHA_SEED || { wishlist: [] }));
    } catch (_) {
      return { wishlist: [] };
    }
  }

  function saveStoreState(st) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
  }

  function getCustomerLocalWishlist(key) {
    if (!key) return [];
    try {
      const raw = localStorage.getItem("aakansha_wl_" + key);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function setCustomerLocalWishlist(key, list) {
    if (!key) return;
    localStorage.setItem("aakansha_wl_" + key, JSON.stringify(Array.isArray(list) ? list : []));
  }

  function ensureCustomerModal() {
    if (document.getElementById("customerAccountModal")) return;

    const modal = document.createElement("div");
    modal.id = "customerAccountModal";
    modal.className = "modal-backdrop hidden";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(20,4,10,0.65);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px;";
    modal.innerHTML = `
      <div style="background:#fffaf4;color:#2a0812;border:2px solid #c99b3c;border-radius:16px;max-width:430px;width:100%;padding:20px;box-shadow:0 14px 36px rgba(0,0,0,0.35);position:relative;">
        <button type="button" id="closeCustomerModalBtn" style="position:absolute;top:12px;right:14px;background:transparent;border:none;font-size:1.3rem;cursor:pointer;color:#4a0d1d;">✕</button>
        <div id="customerStatusBanner" style="display:none;background:#f7ebd2;border:1px solid #c99b3c;border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:0.9rem;"></div>
        <h3 style="margin:0 0 6px;color:#4a0d1d;">Customer Login / Profile</h3>
        <p style="margin:0 0 14px;font-size:0.85rem;color:#5c2b38;">
          Login with Mobile Number (OTP) or Gmail so your Wishlist stays private & saved for you.
        </p>

        <div style="margin-bottom:10px;">
          <label style="display:block;font-size:0.82rem;font-weight:600;margin-bottom:4px;">Full Name *</label>
          <input type="text" id="custNameInput" placeholder="Enter your name" style="width:100%;padding:9px 11px;border:1px solid #c9b59b;border-radius:8px;box-sizing:border-box;" />
        </div>

        <div style="margin-bottom:10px;">
          <label style="display:block;font-size:0.82rem;font-weight:600;margin-bottom:4px;">Mobile Number (10 digits)</label>
          <div style="display:flex;gap:8px;">
            <input type="tel" id="custPhoneInput" maxlength="10" placeholder="9876543210" style="flex:1;padding:9px 11px;border:1px solid #c9b59b;border-radius:8px;box-sizing:border-box;" />
            <button type="button" id="sendCustOtpBtn" style="padding:9px 12px;border-radius:8px;border:1px solid #4a0d1d;background:#fff;color:#4a0d1d;font-weight:600;cursor:pointer;white-space:nowrap;">
              Send OTP
            </button>
          </div>
        </div>

        <div id="custOtpSection" style="display:none;margin-bottom:10px;background:#fff3dc;padding:10px;border-radius:8px;border:1px dashed #c99b3c;">
          <label style="display:block;font-size:0.8rem;font-weight:600;margin-bottom:4px;">
            Enter 4-digit OTP <span id="custOtpHint" style="color:#7a1c32;"></span>
          </label>
          <input type="text" id="custOtpInput" maxlength="4" placeholder="4-digit OTP" style="width:100%;padding:8px 10px;border:1px solid #c9b59b;border-radius:8px;box-sizing:border-box;" />
        </div>

        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:0.82rem;font-weight:600;margin-bottom:4px;">Gmail / Email</label>
          <input type="email" id="custEmailInput" placeholder="yourname@gmail.com" style="width:100%;padding:9px 11px;border:1px solid #c9b59b;border-radius:8px;box-sizing:border-box;" />
        </div>

        <div style="display:flex;gap:10px;">
          <button type="button" id="saveCustomerLoginBtn" style="flex:1;padding:10px 14px;border-radius:10px;border:none;background:#5c0f24;color:#fff7e8;font-weight:700;cursor:pointer;">
            Login & Save My List
          </button>
          <button type="button" id="logoutCustomerBtn" style="display:none;padding:10px 12px;border-radius:10px;border:1px solid #5c0f24;background:transparent;color:#5c0f24;font-weight:600;cursor:pointer;">
            Logout
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    let generatedOtp = "";

    const openModal = () => {
      const cur = getActiveCustomer();
      const banner = document.getElementById("customerStatusBanner");
      const logoutBtn = document.getElementById("logoutCustomerBtn");
      document.getElementById("custNameInput").value = cur?.full_name || "";
      document.getElementById("custPhoneInput").value = cur?.phone || "";
      document.getElementById("custEmailInput").value = cur?.email || "";
      document.getElementById("custOtpInput").value = "";
      document.getElementById("custOtpSection").style.display = "none";
      generatedOtp = "";

      if (cur && cur.customer_key) {
        banner.style.display = "block";
        banner.innerHTML = `<strong>You are User #${cur.user_number || "?"}</strong> of Aakansha Ladies Shop<br/>Name: <b>${cur.full_name}</b> • ${cur.phone || ""} ${cur.email ? "• " + cur.email : ""}`;
        logoutBtn.style.display = "inline-block";
      } else {
        banner.style.display = "none";
        logoutBtn.style.display = "none";
      }

      modal.classList.remove("hidden");
      modal.style.display = "flex";
    };

    const closeModal = () => {
      modal.classList.add("hidden");
      modal.style.display = "none";
    };

    window.openCustomerLoginModal = openModal;

    document.getElementById("closeCustomerModalBtn").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    document.getElementById("sendCustOtpBtn").addEventListener("click", () => {
      const phone = (document.getElementById("custPhoneInput").value || "").replace(/\D/g, "").slice(-10);
      if (phone.length < 10) {
        alert("Please enter a valid 10-digit mobile number.");
        return;
      }
      generatedOtp = String(Math.floor(1000 + Math.random() * 9000));
      document.getElementById("custOtpSection").style.display = "block";
      document.getElementById("custOtpHint").textContent = `(Demo OTP: ${generatedOtp})`;
      alert("OTP sent to " + phone + ": " + generatedOtp);
    });

    document.getElementById("saveCustomerLoginBtn").addEventListener("click", async () => {
      const fullName = (document.getElementById("custNameInput").value || "").trim();
      const phone = (document.getElementById("custPhoneInput").value || "").replace(/\D/g, "").slice(-10);
      const email = (document.getElementById("custEmailInput").value || "").trim().toLowerCase();
      const enteredOtp = (document.getElementById("custOtpInput").value || "").trim();

      if (!fullName) {
        alert("Please enter your name.");
        return;
      }
      const key = normalizeCustomerKey(phone, email);
      if (!key) {
        alert("Please enter either a 10-digit Mobile Number or Gmail.");
        return;
      }
      if (generatedOtp && enteredOtp !== generatedOtp) {
        alert("Invalid OTP. Please enter: " + generatedOtp);
        return;
      }

      const sb = getSb();
      let userNumber = null;
      let dbItems = null;

      if (sb) {
        await sb.from("customer_accounts").upsert([{
          customer_key: key,
          full_name: fullName,
          phone: phone || null,
          email: email || null,
          last_login_at: new Date().toISOString()
        }], { onConflict: "customer_key" });

        const { data: acc } = await sb
          .from("customer_accounts")
          .select("user_number, full_name, phone, email")
          .eq("customer_key", key)
          .maybeSingle();

        if (acc?.user_number) userNumber = acc.user_number;

        const { data: wlRow } = await sb
          .from("customer_wishlists")
          .select("items")
          .eq("customer_key", key)
          .maybeSingle();

        if (wlRow && Array.isArray(wlRow.items)) {
          dbItems = wlRow.items;
        }
      }

      if (!userNumber) {
        const idxMapRaw = localStorage.getItem("aakansha_user_seq_v1");
        const idxMap = idxMapRaw ? JSON.parse(idxMapRaw) : {};
        if (!idxMap[key]) {
          idxMap[key] = Object.keys(idxMap).length + 1;
          localStorage.setItem("aakansha_user_seq_v1", JSON.stringify(idxMap));
        }
        userNumber = idxMap[key];
      }

      const customerObj = {
        customer_key: key,
        user_number: userNumber,
        full_name: fullName,
        phone,
        email
      };
      setActiveCustomer(customerObj);

      const finalWishlist = dbItems !== null ? dbItems : getCustomerLocalWishlist(key);
      setCustomerLocalWishlist(key, finalWishlist);

      const st = getStoreState();
      st.wishlist = finalWishlist;
      saveStoreState(st);

      closeModal();
      window.location.reload();
    });

    document.getElementById("logoutCustomerBtn").addEventListener("click", () => {
      setActiveCustomer(null);
      const st = getStoreState();
      st.wishlist = [];
      saveStoreState(st);
      closeModal();
      window.location.reload();
    });
  }

  function injectCustomerHeaderButton() {
    ensureCustomerModal();
    if (document.getElementById("customerAccountBtn")) return;

    const ownerBtn = document.getElementById("ownerLoginBtn");
    const targetParent = ownerBtn?.parentElement || document.querySelector("header .header-actions, header nav, header");
    if (!targetParent) return;

    const cur = getActiveCustomer();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "customerAccountBtn";
    btn.className = "secondary-btn";
    btn.style.cssText = "margin-right:8px;padding:6px 12px;border-radius:999px;font-size:0.8rem;cursor:pointer;";
    btn.textContent = cur
      ? `${cur.full_name} (#${cur.user_number || "?"})`
      : "Customer Login";

    btn.addEventListener("click", () => window.openCustomerLoginModal && window.openCustomerLoginModal());

    if (ownerBtn && ownerBtn.parentElement === targetParent) {
      targetParent.insertBefore(btn, ownerBtn);
    } else {
      targetParent.appendChild(btn);
    }
  }

  // Isolate wishlist per logged-in customer and sync to Supabase
  let lastSyncedWlKey = "";
  let lastSyncedWlJson = "";

  async function syncCustomerWishlist() {
    const cur = getActiveCustomer();
    const st = getStoreState();
    const currentList = Array.isArray(st.wishlist) ? st.wishlist : [];

    if (!cur || !cur.customer_key) {
      // Guest user: do not expose another user's wishlist
      if (currentList.length > 0) {
        st.wishlist = [];
        saveStoreState(st);
      }
      return;
    }

    setCustomerLocalWishlist(cur.customer_key, currentList);
    const snap = JSON.stringify(currentList);
    if (cur.customer_key === lastSyncedWlKey && snap === lastSyncedWlJson) return;

    const sb = getSb();
    if (sb) {
      await sb.from("customer_wishlists").upsert([{
        customer_key: cur.customer_key,
        items: currentList,
        updated_at: new Date().toISOString()
      }], { onConflict: "customer_key" });
    }

    lastSyncedWlKey = cur.customer_key;
    lastSyncedWlJson = snap;
  }

  const origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    origSetItem(key, value);
    if (key === STORAGE_KEY) {
      setTimeout(syncCustomerWishlist, 150);
    }
  };

  setTimeout(() => {
    injectCustomerHeaderButton();
    const cur = getActiveCustomer();
    if (cur && cur.customer_key) {
      const st = getStoreState();
      const saved = getCustomerLocalWishlist(cur.customer_key);
      if (JSON.stringify(st.wishlist || []) !== JSON.stringify(saved)) {
        st.wishlist = saved;
        saveStoreState(st);
      }
    }
  }, 400);

  const bodyObs = new MutationObserver(() => injectCustomerHeaderButton());
  bodyObs.observe(document.body, { childList: true, subtree: true });
})();

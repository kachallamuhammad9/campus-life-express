/**
 * Campus Life Express (CLX 2.0) - Core Application Script
 * Powered by Dandalin Sauki Ltd
 */

import { CLX_CONFIG, CAMPUSES, CATEGORIES } from './data.js';
import { api } from './api.js';

// ==================================================
// UTILITIES & HELPERS
// ==================================================
export const Utils = {
    fallbackImage: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80",
    
    formatPrice(amount) {
        return `${CLX_CONFIG.currency}${Number(amount || 0).toLocaleString()}`;
    },

    showToast(message, type = "success") {
        const existing = document.querySelector(".clx-toast");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.className = `clx-toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content" style="display:flex;align-items:center;gap:12px;padding:14px 20px;background:#0F172A;color:#FFF;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.25);position:fixed;bottom:24px;right:24px;z-index:99999;font-size:14px;font-weight:500;">
                <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}" style="color:${type === 'success' ? '#10B981' : '#F59E0B'}"></i>
                <span>${message}</span>
            </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = "opacity 0.3s ease, transform 0.3s ease";
            toast.style.opacity = "0";
            toast.style.transform = "translateY(10px)";
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }
};

// ==================================================
// CAMPUS MANAGER
// ==================================================
export const CampusManager = {
    init() {
        this.modal = document.getElementById("campus-modal");
        this.select = document.getElementById("campus-select");
        this.continueBtn = document.getElementById("continue-campus");
        this.badge = document.getElementById("active-campus-badge");
        this.selectedCampus = api.campuses.getSelectedCampus();

        this.renderCampusOptions();
        this.bindEvents();
        this.updateCampusUI();

        // If no campus has been picked yet in this session/storage, display selector modal
        if (!localStorage.getItem("clx_selected_campus")) {
            this.showModal();
        }
    },

    renderCampusOptions() {
        if (this.select) {
            this.select.innerHTML = CAMPUSES.map(c => 
                `<option value="${c.id}" ${c.id === this.selectedCampus ? 'selected' : ''}>${c.shortName} - ${c.name}</option>`
            ).join('');
        }

        const optionsContainer = document.querySelector(".campus-options");
        if (optionsContainer) {
            optionsContainer.innerHTML = CAMPUSES.map(c => `
                <div class="campus-option ${c.id === this.selectedCampus ? 'active' : ''}" data-campus="${c.id}" style="cursor:pointer;padding:16px;border-radius:14px;border:2px solid ${c.id === this.selectedCampus ? 'var(--color-primary)' : 'var(--gray-200)'};display:flex;align-items:center;gap:14px;background:#fff;margin-bottom:10px;">
                    <div style="width:42px;height:42px;border-radius:50%;background:rgba(0,31,127,0.08);display:flex;align-items:center;justify-content:center;color:var(--color-primary);font-weight:700;">
                        ${c.shortName.slice(0, 2)}
                    </div>
                    <div>
                        <h4 style="font-size:15px;font-weight:700;color:var(--gray-900);margin:0;">${c.name}</h4>
                        <span style="font-size:12px;color:var(--gray-500);">${c.shortName} • ${c.location}</span>
                    </div>
                </div>
            `).join('');
        }
    },

    bindEvents() {
        if (this.select) {
            this.select.addEventListener("change", (e) => {
                this.setCampus(e.target.value);
            });
        }

        document.querySelectorAll(".campus-option").forEach(opt => {
            opt.addEventListener("click", () => {
                document.querySelectorAll(".campus-option").forEach(o => {
                    o.style.borderColor = "var(--gray-200)";
                    o.classList.remove("active");
                });
                opt.style.borderColor = "var(--color-primary)";
                opt.classList.add("active");
                this.selectedCampus = opt.dataset.campus;
                if (this.continueBtn) this.continueBtn.disabled = false;
            });
        });

        if (this.continueBtn) {
            this.continueBtn.addEventListener("click", () => {
                if (this.selectedCampus) {
                    this.setCampus(this.selectedCampus);
                    this.hideModal();
                }
            });
        }

        if (this.badge) {
            this.badge.addEventListener("click", () => this.showModal());
        }
    },

    setCampus(campusId) {
        this.selectedCampus = campusId;
        api.campuses.setSelectedCampus(campusId);
        this.updateCampusUI();
        window.dispatchEvent(new CustomEvent("clx:campus-changed", { detail: { campusId } }));
        Utils.showToast(`Active campus updated: ${this.getCampusName()}`);
    },

    getCampusName() {
        const campus = CAMPUSES.find(c => c.id === this.selectedCampus);
        return campus ? campus.name : "University Campus";
    },

    getCampusShortName() {
        const campus = CAMPUSES.find(c => c.id === this.selectedCampus);
        return campus ? campus.shortName : "CAMPUS";
    },

    updateCampusUI() {
        if (this.badge) {
            this.badge.innerHTML = `<i class="fa-solid fa-location-dot"></i> <span>Serving: <strong>${this.getCampusShortName()}</strong></span>`;
        }
        if (this.select) {
            this.select.value = this.selectedCampus;
        }
    },

    showModal() {
        if (this.modal) this.modal.classList.add("active");
    },

    hideModal() {
        if (this.modal) this.modal.classList.remove("active");
    }
};

// ==================================================
// ==================================================
// CART MANAGER (Single-Vendor MVP Model)
// ==================================================
export const CartManager = {
    items: [],
    remoteCart: null,

    init() {
        try {
            this.items = JSON.parse(localStorage.getItem("clx_cart_items") || "[]");
        } catch (e) {
            this.items = [];
        }
        this.cartBtn = document.getElementById("cart-btn");
        this.cartCount = document.getElementById("cart-count");
        this.cartDrawer = document.getElementById("cart-drawer");
        this.overlay = document.getElementById("cart-overlay");
        this.closeBtn = document.getElementById("close-cart");

        this.bindEvents();
        this.updateUI();
        this.syncFromBackend();
        window.addEventListener("clx:auth-changed", () => {
            if (api.auth.getToken()) {
                this.syncFromBackend();
                return;
            }
            this.remoteCart = null;
            this.items = [];
            this.save();
            this.updateUI();
        });
    },

    async syncFromBackend() {
        if (!api.auth.getToken()) return;
        const res = await api.cart.get();
        if (res.success && res.data?.cart) {
            this.applyRemoteCart(res.data.cart);
            this.updateUI();
        }
    },

    applyRemoteCart(cart) {
        this.remoteCart = cart;
        this.items = (cart.items || []).map(item => ({
            id: item.productId,
            cartItemId: item.id,
            name: item.productName,
            price: Number(item.unitPriceKobo || 0) / 100,
            vendorId: cart.vendorId || "v-general",
            vendorName: cart.vendor?.name || "Campus Vendor",
            image: item.productImageUrl || Utils.fallbackImage,
            campus: cart.campus?.slug || CampusManager.selectedCampus,
            quantity: item.quantity,
            totalPriceKobo: item.totalPriceKobo
        }));
    },

    bindEvents() {
        // Remove prior listener duplication if any
        if (this.cartBtn && !this.cartBtn.dataset.bound) {
            this.cartBtn.dataset.bound = "true";
            this.cartBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.open();
            });
        }
        if (this.closeBtn && !this.closeBtn.dataset.bound) {
            this.closeBtn.dataset.bound = "true";
            this.closeBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.close();
            });
        }
        if (this.overlay && !this.overlay.dataset.bound) {
            this.overlay.dataset.bound = "true";
            this.overlay.addEventListener("click", (e) => {
                e.preventDefault();
                this.close();
            });
        }

        // Global delegate for cart button triggers (e.g. dynamic buttons)
        if (!document.body.dataset.cartDelegated) {
            document.body.dataset.cartDelegated = "true";

            document.addEventListener("click", (e) => {
                const trigger = e.target.closest("#cart-btn, .open-cart-btn, [data-action='open-cart']");
                if (trigger) {
                    e.preventDefault();
                    this.open();
                    return;
                }

                const closeTrigger = e.target.closest("#close-cart, .close-cart-btn, [data-action='close-cart']");
                if (closeTrigger) {
                    e.preventDefault();
                    this.close();
                    return;
                }

                const addBtn = e.target.closest(".add-to-cart-btn");
                if (addBtn) {
                    e.preventDefault();
                    const card = addBtn.closest("[data-id]");
                    if (!card) return;

                    const item = {
                        id: card.dataset.id,
                        name: card.dataset.name,
                        price: Number(card.dataset.price || 0),
                        vendorId: card.dataset.vendorId || "v-general",
                        vendorName: card.dataset.vendorName || "Campus Vendor",
                        image: card.dataset.image || Utils.fallbackImage,
                        campus: card.dataset.campus || (CampusManager.selectedCampus || "unimaid"),
                        quantity: 1
                    };
                    this.addItem(item);
                }
            });
        }
    },

    async addItem(item) {
        if (api.auth.getToken()) {
            const res = await api.cart.addItem(item.id, 1);
            if (!res.success) {
                Utils.showToast(res.error?.message || "Unable to add this item", "error");
                return;
            }
            this.applyRemoteCart(res.data?.cart || {});
            this.updateUI();
            Utils.showToast(`Added "${item.name}" to cart`);
            this.open();
            return;
        }

        // Enforce 1 vendor per cart constraint
        if (this.items.length > 0 && this.items[0].vendorId !== item.vendorId) {
            const confirmChange = confirm(`Your cart contains items from "${this.items[0].vendorName}". CLX supports 1 vendor per checkout.\n\nWould you like to clear your cart and add this item from "${item.vendorName}"?`);
            if (!confirmChange) return;
            this.items = [];
        }

        const existing = this.items.find(i => i.id === item.id);
        if (existing) {
            existing.quantity += 1;
        } else {
            this.items.push(item);
        }

        this.save();
        this.updateUI();
        Utils.showToast(`Added "${item.name}" to cart`);
        this.open();
    },

    async removeItem(id) {
        const item = this.items.find(i => i.id === id);
        if (api.auth.getToken() && item?.cartItemId) {
            const res = await api.cart.removeItem(item.cartItemId);
            if (!res.success) {
                Utils.showToast(res.error?.message || "Unable to remove this item", "error");
                return;
            }
            this.applyRemoteCart(res.data?.cart || { items: [] });
            this.updateUI();
            return;
        }
        this.items = this.items.filter(i => i.id !== id);
        this.save();
        this.updateUI();
    },

    async updateQuantity(id, delta) {
        const item = this.items.find(i => i.id === id);
        if (!item) return;
        if (api.auth.getToken() && item.cartItemId) {
            const res = await api.cart.updateItem(item.cartItemId, item.quantity + delta);
            if (!res.success) {
                Utils.showToast(res.error?.message || "Unable to update cart quantity", "error");
                return;
            }
            this.applyRemoteCart(res.data?.cart || { items: [] });
            this.updateUI();
            return;
        }
        item.quantity += delta;
        if (item.quantity <= 0) {
            this.removeItem(id);
        } else {
            this.save();
            this.updateUI();
        }
    },

    save() {
        localStorage.setItem("clx_cart_items", JSON.stringify(this.items));
    },

    async clear() {
        if (api.auth.getToken()) {
            const res = await api.cart.clear();
            if (!res.success) {
                Utils.showToast(res.error?.message || "Unable to clear cart", "error");
                return;
            }
            this.applyRemoteCart(res.data?.cart || { items: [] });
            this.updateUI();
            return;
        }
        this.items = [];
        this.save();
        this.updateUI();
    },

    getSubtotal() {
        if (api.auth.getToken() && this.remoteCart) {
            return Number(this.remoteCart.subtotalKobo || 0) / 100;
        }
        return this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    },

    getDeliveryFee() {
        return this.items.length > 0 ? 400 : 0;
    },

    getServiceFee() {
        return this.items.length > 0 ? 100 : 0;
    },

    getTotal() {
        if (api.auth.getToken() && this.remoteCart) {
            return this.getSubtotal();
        }
        return this.getSubtotal() + this.getDeliveryFee() + this.getServiceFee();
    },

    updateUI() {
        this.cartCount = document.getElementById("cart-count");
        const totalCount = this.items.reduce((sum, i) => sum + i.quantity, 0);
        if (this.cartCount) {
            this.cartCount.textContent = totalCount;
            this.cartCount.style.display = totalCount > 0 ? "flex" : "none";
        }

        const container = document.getElementById("cart-items-container");
        const subtotalEl = document.getElementById("cart-subtotal");
        const deliveryEl = document.getElementById("cart-delivery-fee");
        const totalEl = document.getElementById("cart-total");
        const checkoutBtn = document.getElementById("cart-checkout-btn");
        const vendorBadge = document.getElementById("cart-vendor-name");

        if (subtotalEl) subtotalEl.textContent = Utils.formatPrice(this.getSubtotal());
        if (deliveryEl) deliveryEl.textContent = Utils.formatPrice(this.getDeliveryFee());
        if (totalEl) totalEl.textContent = Utils.formatPrice(this.getTotal());

        if (vendorBadge) {
            vendorBadge.textContent = this.items.length > 0 ? `Vendor: ${this.items[0].vendorName}` : "";
        }

        if (checkoutBtn) {
            checkoutBtn.disabled = this.items.length === 0;
        }

        if (container) {
            if (this.items.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center;padding:48px 20px;color:var(--gray-500);">
                        <i class="fa-solid fa-cart-shopping" style="font-size:42px;color:var(--gray-300);margin-bottom:16px;"></i>
                        <h4 style="font-size:16px;color:var(--gray-800);margin-bottom:6px;">Your cart is empty</h4>
                        <p style="font-size:13px;">Add meals, shopping products or stationery to order.</p>
                    </div>
                `;
            } else {
                container.innerHTML = this.items.map(item => `
                    <div style="display:flex;gap:14px;padding:14px 0;border-bottom:1px solid var(--gray-200);align-items:center;">
                        <img src="${item.image}" alt="${item.name}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0;">
                        <div style="flex-grow:1;min-width:0;">
                            <h5 style="font-size:14px;font-weight:600;margin:0 0 4px;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</h5>
                            <span style="font-size:13px;font-weight:700;color:var(--color-primary);">${Utils.formatPrice(item.price)}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;background:var(--gray-100);padding:4px 8px;border-radius:8px;flex-shrink:0;">
                            <button type="button" onclick="window.CLX.cart.updateQuantity('${item.id}', -1)" style="font-size:14px;font-weight:700;color:var(--gray-700);width:20px;background:none;border:none;cursor:pointer;">-</button>
                            <span style="font-size:13px;font-weight:600;min-width:16px;text-align:center;">${item.quantity}</span>
                            <button type="button" onclick="window.CLX.cart.updateQuantity('${item.id}', 1)" style="font-size:14px;font-weight:700;color:var(--gray-700);width:20px;background:none;border:none;cursor:pointer;">+</button>
                        </div>
                    </div>
                `).join('');
            }
        }
    },

    open() {
        if (!this.cartDrawer) this.cartDrawer = document.getElementById("cart-drawer");
        if (!this.overlay) this.overlay = document.getElementById("cart-overlay");

        this.updateUI();

        if (this.cartDrawer) {
            this.cartDrawer.classList.add("active");
            this.cartDrawer.style.right = "0px";
        }
        if (this.overlay) {
            this.overlay.classList.add("active");
            this.overlay.style.opacity = "1";
            this.overlay.style.visibility = "visible";
            this.overlay.style.pointerEvents = "auto";
        }
    },

    close() {
        if (!this.cartDrawer) this.cartDrawer = document.getElementById("cart-drawer");
        if (!this.overlay) this.overlay = document.getElementById("cart-overlay");

        if (this.cartDrawer) {
            this.cartDrawer.classList.remove("active");
            this.cartDrawer.style.right = "-450px";
        }
        if (this.overlay) {
            this.overlay.classList.remove("active");
            this.overlay.style.opacity = "0";
            this.overlay.style.visibility = "hidden";
            this.overlay.style.pointerEvents = "none";
        }
    }
};

// ==================================================
// GLOBAL SEARCH CONTROLLER
// ==================================================
export const SearchController = {
    init() {
        this.overlay = document.getElementById("search-overlay");
        this.searchInput = document.getElementById("global-search-input");
        this.closeBtn = document.getElementById("close-search");
        this.resultsContainer = document.getElementById("search-results-box");
        this.activeTab = "all";

        this.bindEvents();
    },

    bindEvents() {
        document.querySelectorAll(".search-trigger").forEach(el => {
            el.addEventListener("click", () => this.open());
        });

        if (this.closeBtn) {
            this.closeBtn.addEventListener("click", () => this.close());
        }

        if (this.searchInput) {
            let timeout;
            this.searchInput.addEventListener("input", (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => this.performSearch(e.target.value), 250);
            });
        }

        document.querySelectorAll(".search-tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".search-tab-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.activeTab = btn.dataset.tab;
                if (this.searchInput) this.performSearch(this.searchInput.value);
            });
        });
    },

    open() {
        if (this.overlay) {
            this.overlay.classList.add("active");
            if (this.searchInput) {
                setTimeout(() => this.searchInput.focus(), 100);
            }
        }
    },

    close() {
        if (this.overlay) this.overlay.classList.remove("active");
    },

    async performSearch(query) {
        if (!this.resultsContainer) return;
        if (!query || query.trim().length === 0) {
            this.resultsContainer.innerHTML = `<div style="text-align:center;padding:32px;color:var(--gray-400);">Search for food, products, services, or marketplace items on campus.</div>`;
            return;
        }

        this.resultsContainer.innerHTML = `<div style="text-align:center;padding:24px;color:var(--gray-500);"><i class="fa-solid fa-spinner fa-spin"></i> Searching across campus...</div>`;
        const res = await api.search.global(query, CampusManager.selectedCampus);

        let html = '';
        const hasProducts = res.products.length > 0;
        const hasServices = res.services.length > 0;
        const hasMarketplace = res.marketplace.length > 0;
        const hasVendors = res.vendors.length > 0;

        if (!hasProducts && !hasServices && !hasMarketplace && !hasVendors) {
            this.resultsContainer.innerHTML = `<div style="text-align:center;padding:32px;color:var(--gray-500);">No results found for "<strong>${query}</strong>" on ${CampusManager.getCampusShortName()}.</div>`;
            return;
        }

        // Render Products
        if ((this.activeTab === "all" || this.activeTab === "products") && hasProducts) {
            html += `<h4 style="font-size:13px;text-transform:uppercase;color:var(--gray-500);margin:16px 0 8px;font-weight:700;">Products & Food (${res.products.length})</h4>`;
            html += res.products.map(p => `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-100);">
                    <img src="${p.image}" style="width:44px;height:44px;border-radius:8px;object-fit:cover;">
                    <div style="flex-grow:1;">
                        <a href="${p.category === 'food' ? 'food.html' : 'shopping.html'}" style="font-weight:600;font-size:14px;color:var(--gray-900);">${p.name}</a>
                        <div style="font-size:12px;color:var(--gray-500);">${p.vendorName} • <span style="color:var(--color-primary);font-weight:700;">${Utils.formatPrice(p.price)}</span></div>
                    </div>
                </div>
            `).join('');
        }

        // Render Services
        if ((this.activeTab === "all" || this.activeTab === "services") && hasServices) {
            html += `<h4 style="font-size:13px;text-transform:uppercase;color:var(--gray-500);margin:16px 0 8px;font-weight:700;">Campus Services (${res.services.length})</h4>`;
            html += res.services.map(s => `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-100);">
                    <img src="${s.image}" style="width:44px;height:44px;border-radius:8px;object-fit:cover;">
                    <div style="flex-grow:1;">
                        <a href="services.html" style="font-weight:600;font-size:14px;color:var(--gray-900);">${s.name}</a>
                        <div style="font-size:12px;color:var(--gray-500);">${s.providerName} • <span style="color:var(--color-primary);font-weight:700;">${s.priceLabel}</span></div>
                    </div>
                </div>
            `).join('');
        }

        // Render Marketplace
        if ((this.activeTab === "all" || this.activeTab === "marketplace") && hasMarketplace) {
            html += `<h4 style="font-size:13px;text-transform:uppercase;color:var(--gray-500);margin:16px 0 8px;font-weight:700;">Student Marketplace (${res.marketplace.length})</h4>`;
            html += res.marketplace.map(m => `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-100);">
                    <img src="${m.image}" style="width:44px;height:44px;border-radius:8px;object-fit:cover;">
                    <div style="flex-grow:1;">
                        <a href="marketplace.html" style="font-weight:600;font-size:14px;color:var(--gray-900);">${m.title}</a>
                        <div style="font-size:12px;color:var(--gray-500);">${m.condition} • Seller: ${m.sellerName} • <span style="color:var(--color-primary);font-weight:700;">${Utils.formatPrice(m.price)}</span></div>
                    </div>
                </div>
            `).join('');
        }

        // Render Vendors
        if ((this.activeTab === "all" || this.activeTab === "vendors") && hasVendors) {
            html += `<h4 style="font-size:13px;text-transform:uppercase;color:var(--gray-500);margin:16px 0 8px;font-weight:700;">Campus Businesses (${res.vendors.length})</h4>`;
            html += res.vendors.map(v => `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-100);">
                    <img src="${v.image}" style="width:44px;height:44px;border-radius:8px;object-fit:cover;">
                    <div style="flex-grow:1;">
                        <a href="vendors.html" style="font-weight:600;font-size:14px;color:var(--gray-900);">${v.name}</a>
                        <div style="font-size:12px;color:var(--gray-500);">${v.location} • ⭐ ${v.rating}</div>
                    </div>
                </div>
            `).join('');
        }

        this.resultsContainer.innerHTML = html;
    }
};

// ==================================================
// AUTHENTICATION STATE
// ==================================================
export const AuthManager = {
    user: null,

    init() {
        this.user = api.auth.getUserProfile();
        window.addEventListener("clx:auth-changed", (event) => {
            this.user = event.detail?.user || null;
        });

        if (api.auth.getToken()) {
            api.auth.getMe().then((res) => {
                if (res.success) this.user = res.data;
            });
        }
    }
};

// ==================================================
// GLOBAL INITIALIZER
// ==================================================
// Expose global CLX namespace immediately
window.CLX = {
    config: CLX_CONFIG,
    api,
    campus: CampusManager,
    cart: CartManager,
    search: SearchController,
    auth: AuthManager,
    utils: Utils,
    getCampus: () => CampusManager.selectedCampus
};

function initCLXApp() {
    CampusManager.init();
    CartManager.init();
    SearchController.init();
    AuthManager.init();

    // Mobile nav toggle
    const mobileToggle = document.getElementById("mobile-toggle");
    const mobileMenu = document.getElementById("mobile-menu");
    const closeMenu = document.getElementById("close-menu");
    const menuOverlay = document.getElementById("menu-overlay");

    if (mobileToggle && mobileMenu && menuOverlay && !mobileToggle.dataset.bound) {
        mobileToggle.dataset.bound = "true";
        mobileToggle.addEventListener("click", () => {
            mobileMenu.classList.add("active");
            menuOverlay.classList.add("active");
        });
        if (closeMenu) {
            closeMenu.addEventListener("click", () => {
                mobileMenu.classList.remove("active");
                menuOverlay.classList.remove("active");
            });
        }
        menuOverlay.addEventListener("click", () => {
            mobileMenu.classList.remove("active");
            menuOverlay.classList.remove("active");
        });
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCLXApp);
} else {
    initCLXApp();
}

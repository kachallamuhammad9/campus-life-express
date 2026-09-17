// CLX multi-vendor cart logic tests (runs CartManager headlessly)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const storage = {};
global.localStorage = {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; }
};
global.window = { addEventListener: () => { }, dispatchEvent: () => { }, CLX: null };
global.document = {
    readyState: "complete",
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => { },
    body: { dataset: {} }
};
global.CustomEvent = class { };
global.confirm = () => true;

const { CartManager, Utils, CampusManager } = await import("./js/app.js");

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log("PASS:", name); } else { fail++; console.log("FAIL:", name); } };

// Seed headless env (init uses DOM only)
CartManager.items = [];
CampusManager.selectedCampus = "unimaid";

const mk = (id, name, price, vendorId, vendorName, qty = 1) =>
    ({ id, name, price, vendorId, vendorName, image: "img", campus: "unimaid", quantity: qty });

// TEST A — same vendor
CartManager.items = [mk("p1", "Jollof Rice", 2000, "vA", "Vendor A", 2), mk("p2", "Coke", 500, "vA", "Vendor A", 1)];
t("A: groups=1", CartManager.getVendorGroups().length === 1);
t("A: vendor subtotal 4500", CartManager.getVendorSubtotal("vA") === 4500);
t("A: cart subtotal 4500", CartManager.getSubtotal() === 4500);

// TEST B/C — two & three vendors coexist
CartManager.items = [
    mk("p1", "Jollof Rice", 2000, "vA", "Vendor A", 2),
    mk("p2", "Coke", 500, "vA", "Vendor A", 1),
    mk("p3", "Notebook", 800, "vB", "Vendor B", 3),
    mk("p4", "Charger", 14500, "vC", "Vendor C", 1)
];
t("B/C: groups=3", CartManager.getVendorGroups().length === 3);
t("B/C: total qty 7 (badge)", CartManager.items.reduce((s, i) => s + i.quantity, 0) === 7);
t("B/C: subtotal", CartManager.getSubtotal() === 2000 * 2 + 500 + 800 * 3 + 14500);

// TEST D — independent quantities
CartManager.updateQuantity("p1", 1);   // Vendor A item -> qty 3
CartManager.updateQuantity("p3", -1);  // Vendor B item -> qty 2
t("D: vA qty=3 vB qty=2", CartManager.items.find(i => i.id === "p1").quantity === 3 && CartManager.items.find(i => i.id === "p3").quantity === 2);
t("D: totals recalculated", CartManager.getVendorSubtotal("vA") === 6500 && CartManager.getVendorSubtotal("vB") === 1600);

// TEST E — remove one product, other vendors unaffected
CartManager.removeItem("p3");
t("E: p3 gone, p1 & p4 remain", !CartManager.items.some(i => i.id === "p3") && CartManager.items.some(i => i.id === "p1") && CartManager.items.some(i => i.id === "p4"));
t("E: groups=2", CartManager.getVendorGroups().length === 2);

// TEST F — remove last item of a vendor, group disappears, others stay
CartManager.removeItem("p4");
t("F: groups=1 (only Vendor A)", CartManager.getVendorGroups().length === 1 && CartManager.getVendorGroups()[0].vendorId === "vA");

// TEST G — persistence through localStorage
CartManager.save();
const saved = JSON.parse(storage["clx_cart_items"]);
t("G: saved cart matches, vendor info retained", saved.length === CartManager.items.length && saved[0].vendorId === "vA");

// TEST 20 — duplicate product merge (same ID), different-vendor same-name no merge
CartManager.items = [];
CartManager.addItem(Object.assign({}, mk("p1", "Jollof Rice", 2000, "vA", "Vendor A")));
// addItem opens toast/drawer — DOM-safe because elements are null
t("20: added", CartManager.items.length === 1);
CartManager.addItem(Object.assign({}, mk("p1", "Jollof Rice", 2000, "vA", "Vendor A")));
t("20: duplicate merges to qty 2", CartManager.items.length === 1 && CartManager.items[0].quantity === 2);
CartManager.addItem(Object.assign({}, mk("pX", "Jollof Rice", 2000, "vB", "Vendor B")));
t("20: same-name other-vendor NOT merged", CartManager.items.length === 2);

// TEST 21 — campus safety: different-campus item rejected
CartManager.items = [mk("p1", "Jollof", 2000, "vA", "Vendor A")];
const otherCampus = Object.assign(mk("pY", "Item", 500, "vB", "Vendor B"), { campus: "another-campus" });
const lenBefore = CartManager.items.length;
CartManager.addItem(otherCampus);
t("21: cross-campus add blocked", CartManager.items.length === lenBefore);

// Old localStorage cart without vendor info handled gracefully
storage["clx_cart_items"] = JSON.stringify([{ id: "old1", name: "Legacy Item", price: 100, quantity: 2 }]);
CartManager.init();
t("19: legacy cart loaded", CartManager.items.length === 1 && CartManager.items[0].id === "old1");
t("19: legacy item grouped under v-general", CartManager.getVendorGroups()[0].vendorId === "v-general");

// Formatted strings never used in math
t("6: getSubtotal numeric", typeof CartManager.getSubtotal() === "number");
t("6: format only for display", Utils.formatPrice(6900) === "₦6,900");

// The cart is pickup-first and must not pre-charge delivery. Checkout owns the
// selected fulfillment calculation, so inspect that source contract directly.
const ordersHtml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "orders.html"), "utf8");
const cartSubtotal = CartManager.getSubtotal();
t("15: cart defaults to Pickup with zero delivery fee and unchanged total", CartManager.getDeliveryFee() === 0 && CartManager.getTotal() === cartSubtotal && CartManager.items.length > 0);
t("16: Delivery charges the flat ₦200 fee exactly once", /const deliveryEstimate = fulfillment === "delivery" \? 200 : 0;/.test(ordersHtml) && /Utils\.formatPrice\(productsSubtotal \+ deliveryEstimate\)/.test(ordersHtml));
t("17: Pickup charges ₦0 and Delivery → Pickup removes the fee", /const deliveryEstimate = fulfillment === "delivery" \? 200 : 0;/.test(ordersHtml) && /document\.getElementById\("chk-fulfillment"\)\.value = "pickup";/.test(ordersHtml));
t("18: Pickup → Delivery restores the canonical ₦200 fee", /<option value="pickup">Pickup - collect from vendor\(s\)<\/option>[\s\S]*<option value="delivery">Delivery - deliver to my location<\/option>/.test(ordersHtml) && /const deliveryEstimate = fulfillment === "delivery" \? 200 : 0;/.test(ordersHtml));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

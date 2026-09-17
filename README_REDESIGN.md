# ERP Jewellery — Redesign Notes

Yeh poora backend redesign + naye modules + basic frontend pages hai, jo aapke
docx roadmap (Phase 1–8, 35 items) ke hisaab se banaya gaya hai. Neeche setup,
demo login, aur kya-kya badla/bana hai uska summary hai.

## Setup

```bash
# Backend
cd backend
npm install
cp .env.example .env   # DB_HOST, DB_USER, DB_PASSWORD, DB_NAME set karo
npm run db:sync        # saari tables create/alter karega
npm run db:seed:demo   # demo tenant + branch + admin + sample data banayega
npm run dev             # ya: npm start

# Frontend
cd frontend
npm install
npm run dev
```

**Demo login (seed ke baad):** `admin@demo.test` / `Admin@123`

Demo seed ke baad turant dekh sakte ho:
- `/api/items` → "Male Gold Ring" ek hi row me 8 pieces (5+3 merge hua) — duplicate bug fix proof
- Gold Rate, Pricing Profiles (Retail/Wholesale) already set — pehle din se price dikhega

## Kya-kya redesign hua (aapke 2 sawaalon ke jawab)

### 1. Duplicate item bug — FIXED
Root cause: `Item` table me design/naam/type/gender sab kuch mixed tha, isliye har
"add item" ek naya row bana deta tha.

Fix: naya `ProductMaster` (Design Master) layer banaya — "Male Ring 22K" jaisi
design ek baar banti hai, reuse hoti hai. `Item` ab sirf stock lot hai. BULK mode
me agar same design + same location + same bucket (tray/retail/wholesale)
already `IN_STOCK` hai, to naya row nahi banta — existing ke `BulkItem` me hi
quantity/weight merge ho jaati hai. Real MySQL DB pe test karke verify kiya
(`backend/src/controllers/itemController.js`, function `createItemInternal`).

### 2. Retail/Wholesale pricing with daily gold rate — SOLVED
`backend/src/utils/pricingEngine.js` core engine hai:
- `GoldRate` table — roz ka rate insert hota hai, purana kabhi delete nahi hota
- `PricingProfile` — RETAIL aur WHOLESALE ke liye alag making charge/wastage %
- Price kabhi DB me store nahi hota — har baar live calculate hota hai, isliye
  gold rate badalte hi poora inventory ka price automatically update ho jaata hai
- `PriceSnapshot` — sirf SALE ke waqt price freeze hota hai, taaki purani
  invoice kabhi na badle
- Item pe optional `override_price` bhi hai agar kisi piece ka price manually
  fix karna ho

Dono live test kiye: gold rate 6350→6500 karne par ek existing item ka retail
price ₹308,711 se ₹316,004 automatically badal gaya (koi manual edit nahi kiya).

## Poora roadmap coverage (Phase 1–8)

| Phase | Kya bana |
|---|---|
| 1. Foundation | Category, ProductMaster (Design), redesigned Item, Inventory Status |
| 2. Gold/Material | GoldRate, PurityMaster, StoneMaster, RawMaterial |
| 3. Pricing | PricingProfile (Retail/Wholesale), PriceSnapshot, live pricing engine |
| 4. Stock Ops | StockMovement ledger, StockTransfer (redesigned), StockReservation, RepairOrder, StockAdjustment |
| 5. Purchase | Supplier (renamed from Vendor), Purchase (redesigned), PurchaseItem, Purchase→Inventory |
| 6. Sales | Customer, Sale, SaleItem, Invoice, Sale→Inventory |
| 7. Control | StockAudit, Inventory Valuation report, Slow-Moving/Dead Stock report |
| 8. Advanced | Barcode/QR (existing, kept), ManufacturingOrder + RawMaterial, Repair Management (part of RepairOrder), Reports, Dashboard |

## Testing done

Sab kuch ek real MySQL instance (not mocked) pe chala ke verify kiya gaya:
- Har naya backend file `node --check` se syntax-verified
- `npm run db:sync` se saari 30+ tables bina error ke ban gayin
- Demo seed script chalaya — end-to-end flow (categories → purities → gold
  rate → pricing profiles → designs → merged stock) successfully bana
- Saare 24 naye API endpoints ko live curl se HTTP 200 confirm kiya
- Duplicate-item fix, autofill/lookup, live pricing, gold-rate-triggered price
  update, sale → inventory decrement, aur purchase → receive-into-inventory
  merge — sab real requests se test kiye
- Frontend `npm run build` clean pass hua (koi import/compile error nahi)

## Jo abhi basic/simple hai (aage improve kar sakte ho)

- Naye modules ke frontend pages functional hain lekin simple hain (jaise
  Purchase receive-into-inventory abhi browser `prompt()` use karta hai,
  polished modal nahi) — jaisa aapne "basic frontend pages" maanga tha
- Manufacturing/Repair jaise kam-priority pages minimal hain
- Koi automated test suite nahi likha (manual + live API verification kiya)
- PDF invoice generation nahi bana — Invoice record hai, print-ready PDF nahi

Koi bhi cheez aage polish/extend karni ho to bata dena.

// app.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./src/routes/authRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import tenantRoutes from "./src/routes/tenantRoutes.js";
import branchRoutes from "./src/routes/branchRoutes.js";
import errorHandler from "./src/middlewares/errorHandler.js";
import locationRoutes from './src/routes/locationRoutes.js';

// Phase 1 - Foundation
import categoryRoutes from './src/routes/categoryRoutes.js';
import productMasterRoutes from './src/routes/productMasterRoutes.js';
import itemRoutes from './src/routes/itemRoutes.js';

// Phase 2 - Gold / Material
import goldRateRoutes from './src/routes/goldRateRoutes.js';
import purityMasterRoutes from './src/routes/purityMasterRoutes.js';
import stoneMasterRoutes from './src/routes/stoneMasterRoutes.js';
import rawMaterialRoutes from './src/routes/rawMaterialRoutes.js';

// Phase 3 - Pricing
import pricingProfileRoutes from './src/routes/pricingProfileRoutes.js';

// Phase 4 - Stock Operations
import stockTransferRoutes from './src/routes/stockTransferRoutes.js';
import stockReservationRoutes from './src/routes/stockReservationRoutes.js';
import repairOrderRoutes from './src/routes/repairOrderRoutes.js';
import stockAdjustmentRoutes from './src/routes/stockAdjustmentRoutes.js';

// Phase 5 - Purchase
import supplierRoutes from './src/routes/supplierRoutes.js';
import purchaseRoutes from './src/routes/purchaseRoutes.js';

// Phase 6 - Sales
import customerRoutes from './src/routes/customerRoutes.js';
import saleRoutes from './src/routes/saleRoutes.js';

// Phase 7 - Control
import stockAuditRoutes from './src/routes/stockAuditRoutes.js';
import reportsRoutes from './src/routes/reportsRoutes.js';

// Phase 8 - Advanced
import manufacturingRoutes from './src/routes/manufacturingRoutes.js';
import dashboardRoutes from './src/routes/dashboardRoutes.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Core middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Uploaded item images are served from here: /uploads/items/<filename>
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Jewellery ERP API running" });
});

// ---- Routes ----
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/super-admin/tenants", tenantRoutes);
app.use("/api/branches", branchRoutes);
app.use('/api/locations', locationRoutes);

// Phase 1
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productMasterRoutes);
app.use('/api/items', itemRoutes);

// Phase 2
app.use('/api/gold-rates', goldRateRoutes);
app.use('/api/purities', purityMasterRoutes);
app.use('/api/stone-master', stoneMasterRoutes);
app.use('/api/raw-materials', rawMaterialRoutes);

// Phase 3
app.use('/api/pricing-profiles', pricingProfileRoutes);

// Phase 4
app.use('/api/stock-transfers', stockTransferRoutes);
app.use('/api/reservations', stockReservationRoutes);
app.use('/api/repairs', repairOrderRoutes);
app.use('/api/stock-adjustments', stockAdjustmentRoutes);

// Phase 5
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);

// Phase 6
app.use('/api/customers', customerRoutes);
app.use('/api/sales', saleRoutes);

// Phase 7
app.use('/api/stock-audits', stockAuditRoutes);
app.use('/api/reports', reportsRoutes);

// Phase 8
app.use('/api/manufacturing', manufacturingRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Central error handler (must be last)
app.use(errorHandler);

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(` Jewellery ERP API running on http://localhost:${PORT}`);
});

export default app;

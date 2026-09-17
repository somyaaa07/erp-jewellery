// routes/authRoutes.js

import express from "express";
import auth from "../middlewares/auth.js";
import { login, me } from "../controllers/authController.js";

const router = express.Router();

router.post("/login", login);

router.get("/me", auth, me);

export default router;
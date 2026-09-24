import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User, { USER_ROLES } from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

const publicUser = (user) => ({
  id: String(user._id || user.id),
  name: user.name,
  email: user.email,
  role: user.role,
  roleDetail: user.roleDetail,
});

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured on the backend.");

  return jwt.sign(
    {
      id: String(user._id),
      email: user.email,
      role: user.role,
      name: user.name,
      roleDetail: user.roleDetail,
    },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );
}

// Public registration intentionally creates Passenger accounts only.
// Privileged operational roles must be provisioned by the backend/database.
router.post("/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (name.length < 2) return res.status(400).json({ message: "Name must contain at least 2 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
    if (password.length < 8) return res.status(400).json({ message: "Password must contain at least 8 characters." });

    const exists = await User.findOne({ email }).lean();
    if (exists) return res.status(409).json({ message: "An account with this email already exists." });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role: "PASSENGER",
      roleDetail: "Passenger Portal",
    });

    const token = signToken(user);
    res.status(201).json({ message: "Account created successfully.", token, user: publicUser(user) });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: "An account with this email already exists." });
    console.error(err);
    res.status(500).json({ message: "Unable to create account." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !user.active) return res.status(401).json({ message: "Invalid email or password." });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: "Invalid email or password." });

    const token = signToken(user);
    res.json({ message: "Login successful", token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed." });
  }
});

router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.active) return res.status(401).json({ message: "Account is no longer active." });
    res.json({ user: publicUser(user) });
  } catch {
    res.status(401).json({ message: "Invalid session." });
  }
});

export default router;

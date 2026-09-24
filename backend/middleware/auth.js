import jwt from "jsonwebtoken";

export function authenticateToken(req, res, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ message: "JWT_SECRET is not configured on the backend." });

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return res.status(401).json({ message: "Authentication required." });

  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch (err) {
    return res.status(err?.name === "TokenExpiredError" ? 401 : 403).json({
      message: err?.name === "TokenExpiredError" ? "Session expired. Please log in again." : "Invalid authentication token.",
    });
  }
}

export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Your role is not authorized for this resource." });
    }
    next();
  };
}

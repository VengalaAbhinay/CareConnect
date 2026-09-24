import jwt from 'jsonwebtoken'
import { UserModel } from '../Models/UserModel.js'

// verifies JWT from cookie, attaches decoded user to req.user.
// Also re-checks the account is still active on every request, so that an
// admin deactivating a user takes effect immediately instead of waiting for
// the (up to 7-day) JWT to expire.
export async function verifyToken(req, res, next) {
  const token = req.cookies?.token
  if (!token) {
    return res.status(401).json({ message: "Not authenticated" })
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await UserModel.findById(decoded._id).select('isActive role name')
    if (!user || !user.isActive) {
      res.clearCookie('token')
      return res.status(401).json({ message: "This account is inactive or no longer exists" })
    }
    // role/name are re-read from the DB (not trusted from the token) so a
    // role change by an admin also takes effect immediately.
    req.user = { _id: decoded._id, role: user.role, name: user.name }
    next()
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" })
  }
}

// restricts route to specific roles, e.g. authorizeRoles('admin','operationsManager')
export function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" })
    }
    next()
  }
}
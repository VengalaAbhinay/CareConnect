import exp from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { UserModel } from '../Models/UserModel.js'
import { verifyToken } from '../middlewares/auth.js'

export const userApp = exp.Router()

function signAndSetCookie(res, user) {
  const token = jwt.sign(
    { _id: user._id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '7d' }
  )
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  })
}

// register
userApp.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, phone, role, address } = req.body
    const existing = await UserModel.findOne({ email })
    if (existing) return res.status(409).json({ message: "Email already registered" })

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = new UserModel({
      name, email, password: hashedPassword, phone, address,
      role: role && ['provider', 'customer'].includes(role) ? role : 'customer'
    })
    const saved = await user.save()
    signAndSetCookie(res, saved)
    const { password: _pw, ...safeUser } = saved.toObject()
    res.status(201).json({ message: "Registered successfully", user: safeUser })
  } catch (err) { next(err) }
})

// login
userApp.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    const user = await UserModel.findOne({ email })
    if (!user) return res.status(404).json({ message: "Invalid email or password" })

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(401).json({ message: "Invalid email or password" })

    if (!user.isActive) return res.status(403).json({ message: "This account has been deactivated. Contact support." })

    signAndSetCookie(res, user)
    const { password: _pw, ...safeUser } = user.toObject()
    res.status(200).json({ message: "Login successful", user: safeUser })
  } catch (err) { next(err) }
})

// logout
userApp.post('/logout', (req, res) => {
  res.clearCookie('token')
  res.status(200).json({ message: "Logged out" })
})

// current user
userApp.get('/me', verifyToken, async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.user._id).select('-password')
    res.status(200).json({ user })
  } catch (err) { next(err) }
})
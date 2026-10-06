import exp from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { UserModel } from '../Models/UserModel.js'
import { verifyToken } from '../middlewares/auth.js'
import { escapeRegex } from '../utils/helpers.js'

export const userApp = exp.Router()

const EMAIL_RE = /^\S+@\S+\.\S+$/
const PASSWORD_RULE = 'Password must be at least 8 characters and include a letter and a number'
const strongEnough = (pw) => typeof pw === 'string' && pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw)

function signAndSetCookie(res, user) {
  const token = jwt.sign(
    { _id: user._id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '7d' }
  )
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  })
}

// case-insensitive exact email lookup (also finds accounts created before emails were lower-cased)
const findByEmail = (email) => UserModel.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') })

// register (public: customers and providers only; staff accounts are created by an admin)
userApp.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, phone, role, address } = req.body
    if (!name?.trim()) return res.status(400).json({ message: 'Full name is required' })
    if (!EMAIL_RE.test(email || '')) return res.status(400).json({ message: 'Enter a valid email address' })
    if (!strongEnough(password)) return res.status(400).json({ message: PASSWORD_RULE })
    if (await findByEmail(email.trim())) return res.status(409).json({ message: 'Email already registered' })

    const hashedPassword = await bcrypt.hash(password, 10)
    const saved = await UserModel.create({
      name, email, password: hashedPassword, phone, address,
      role: ['provider', 'customer'].includes(role) ? role : 'customer'
    })
    signAndSetCookie(res, saved)
    const { password: _pw, ...safeUser } = saved.toObject()
    res.status(201).json({ message: 'Registered successfully', user: safeUser })
  } catch (err) { next(err) }
})

// login
userApp.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' })
    const user = await findByEmail(String(email).trim())
    // same response for "no such user" and "wrong password" — don't reveal which emails exist
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }
    if (!user.isActive) return res.status(403).json({ message: 'This account has been deactivated. Contact support.' })

    user.lastLoginAt = new Date()
    await user.save()
    signAndSetCookie(res, user)
    const { password: _pw, ...safeUser } = user.toObject()
    res.status(200).json({ message: 'Login successful', user: safeUser })
  } catch (err) { next(err) }
})

// logout
userApp.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  res.status(200).json({ message: 'Logged out' })
})

// current user
userApp.get('/me', verifyToken, async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.user._id).select('-password')
    res.status(200).json({ user })
  } catch (err) { next(err) }
})

// update own profile (role / email / active flag can never be changed here)
userApp.put('/me', verifyToken, async (req, res, next) => {
  try {
    const { name, phone, address } = req.body
    const update = {}
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'Name cannot be empty' })
      update.name = String(name).trim()
    }
    if (phone !== undefined) update.phone = String(phone).trim()
    if (address !== undefined) update.address = String(address).trim()
    const user = await UserModel.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true }).select('-password')
    res.status(200).json({ message: 'Profile updated', user })
  } catch (err) { next(err) }
})

// change own password
userApp.put('/me/password', verifyToken, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!strongEnough(newPassword)) return res.status(400).json({ message: PASSWORD_RULE })
    const user = await UserModel.findById(req.user._id)
    if (!(await bcrypt.compare(currentPassword || '', user.password))) {
      return res.status(400).json({ message: 'Your current password is incorrect' })
    }
    user.password = await bcrypt.hash(newPassword, 10)
    await user.save()
    res.status(200).json({ message: 'Password changed' })
  } catch (err) { next(err) }
})

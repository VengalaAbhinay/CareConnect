import exp from 'express'
import { connect } from 'mongoose'
import cookieParser from 'cookie-parser'
import { config } from 'dotenv'
import cors from "cors"
import path from 'path'
import { fileURLToPath } from 'url'

import { userApp } from './API/UserAPI.js'
import { providerApp } from './API/ProviderAPI.js'
import { serviceApp } from './API/ServiceAPI.js'
import { bookingApp } from './API/BookingAPI.js'
import { invoiceApp } from './API/InvoiceAPI.js'
import { supportApp } from './API/SupportAPI.js'
import { uploadApp } from './API/UploadAPI.js'
import { adminApp } from './API/AdminAPI.js'
import { notificationApp } from './API/NotificationAPI.js'
import { UPLOAD_DIR } from './middlewares/upload.js'

config()  // process.env.PORT, process.env.DB_URL

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = exp()

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://careconnect-pied-nine.vercel.app"
  ],
  credentials: true
}))

// body parser middleware
app.use(exp.json())

// cookie parser middleware
app.use(cookieParser())

// serve uploaded evidence/documents (filenames are random hex, so the name is the capability)
app.use('/uploads', exp.static(UPLOAD_DIR))

// forward req to sub-apps based on path
app.use("/user-api", userApp)
app.use("/provider-api", providerApp)
app.use("/service-api", serviceApp)
app.use("/booking-api", bookingApp)
app.use("/invoice-api", invoiceApp)
app.use("/support-api", supportApp)
app.use("/upload-api", uploadApp)
app.use("/admin-api", adminApp)
app.use("/notification-api", notificationApp)

app.get("/", (req, res) => res.send({ status: "CareConnect API running" }))

const port = process.env.PORT || 8000

// connect to db server
async function connectDB() {
  try {
    await connect(process.env.DB_URL)
    console.log("DB Connection Success")
    app.listen(port, () => console.log(`server on port ${port}....`))
  } catch (err) {
    console.log("Error in DB connection:", err)
  }
}

connectDB()

// error handling middleware
app.use((err, req, res, next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: "Error Occured", error: err.message })
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: "Error occured", error: err.message })
  }
  if (err.status === 400) {
    // e.g. multer file-type/size rejection
    return res.status(400).json({ message: err.message })
  }
  console.log(err)
  res.status(500).json({ message: "error occured", error: "Server side error" })
})

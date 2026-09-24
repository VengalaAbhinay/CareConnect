// Optional standalone DB config helper.
// server.js already calls mongoose.connect directly using process.env.DB_URL,
// but you can import this instead if you prefer a separate config module.
import { connect } from 'mongoose'

export async function connectDB() {
  await connect(process.env.DB_URL)
}

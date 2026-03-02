import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer"; // nếu còn dùng
import { sendEmail } from "./utils/sendEmail.js";
import pkg from "pg";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const SECRET_KEY = "nmt_secret_key";
const otpStore = {};

// PostgreSQL Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});


// ================= OTP =================

// app.post("/api/send-otp", async (req, res) => {
//   try {
//     const { phone } = req.body;

//     const result = await pool.query(
//       "SELECT email FROM bookings WHERE phone_number = $1 LIMIT 1",
//       [phone]
//     );

//     if (result.rows.length === 0)
//       return res.status(404).json({ message: "Không tìm thấy lịch" });

//     const email = result.rows[0].email;
//     const otp = Math.floor(100000 + Math.random() * 900000);
//     otpStore[phone] = otp;

//     const transporter = nodemailer.createTransport({
//       host: "smtp.gmail.com",
//       port: 465,
//       secure: true,
//       auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS,
//       },
//     });

//     await transporter.sendMail({
//       from: "NMT Repair",
//       to: email,
//       subject: "Mã xác nhận xem lịch sửa chữa",
//       text: `Mã OTP của bạn là: ${otp}`,
//     });

//     res.json({ message: "Đã gửi mã xác nhận" });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Server error" });
//   }
// });
app.post("/api/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;
    console.log("Phone nhận được:", phone);

    const result = await pool.query(
      "SELECT email FROM bookings WHERE phone_number = $1 LIMIT 1",
      [phone]
    );

    console.log("Query result:", result.rows);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy lịch" });
    }

    const email = result.rows[0].email;
    console.log("Email lấy từ DB:", email);

    const otp = Math.floor(100000 + Math.random() * 900000);
    console.log("OTP tạo ra:", otp);

    const response = await sendEmail({
      from: "onboarding@resend.dev",
      to: email,
      subject: "Test OTP",
      html: `<h1>${otp}</h1>`
    });

    console.log("Resend response:", response);

    res.json({ message: "OTP sent" });

  } catch (err) {
    console.error("FULL ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (otpStore[phone] != otp)
      return res.status(400).json({ message: "Mã OTP không đúng" });

    const result = await pool.query(
      "SELECT * FROM bookings WHERE phone_number = $1",
      [phone]
    );

    delete otpStore[phone];
    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// ================= BOOKING =================

app.post("/api/bookings", async (req, res) => {
  try {
    const {
      customer_name,
      phone_number,
      email,
      device_model,
      repair_issue,
      appointment_date,
    } = req.body;

    await pool.query(
      `INSERT INTO bookings
       (customer_name, phone_number, email, device_model, repair_issue, appointment_date)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [customer_name, phone_number, email, device_model, repair_issue, appointment_date]
    );

    res.json({ message: "Đặt lịch thành công" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/bookings/:phone", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM bookings WHERE phone_number = $1 ORDER BY created_at DESC",
      [req.params.phone]
    );
    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// ================= AUTH =================

app.post("/api/register", async (req, res) => {
  try {
    const { username, password, full_name, phone_number, role } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (username, password, full_name, phone_number, role)
       VALUES ($1,$2,$3,$4,$5)`,
      [username, hashedPassword, full_name, phone_number, role]
    );

    res.json({ message: "Tạo tài khoản thành công" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0)
      return res.status(400).json({ message: "Sai tài khoản" });

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Sai mật khẩu" });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      SECRET_KEY,
      { expiresIn: "1d" }
    );

    res.json({ token, role: user.role });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// ================= DASHBOARD =================

app.get("/api/admin/dashboard", async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM bookings");
    const pending = await pool.query("SELECT COUNT(*) FROM bookings WHERE status='Chờ Xác Nhận'");
    const repairing = await pool.query("SELECT COUNT(*) FROM bookings WHERE status='Đang Sửa'");
    const revenueToday = await pool.query(`
      SELECT COALESCE(SUM(repair_price),0) FROM bookings
      WHERE status='Hoàn Thành'
      AND DATE(completed_at) = CURRENT_DATE
    `);
    const revenueMonth = await pool.query(`
      SELECT COALESCE(SUM(repair_price),0) FROM bookings
      WHERE status='Hoàn Thành'
      AND DATE_TRUNC('month', completed_at) = DATE_TRUNC('month', CURRENT_DATE)
    `);

    res.json({
      total: total.rows[0].count,
      pending: pending.rows[0].count,
      repairing: repairing.rows[0].count,
      revenueToday: revenueToday.rows[0].coalesce,
      revenueMonth: revenueMonth.rows[0].coalesce,
    });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// ================= SERVER =================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
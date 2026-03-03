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
const bookingOtpStore = {};
const verifiedEmails = {};
// PostgreSQL Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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

    await sendEmail(email, otp);
    // 🔥 BẮT BUỘC PHẢI LƯU
    otpStore[phone] = otp;

    // 🔥 TỰ ĐỘNG HẾT HẠN SAU 60 GIÂY
    setTimeout(() => {
      delete otpStore[phone];
    }, 60000);


    res.json({ message: "OTP sent" });

  } catch (err) {
    console.error("FULL ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
function verifyToken(req, res, next) {
  const token = req.headers.authorization;

  if (!token) return res.status(401).json({ message: "Không có token" });

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Token không hợp lệ" });

    req.user = decoded;
    next();
  });
}
app.post("/api/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // kiểm tra tồn tại
    if (!otpStore[phone]) {
      return res.status(400).json({ message: "OTP đã hết hạn hoặc không tồn tại" });
    }

    // so sánh đúng kiểu
    if (String(otpStore[phone]) !== String(otp)) {
      return res.status(400).json({ message: "Mã OTP không đúng" });
    }

    const result = await pool.query(
      "SELECT * FROM bookings WHERE phone_number = $1",
      [phone]
    );

    delete otpStore[phone]; // xóa sau khi dùng

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// ================= BOOKING =================
app.post("/api/send-booking-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Thiếu email" });
    }

    // 🔥 Chống spam gửi liên tục
    if (bookingOtpStore[email]?.cooldown) {
      return res.status(429).json({ message: "Vui lòng chờ trước khi gửi lại OTP" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    await sendEmail(email, otp);

    // Lưu OTP
    bookingOtpStore[email] = {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 phút
      cooldown: true,
    };

    // Hết hạn OTP
    setTimeout(() => {
      delete bookingOtpStore[email];
    }, 5 * 60 * 1000);

    // Cooldown 60 giây chống spam
    setTimeout(() => {
      if (bookingOtpStore[email]) {
        bookingOtpStore[email].cooldown = false;
      }
    }, 60000);

    res.json({ message: "OTP sent" });

  } catch (err) {
    console.error("Booking OTP error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
app.post("/api/verify-booking-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!bookingOtpStore[email]) {
      return res.status(400).json({ message: "OTP đã hết hạn hoặc không tồn tại" });
    }

    const storedData = bookingOtpStore[email];

    if (Date.now() > storedData.expiresAt) {
      delete bookingOtpStore[email];
      return res.status(400).json({ message: "OTP đã hết hạn" });
    }

    if (String(storedData.otp) !== String(otp)) {
      return res.status(400).json({ message: "OTP không đúng" });
    }

    // 🔥 đánh dấu đã xác thực
    verifiedEmails[email] = true;

    // xóa OTP
    delete bookingOtpStore[email];

    res.json({ message: "Xác thực thành công" });

  } catch (err) {
    console.error("Verify booking OTP error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

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

    // 🔥 CHẶN nếu chưa verify
    if (!verifiedEmails[email]) {
      return res.status(403).json({
        message: "Bạn cần xác thực email trước khi đặt lịch",
      });
    }

    await pool.query(
      `INSERT INTO bookings
       (customer_name, phone_number, email, device_model, repair_issue, appointment_date)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [customer_name, phone_number, email, device_model, repair_issue, appointment_date]
    );

    // 🔥 dùng 1 lần xong xóa
    delete verifiedEmails[email];

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

app.get("/api/admin/new-bookings", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, customer_name
      FROM bookings
      WHERE status = 'Chờ Xác Nhận'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
// Lấy doanh thu 7 ngày 
app.get("/api/admin/revenue-7days", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        DATE(completed_at) AS date,
        SUM(repair_price) AS total
      FROM bookings
      WHERE status = 'Hoàn Thành'
      AND completed_at IS NOT NULL
      AND completed_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(completed_at)
      ORDER BY date ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
app.get("/api/admin/status-summary", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT status, COUNT(*) AS total
      FROM bookings
      GROUP BY status
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
app.get("/api/admin/users", verifyToken, async (req, res) => {
  try {
    // kiểm tra quyền
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Không có quyền" });
    }

    const result = await pool.query(`
      SELECT id, username, full_name, phone_number, role
      FROM users
      ORDER BY id ASC
    `);

    res.json(result.rows);

  } catch (err) {
    console.error("Users error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
app.get("/api/admin/bookings", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Không có quyền" });
    }

    const result = await pool.query(`
      SELECT *
      FROM bookings
      ORDER BY id DESC
    `);

    res.json(result.rows);

  } catch (err) {
    console.error("Bookings error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
// ================= SERVER =================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
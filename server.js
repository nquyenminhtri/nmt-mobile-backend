require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const pool = require("./config/db");

const app = express();
const SECRET_KEY = process.env.JWT_SECRET || "nmt_secret_key";

app.use(cors());
app.use(express.json());

/* ===========================
   BOOKING API
=========================== */

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
      [
        customer_name,
        phone_number,
        email,
        device_model,
        repair_issue,
        appointment_date,
      ]
    );

    res.json({ message: "Đặt lịch thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/* ===========================
   HISTORY BY PHONE
=========================== */

app.get("/api/bookings/:phone", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM bookings WHERE phone_number = $1 ORDER BY created_at DESC",
      [req.params.phone]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json(err);
  }
});

/* ===========================
   AUTH
=========================== */

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
    res.status(500).json(err);
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
    res.status(500).json(err);
  }
});

/* ===========================
   MIDDLEWARE AUTH
=========================== */

function verifyToken(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ message: "Không có token" });

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Token không hợp lệ" });
    req.user = decoded;
    next();
  });
}

/* ===========================
   ADMIN BOOKING
=========================== */

app.get("/api/admin/bookings", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM bookings ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json(err);
  }
});

/* ===========================
   UPDATE STATUS
=========================== */

app.put("/api/bookings/:id/quote", async (req, res) => {
  try {
    const { repair_price, admin_note } = req.body;

    if (!repair_price || repair_price <= 0)
      return res.status(400).json({ message: "Giá không hợp lệ" });

    await pool.query(
      `UPDATE bookings
       SET repair_price=$1,
           admin_note=$2,
           status='Đang Sửa'
       WHERE id=$3`,
      [repair_price, admin_note, req.params.id]
    );

    res.json({ message: "Đã cập nhật báo giá" });

  } catch (err) {
    res.status(500).json(err);
  }
});

app.put("/api/bookings/:id/complete", async (req, res) => {
  try {
    await pool.query(
      `UPDATE bookings
       SET status='Hoàn Thành',
           completed_at = NOW()
       WHERE id=$1`,
      [req.params.id]
    );

    res.json({ message: "Đã hoàn thành đơn" });

  } catch (err) {
    res.status(500).json(err);
  }
});

/* ===========================
   DASHBOARD
=========================== */

app.get("/api/admin/dashboard", async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM bookings");
    const pending = await pool.query(
      "SELECT COUNT(*) FROM bookings WHERE status='Chờ Xác Nhận'"
    );
    const repairing = await pool.query(
      "SELECT COUNT(*) FROM bookings WHERE status='Đang Sửa'"
    );

    const revenueToday = await pool.query(`
      SELECT COALESCE(SUM(repair_price),0)
      FROM bookings
      WHERE status='Hoàn Thành'
      AND DATE(completed_at) = CURRENT_DATE
    `);

    const revenueMonth = await pool.query(`
      SELECT COALESCE(SUM(repair_price),0)
      FROM bookings
      WHERE status='Hoàn Thành'
      AND DATE_TRUNC('month', completed_at) =
          DATE_TRUNC('month', CURRENT_DATE)
    `);

    res.json({
      total: parseInt(total.rows[0].count),
      pending: parseInt(pending.rows[0].count),
      repairing: parseInt(repairing.rows[0].count),
      revenueToday: revenueToday.rows[0].coalesce,
      revenueMonth: revenueMonth.rows[0].coalesce,
    });

  } catch (err) {
    res.status(500).json(err);
  }
});

/* ===========================
   REVENUE 7 DAYS
=========================== */

app.get("/api/admin/revenue-7days", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DATE(completed_at) as date,
             SUM(repair_price) as total
      FROM bookings
      WHERE status='Hoàn Thành'
      AND completed_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(completed_at)
      ORDER BY date ASC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json(err);
  }
});

/* ===========================
   SERVER
=========================== */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
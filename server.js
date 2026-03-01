// const db = require("./config/db.js");
// const express = require('express');
// const cors = require('cors');
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const SECRET_KEY = "nmt_secret_key";
// const otpStore = {};
// const nodemailer = require("nodemailer");
// require('dotenv').config();




// const bookingRoutes = require('./routes/bookingRoutes');
// const sendBookingEmail = require("./utils/sendEmail.js");

// const app = express();

// app.use(cors());
// app.use(express.json());
// app.post("/api/send-otp", (req, res) => {
//   const { phone } = req.body;

//   pool.query(
//     "SELECT email FROM bookings WHERE phone_number = ? LIMIT 1",
//     [phone],
//     async (err, result) => {
//       if (err) return res.status(500).json(err);
//       if (result.length === 0)
//         return res.status(404).json({ message: "Không tìm thấy lịch" });

//       const email = result[0].email;

//       const otp = Math.floor(100000 + Math.random() * 900000);

//       otpStore[phone] = otp;

//       const transporter = nodemailer.createTransport({
//         service: "gmail",
//         auth: {
//           user: "nmtmobilevn@gmail.com",
//           pass: "rysjgkaitplvyzze",
//         },
//       });

//       await transporter.sendMail({
//         from: "NMT Repair",
//         to: email,
//         subject: "Mã xác nhận xem lịch sửa chữa điện thoại của bạn",
//         text: `Mã OTP của bạn là: ${otp}`,
//       });

//       res.json({ message: "Đã gửi mã xác nhận" });
//     }
//   );
// });
// app.post("/api/verify-otp", (req, res) => {
//   const { phone, otp } = req.body;

//   if (otpStore[phone] != otp) {
//     return res.status(400).json({ message: "Mã OTP không đúng" });
//   }

//   pool.query(
//     "SELECT * FROM bookings WHERE phone_number = ?",
//     [phone],
//     (err, result) => {
//       if (err) return res.status(500).json(err);

//       delete otpStore[phone]; // xóa OTP sau khi dùng
//       res.json(result);
//     }
//   );
// });

// // API tạo booking
// app.post("/api/bookings", async (req, res) => {
//   const {
//     customer_name,
//     phone_number,
//     email,
//     device_model,
//     repair_issue,
//     appointment_date,
//   } = req.body;

//   const sql = `
//     INSERT INTO bookings
//     (customer_name, phone_number, email, device_model, repair_issue, appointment_date)
//     VALUES (?, ?, ?, ?, ?, ?)
//   `;

//   pool.query(
//     sql,
//     [
//       customer_name,
//       phone_number,
//       email,
//       device_model,
//       repair_issue,
//       appointment_date,
//     ],
//     async (err, result) => {
//       if (err) {
//         return res.status(500).json(err);
//       }

//       try {
//         // Gửi email sau khi lưu DB thành công
//         await sendBookingEmail(req.body);
//       } catch (emailError) {
//         console.log("Lỗi gửi email:", emailError);
//       }

//       res.json({ message: "Đặt lịch thành công" });
//     }
//   );
// });
// // API lấy lịch sử theo số điện thoại
// app.get("/api/bookings/:phone", (req, res) => {
//   const phone = req.params.phone;

//   const sql = "SELECT * FROM bookings WHERE phone_number = ? ORDER BY created_at DESC";

//   pool.query(sql, [phone], (err, results) => {
//     if (err) {
//       console.error(err);
//       return res.status(500).json({ error: "Database error" });
//     }

//     res.json(results);
//   });
// });
// // API tạo tài khoản
// app.post("/api/register", async (req, res) => {
//   const { username, password, full_name, phone_number, role } = req.body;

//   const hashedPassword = await bcrypt.hash(password, 10);

//   const sql =
//     "INSERT INTO users (username, password, full_name, phone_number, role) VALUES (?, ?, ?, ?, ?)";

//   pool.query(
//     sql,
//     [username, hashedPassword, full_name, phone_number, role],
//     (err, result) => {
//       if (err) return res.status(500).json({ error: err.message });

//       res.json({ message: "Tạo tài khoản thành công" });
//     }
//   );
// });
// //API đăng nhập
// app.post("/api/login", (req, res) => {
//   const { username, password } = req.body;

//   const sql = "SELECT * FROM users WHERE username = ?";

//   pool.query(sql, [username], async (err, results) => {
//     if (err) return res.status(500).json({ error: err.message });

//     if (results.length === 0)
//       return res.status(400).json({ message: "Sai tài khoản" });

//     const user = results[0];

//     const isMatch = await bcrypt.compare(password, user.password);

//     if (!isMatch)
//       return res.status(400).json({ message: "Sai mật khẩu" });

//     const token = jwt.sign(
//       { id: user.id, role: user.role },
//       SECRET_KEY,
//       { expiresIn: "1d" }
//     );

//     res.json({ token, role: user.role });
//   });
// });

// // Kiểm tra đăng nhập
// function verifyToken(req, res, next) {
//   const token = req.headers.authorization;

//   if (!token) return res.status(401).json({ message: "Không có token" });

//   jwt.verify(token, SECRET_KEY, (err, decoded) => {
//     if (err) return res.status(403).json({ message: "Token không hợp lệ" });

//     req.user = decoded;
//     next();
//   });
// }
// // API chỉ dành cho quản lý
// app.get("/api/admin/bookings", verifyToken, (req, res) => {
//   if (req.user.role !== "manager") {
//     return res.status(403).json({ message: "Không có quyền truy cập" });
//   }

//   pool.query("SELECT * FROM bookings", (err, results) => {
//     if (err) return res.status(500).json({ error: err.message });

//     res.json(results);
//   });
// });
// app.get("/api/admin/users", verifyToken, (req, res) => {
//   if (req.user.role !== "manager") {
//     return res.status(403).json({ message: "Không có quyền" });
//   }

//   pool.query("SELECT id, username, full_name,phone_number, role FROM users", (err, result) => {
//     if (err) return res.status(500).json(err);
//     res.json(result);
//   });
// });
// // lấy dữ liệu đặt lịch 
// app.get("/api/admin/bookings", verifyToken, (req, res) => {
//   pool.query("SELECT * FROM bookings ORDER BY id DESC", (err, result) => {
//     if (err) return res.status(500).json(err);
//     res.json(result);
//   });
// });
// // chức năng hủy lịch đã đặt 
// app.put("/api/cancel-booking/:id", (req, res) => {
//   const bookingId = req.params.id;

//   const sql = `
//     UPDATE bookings 
//     SET status = 'Đã Hủy'
//     WHERE id = ? AND status IN ('Chờ Xác Nhận', 'confirmed')
//   `;

//   pool.query(sql, [bookingId], (err, result) => {
//     if (err) return res.status(500).json(err);

//     res.json({ message: "Đã huỷ lịch thành công" });
//   });
// });
// app.put("/api/bookings/:id/quote", (req, res) => {
//   const bookingId = req.params.id;
//   const { repair_price, admin_note } = req.body;

//   // ❗ Kiểm tra backend
//   if (!repair_price || repair_price <= 0) {
//     return res.status(400).json({
//       message: "Giá sửa chữa không hợp lệ",
//     });
//   }

//   const sql = `
//     UPDATE bookings
//     SET repair_price = ?, 
//         admin_note = ?, 
//         status = 'Đang Sửa'
//     WHERE id = ?
//   `;

//   pool.query(sql, [repair_price, admin_note, bookingId], (err) => {
//     if (err) return res.status(500).json(err);

//     res.json({ message: "Đã cập nhật báo giá" });
//   });
// });

// app.put("/api/bookings/:id/complete", (req, res) => {
//   const bookingId = req.params.id;

//   const sql = `
//     UPDATE bookings
//     SET status = 'Hoàn Thành',
//                 completed_at = NOW()
//     WHERE id = ? AND status = 'Đang Sửa'
//   `;

//   pool.query(sql, [bookingId], (err) => {
//     if (err) return res.status(500).json(err);

//     res.json({ message: "Đã hoàn thành đơn" });
//   });
// });
// // Dashboard 
// app.get("/api/admin/dashboard", async (req, res) => {
//   try {
//     const totalSql =
//       "SELECT COUNT(*) as total FROM bookings";

//     const pendingSql =
//       "SELECT COUNT(*) as pending FROM bookings WHERE status='Chờ Xác Nhận'";

//     const repairingSql =
//       "SELECT COUNT(*) as repairing FROM bookings WHERE status='Đang Sửa'";

//     const revenueTodaySql = `
//     SELECT SUM(repair_price) as revenueToday
//     FROM bookings
//     WHERE status='Hoàn Thành'
//     AND DATE(completed_at) = CURDATE()
//     `;
//     const revenueMonthSql = `
//     SELECT SUM(repair_price) as revenueMonth
//     FROM bookings
//     WHERE status='Hoàn Thành'
//     AND MONTH(completed_at) = MONTH(CURDATE())
//     AND YEAR(completed_at) = YEAR(CURDATE())
//     `;
//     const queries = [
//       totalSql,
//       pendingSql,
//       repairingSql,
//       revenueTodaySql,
//       revenueMonthSql,
//     ];

//     Promise.all(
//       queries.map(
//         (sql) =>
//           new Promise((resolve, reject) => {
//             pool.query(sql, (err, result) => {
//               if (err) reject(err);
//               else resolve(result);
//             });
//           })
//       )
//     )
//       .then((results) => {
//         const dashboardData = {
//           total: results[0]?.[0]?.total ?? 0,
//           pending: results[1]?.[0]?.pending ?? 0,
//           repairing: results[2]?.[0]?.repairing ?? 0,
//           revenueToday: results[3]?.[0]?.revenueToday ?? 0,
//           revenueMonth: results[4]?.[0]?.revenueMonth ?? 0,
//         };

//         res.json(dashboardData);
//       })
//       .catch((error) => {
//         console.error("Dashboard error:", error);
//         res.status(500).json({ error: "Server error" });
//       });

//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: "Server error" });
//   }
// });
// // Lấy doanh thu 7 ngày 
// app.get("/api/admin/revenue-7days", (req, res) => {
//   const sql = `
//   SELECT DATE(completed_at) as date,
//          SUM(repair_price) as total
//   FROM bookings
//   WHERE status = 'Hoàn Thành'
//   AND completed_at IS NOT NULL
//   AND completed_at >= CURDATE() - INTERVAL 7 DAY
//   GROUP BY DATE(completed_at)
//   ORDER BY date ASC
// `;

//   pool.query(sql, (err, results) => {
//     if (err) return res.status(500).json(err);
//     res.json(results);
//   });
// });
// app.get("/api/admin/status-summary", (req, res) => {
//   const sql = `
//     SELECT status, COUNT(*) as total
//     FROM bookings
//     GROUP BY status
//   `;

//   pool.query(sql, (err, results) => {
//     if (err) return res.status(500).json(err);
//     res.json(results);
//   });
// });
// app.get("/api/admin/new-bookings", (req, res) => {
//   const sql = `
//     SELECT id, customer_name
//     FROM bookings
//     WHERE status = 'Chờ Xác Nhận'
//     ORDER BY created_at DESC
//     LIMIT 5
//   `;

//   pool.query(sql, (err, results) => {
//     if (err) return res.status(500).json(err);
//     res.json(results);
//   });
// });
// const PORT = process.env.PORT || 5000;

// app.listen(PORT, () => {
//   console.log("Server running on port " + PORT);
// });

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");

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

app.post("/api/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;

    const result = await pool.query(
      "SELECT email FROM bookings WHERE phone_number = $1 LIMIT 1",
      [phone]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ message: "Không tìm thấy lịch" });

    const email = result.rows[0].email;
    const otp = Math.floor(100000 + Math.random() * 900000);
    otpStore[phone] = otp;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: "NMT Repair",
      to: email,
      subject: "Mã xác nhận xem lịch sửa chữa",
      text: `Mã OTP của bạn là: ${otp}`,
    });

    res.json({ message: "Đã gửi mã xác nhận" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
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
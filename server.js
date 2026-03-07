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
    const { contact } = req.body;

    if (!contact) {
      return res.status(400).json({ message: "Thiếu thông tin" });
    }

    // Kiểm tra là email hay số điện thoại
    const isEmail = contact.includes("@");

    let result;

    if (isEmail) {
      result = await pool.query(
        "SELECT email FROM bookings WHERE email = $1 LIMIT 1",
        [contact]
      );
    } else {
      result = await pool.query(
        "SELECT email FROM bookings WHERE phone_number = $1 LIMIT 1",
        [contact]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy lịch" });
    }

    const email = result.rows[0].email;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(`
      INSERT INTO history_otps (contact, otp, expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (contact)
      DO UPDATE SET
        otp = EXCLUDED.otp,
        expires_at = EXCLUDED.expires_at
    `, [contact, otp, expiresAt]);

    await sendEmail(email, otp, "history");

    res.json({ message: "OTP sent" });

  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({ error: "Server error" });
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
    const { contact, otp } = req.body;

    const result = await pool.query(
      "SELECT * FROM history_otps WHERE contact = $1",
      [contact]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "OTP không tồn tại" });
    }

    const record = result.rows[0];

    if (new Date() > new Date(record.expires_at)) {
      await pool.query("DELETE FROM history_otps WHERE contact = $1", [contact]);
      return res.status(400).json({ message: "OTP đã hết hạn" });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ message: "OTP không đúng" });
    }

    // Lấy booking theo contact
    const isEmail = contact.includes("@");

    let bookings;

    if (isEmail) {
      bookings = await pool.query(
        "SELECT * FROM bookings WHERE email = $1 ORDER BY created_at DESC",
        [contact]
      );
    } else {
      bookings = await pool.query(
        "SELECT * FROM bookings WHERE phone_number = $1 ORDER BY created_at DESC",
        [contact]
      );
    }

    await pool.query("DELETE FROM history_otps WHERE contact = $1", [contact]);

    res.json(bookings.rows);

  } catch (err) {
    console.error("Verify OTP error:", err);
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

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 phút

    // Upsert OTP (nếu đã tồn tại thì cập nhật)
    await pool.query(`
      INSERT INTO booking_otps (email, otp, expires_at, verified)
      VALUES ($1, $2, $3, false)
      ON CONFLICT (email)
      DO UPDATE SET
        otp = EXCLUDED.otp,
        expires_at = EXCLUDED.expires_at,
        verified = false,
        created_at = CURRENT_TIMESTAMP
    `, [email, otp, expiresAt]);

    await sendEmail(email, otp, "booking");

    res.json({ message: "OTP sent" });

  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
app.post("/api/verify-booking-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const result = await pool.query(
      "SELECT * FROM booking_otps WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "OTP không tồn tại" });
    }

    const record = result.rows[0];

    if (new Date() > new Date(record.expires_at)) {
      await pool.query("DELETE FROM booking_otps WHERE email = $1", [email]);
      return res.status(400).json({ message: "OTP đã hết hạn" });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ message: "OTP không đúng" });
    }

    // Đánh dấu đã verify
    await pool.query(
      "UPDATE booking_otps SET verified = true WHERE email = $1",
      [email]
    );

    res.json({ message: "Xác thực thành công" });

  } catch (err) {
    console.error("Verify OTP error:", err);
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
    const phoneRegex = /^(0[0-9]{8,10})$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!phoneRegex.test(phone_number)) {
      return res.status(400).json({ message: "Số điện thoại không hợp lệ" });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Email không hợp lệ" });
    }
    if (!device_model) {
      return res.status(400).json({
        message: "Thiết bị không được để trống"
      });
    }
    // 1️⃣ Kiểm tra thiếu dữ liệu
    if (!customer_name || !phone_number || !email || !appointment_date) {
      return res.status(400).json({
        message: "Thiếu thông tin bắt buộc",
      });
    }

    // 2️⃣ Kiểm tra email đã verify trong DB chưa
    const checkVerify = await pool.query(
      "SELECT * FROM booking_otps WHERE email = $1 AND verified = true",
      [email]
    );

    if (checkVerify.rows.length === 0) {
      return res.status(403).json({
        message: "Bạn cần xác thực email trước khi đặt lịch",
      });
    }

    // 3️⃣ Kiểm tra ngày hợp lệ
    const selectedDate = new Date(appointment_date);

    if (isNaN(selectedDate.getTime())) {
      return res.status(400).json({
        message: "Ngày hẹn không hợp lệ",
      });
    }

    const now = new Date();

    if (selectedDate <= now) {
      return res.status(400).json({
        message: "Không thể đặt lịch trong quá khứ",
      });
    }

    // 4️⃣ Insert booking
    await pool.query(
      `INSERT INTO bookings
       (customer_name, phone_number, email, device_model, repair_issue, appointment_date)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [customer_name, phone_number, email, device_model, repair_issue, appointment_date]
    );

    // 5️⃣ Xóa OTP sau khi dùng (1 lần duy nhất)
    await pool.query(
      "DELETE FROM booking_otps WHERE email = $1",
      [email]
    );

    // 6️⃣ Gửi mail xác nhận
    await sendEmail(email, null, "booking_success", {
      customer_name,
      phone_number,
      email,
      device_model,
      repair_issue,
      appointment_date,
    });

    res.json({ message: "Đặt lịch thành công" });

  } catch (err) {
    console.error("Booking error:", err);
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
app.put("/api/cancel-booking/:id", async (req, res) => {
  try {
    const bookingId = req.params.id;

    const result = await pool.query(
      `
      UPDATE bookings 
      SET status = 'Đã Hủy'
      WHERE id = $1 
      AND status IN ('Chờ Xác Nhận', 'Đang Sửa')
      RETURNING *
      `,
      [bookingId]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({
        message: "Không thể huỷ lịch hoặc lịch không tồn tại",
      });
    }

    res.json({ message: "Đã huỷ lịch thành công" });

  } catch (err) {
    console.error("Cancel booking error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/bookings/:id/quote", async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { repair_price, admin_note } = req.body;

    // 1️⃣ Kiểm tra giá hợp lệ
    if (!repair_price || repair_price <= 0) {
      return res.status(400).json({
        message: "Giá sửa chữa không hợp lệ",
      });
    }

    const result = await pool.query(
      `
      UPDATE bookings
      SET repair_price = $1,
          admin_note = $2,
          status = 'Đang Sửa'
      WHERE id = $3
      RETURNING *
      `,
      [repair_price, admin_note, bookingId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Không tìm thấy đơn cần cập nhật",
      });
    }

    res.json({ message: "Đã cập nhật báo giá" });

  } catch (err) {
    console.error("Quote update error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= DASHBOARD =================
app.put("/api/bookings/:id/complete", async (req, res) => {
  try {
    const bookingId = parseInt(req.params.id, 10);

    if (isNaN(bookingId)) {
      return res.status(400).json({
        message: "ID không hợp lệ",
      });
    }

    const result = await pool.query(
      `
      UPDATE bookings
      SET status = 'Hoàn Thành',
          completed_at = NOW()
      WHERE id = $1
      AND status = 'Đang Sửa'
      RETURNING *
      `,
      [bookingId]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({
        message: "Không thể hoàn thành đơn này",
      });
    }

    res.json({ message: "Đã hoàn thành đơn" });

  } catch (err) {
    console.error("Complete booking error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
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
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Không có quyền" });
    }

    const result = await pool.query(`
      SELECT id, username, full_name, phone_number, role, email
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
    if (req.user.role !== "admin") {
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

// Loại thiết bị
app.get("/api/device-types", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM device_types ORDER BY name"
  );

  res.json(result.rows);
});
app.get("/api/devices/search", async (req, res) => {
  const { q, typeId } = req.query;

  const result = await pool.query(
    `
    SELECT * 
    FROM devices
    WHERE device_type_id = $1
    AND name ILIKE $2
    LIMIT 10
    `,
    [typeId, `%${q}%`]
  );

  res.json(result.rows);
});
// lấy thiết bị theo loại 
app.get("/api/devices/:typeId", async (req, res) => {
  const { typeId } = req.params;

  const result = await pool.query(
    "SELECT * FROM devices WHERE device_type_id=$1 ORDER BY name",
    [typeId]
  );

  res.json(result.rows);
});
app.get("/api/health", (req, res) => {
  res.send("server ok");
});
app.get("/api/settings", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM settings LIMIT 1");
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
app.put("/api/admin/settings", verifyToken, async (req, res) => {
  try {

    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Không có quyền"
      });
    }

    const {
      site_name,
      phone,
      email,
      address,
      description,
      facebook,
      zalo,
      messenger,
      google_map,
      working_hours
    } = req.body;

    await pool.query(`
      UPDATE settings SET
      site_name=$1,
      phone=$2,
      email=$3,
      address=$4,
      description=$5,
      facebook=$6,
      zalo=$7,
      messenger=$8,
      google_map=$9,
      working_hours=$10
      WHERE id=1
    `, [
      site_name,
      phone,
      email,
      address,
      description,
      facebook,
      zalo,
      messenger,
      google_map,
      working_hours
    ]);

    res.json({ message: "Cập nhật thành công" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
// thêm nhân viên 
app.post("/api/admin/users", async (req, res) => {
  try {
    const { username, password, full_name, phone_number, email, role } = req.body;

     // 🔎 kiểm tra email đã tồn tại
    const check = await pool.query(
      "SELECT id FROM users WHERE email=$1",
      [email]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({
        message: "Email đã tồn tại"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username,password,full_name,phone_number,email,role)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [username, hashedPassword, full_name, phone_number, email, role]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json(err.message);
  }
});
// sửa nhân viên 
app.put("/api/admin/users/:id", async (req, res) => {

try {

const { username, full_name, phone_number, email, role } = req.body;

// 🔎 kiểm tra email trùng
const check = await pool.query(
"SELECT id FROM users WHERE email=$1 AND id<>$2",
[email, req.params.id]
);

if(check.rows.length > 0){
return res.status(400).json({
message:"Email đã tồn tại"
});
}

const result = await pool.query(
`UPDATE users
SET username=$1,
full_name=$2,
phone_number=$3,
email=$4,
role=$5
WHERE id=$6
RETURNING *`,
[username, full_name, phone_number, email, role, req.params.id]
);

res.json(result.rows[0]);

} catch (err) {

console.log(err);
res.status(500).json(err.message);

}

});
// xóa nhân viên 
app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM users WHERE id=$1",
      [req.params.id]
    );

    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
});
// đổi mật khẩu 
app.put("/api/admin/users/change-password/:id", async (req, res) => {
  try {
    const { password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `UPDATE users SET password=$1 WHERE id=$2`,
      [hashedPassword, req.params.id]
    );

    res.json({ message: "Password updated" });

  } catch (err) {
    res.status(500).json(err.message);
  }
});
// lấy linh kiện 
app.get("/api/parts", async (req, res) => {
  try {

    const result = await pool.query(
      "SELECT * FROM parts WHERE quantity > 0 ORDER BY name"
    );

    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
// trừ số lượng linh kiện trong kho 
app.put("/api/parts/use/:id", async (req, res) => {

try {

await pool.query(
`UPDATE parts
SET quantity = quantity - 1
WHERE id = $1 AND quantity > 0`,
[req.params.id]
);

res.json({message:"Đã trừ linh kiện"});

} catch(err){
res.status(500).json(err.message);
}

});
//api lưu linh kiện đã dùng
app.post("/api/repair-parts", async (req, res) => {

try {

const { booking_id, part_id } = req.body;

// lưu lịch sử linh kiện
await pool.query(
`INSERT INTO repair_parts_used (booking_id, part_id)
VALUES ($1,$2)`,
[booking_id, part_id]
);

// trừ kho
await pool.query(
`UPDATE parts
SET quantity = quantity - 1
WHERE id=$1 AND quantity > 0`,
[part_id]
);

res.json({message:"Đã lưu linh kiện"});

} catch(err){

res.status(500).json(err.message);

}

});
// api tạo phiếu nhập 
app.post("/api/import-receipts", async (req, res) => {

try {

const { supplier, note, items } = req.body;

// tạo phiếu nhập
const receipt = await pool.query(
`
INSERT INTO import_receipts (supplier,note)
VALUES ($1,$2)
RETURNING id
`,
[supplier,note]
);

const receiptId = receipt.rows[0].id;

// thêm chi tiết
for(const item of items){

await pool.query(
`INSERT INTO import_receipt_items (receipt_id, part_id, quantity, price)
VALUES ($1,$2,$3,$4)`,
[receiptId, item.part_id, item.quantity, item.price]
);

// cập nhật tồn kho
await pool.query(
`UPDATE parts
SET quantity = quantity + $1
WHERE id = $2`,
[item.quantity, item.part_id]
);

}

res.json({
message:"Tạo phiếu nhập thành công",
receipt_id: receiptId
});

}catch(err){

console.error(err);
res.status(500).json({error:"Server error"});

}

});

// lấy dữ liệu kho 
app.get("/api/admin/inventory", async (req, res) => {

try{

const result = await pool.query(`
SELECT 
id,
name,
quantity
FROM parts
ORDER BY name
`);

res.json(result.rows);

}catch(err){

console.error(err);
res.status(500).json({error:"Server error"});

}

});

// kiểm kê kho 
app.post("/api/admin/stock-audit", async (req, res) => {

try{

const { part_id, actual_quantity } = req.body;

// lấy tồn hệ thống
const part = await pool.query(
"SELECT quantity FROM parts WHERE id=$1",
[part_id]
);

const systemQty = part.rows[0].quantity;

const diff = actual_quantity - systemQty;

// lưu kiểm kê
await pool.query(
`INSERT INTO stock_audits
(part_id,system_quantity,actual_quantity,difference)
VALUES ($1,$2,$3,$4)`,
[part_id,systemQty,actual_quantity,diff]
);

// cập nhật lại tồn kho theo kiểm kê
await pool.query(
`UPDATE parts
SET quantity=$1
WHERE id=$2`,
[actual_quantity,part_id]
);

res.json({message:"Kiểm kê thành công"});

}catch(err){

console.error(err);
res.status(500).json({error:"Server error"});

}

});
// ================= SERVER =================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
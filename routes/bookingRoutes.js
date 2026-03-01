const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.post('/', (req, res) => {
    const { customer_name, phone_number, device_model, repair_issue, appointment_date } = req.body;

    const sql = `
        INSERT INTO bookings 
        (customer_name, phone_number, device_model, repair_issue, appointment_date)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [customer_name, phone_number, device_model, repair_issue, appointment_date], 
    (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: 'Đặt lịch thành công!' });
    });
});

module.exports = router;
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "nmtmobilevn@gmail.com", // email của bạn
    pass: "rysjgkaitplvyzze", // app password
  },
});

const sendBookingEmail = async (booking) => {
  const mailOptions = {
    from: "nmtmobilevn@gmail.com",
    to: booking.email,
    subject: "Xác nhận đặt lịch sửa chữa",
    html: `
      <h2>Xin chào ${booking.customer_name}</h2>
      <p>Bạn đã đặt lịch sửa chữa thành công.</p>
      <ul>
        <li>Số điện thoại: ${booking.phone_number}</li>
        <li>Dòng máy: ${booking.device_model}</li>
        <li>Lỗi: ${booking.repair_issue}</li>
        <li>Ngày hẹn: ${booking.appointment_date}</li>
      </ul>
      <p>Cửa hàng sẽ liên hệ với bạn sớm nhất.</p>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendBookingEmail;
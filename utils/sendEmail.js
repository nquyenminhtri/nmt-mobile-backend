import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (to, otp, type = "history", bookingInfo = null) => {
  try {
    let subject = "";
    let htmlContent = "";

    // ===== OTP TRA CỨU =====
    if (type === "history") {
      subject = "Mã OTP tra cứu lịch sửa chữa";
      htmlContent = `
        <h2>Tra cứu lịch sửa chữa</h2>
        <p>Mã OTP của bạn là:</p>
        <h1>${otp}</h1>
        <p>Mã có hiệu lực trong 60 giây.</p>
      `;
    }

    // ===== OTP ĐẶT LỊCH =====
    if (type === "booking") {
      subject = "Mã OTP xác nhận đặt lịch";
      htmlContent = `
        <h2>Xác thực đặt lịch sửa chữa</h2>
        <p>Mã OTP của bạn là:</p>
        <h1>${otp}</h1>
        <p>Mã có hiệu lực trong 5 phút.</p>
      `;
    }

    // ===== MAIL XÁC NHẬN ĐẶT LỊCH =====
    if (type === "booking_success" && bookingInfo) {
      subject = "Xác nhận đặt lịch thành công";

      htmlContent = `
        <h2>🎉 Đặt lịch thành công</h2>
        <p>Xin chào <strong>${bookingInfo.customer_name}</strong>,</p>

        <p>Chúng tôi đã nhận được yêu cầu sửa chữa của bạn với thông tin sau:</p>

        <ul>
          <li><strong>Số điện thoại:</strong> ${bookingInfo.phone_number}</li>
          <li><strong>Email:</strong> ${bookingInfo.email}</li>
          <li><strong>Thiết bị:</strong> ${bookingInfo.device_model}</li>
          <li><strong>Lỗi:</strong> ${bookingInfo.repair_issue}</li>
          <li><strong>Ngày hẹn:</strong> ${bookingInfo.appointment_date}</li>
        </ul>

        <p>Chúng tôi sẽ liên hệ với bạn sớm nhất.</p>

        <p>Trân trọng,<br/>NMT Repair</p>
      `;
    }

    const data = await resend.emails.send({
      from: "onboarding@resend.dev",
      to,
      subject,
      html: htmlContent,
    });

    console.log("Email sent:", data);

  } catch (error) {
    console.error("Resend error:", error);
    throw error;
  }
};
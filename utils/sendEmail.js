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
      subject = "Xác nhận đặt lịch sửa chữa thành công";

      // format ngày giờ đẹp
      const formattedDate = new Date(bookingInfo.appointment_date)
        .toLocaleString("vi-VN");

      htmlContent = `
      <div style="font-family: Arial, sans-serif; background:#f4f6f9; padding:20px;">
        
        <div style="max-width:600px; margin:auto; background:white; border-radius:10px; overflow:hidden; box-shadow:0 5px 15px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <div style="background:linear-gradient(90deg,#2563eb,#3b82f6); padding:20px; color:white; text-align:center;">
            <h1 style="margin:0;">NMT Repair</h1>
            <p style="margin:5px 0 0;">Xác nhận đặt lịch thành công</p>
          </div>

          <!-- BODY -->
          <div style="padding:25px; color:#333;">
            <p>Xin chào <strong>${bookingInfo.customer_name}</strong>,</p>

            <p>Cảm ơn bạn đã tin tưởng dịch vụ của chúng tôi. Dưới đây là thông tin đặt lịch của bạn:</p>

            <div style="background:#f9fafb; padding:15px; border-radius:8px; margin-top:15px;">
              <p><strong>📱 Thiết bị:</strong> ${bookingInfo.device_model}</p>
              <p><strong>🔧 Lỗi mô tả:</strong> ${bookingInfo.repair_issue}</p>
              <p><strong>📅 Ngày hẹn:</strong> ${formattedDate}</p>
              <p><strong>📞 SĐT:</strong> ${bookingInfo.phone_number}</p>
              <p><strong>📧 Email:</strong> ${bookingInfo.email}</p>
            </div>

            <p style="margin-top:20px;">
              Chúng tôi sẽ liên hệ với bạn sớm nhất để xác nhận tình trạng máy.
            </p>

            <div style="margin-top:25px; text-align:center;">
              <a href="https://nmtfix.com"
                style="background:#2563eb; color:white; padding:10px 18px; text-decoration:none; border-radius:6px; display:inline-block;">
                Truy cập website
              </a>
            </div>
          </div>

          <!-- FOOTER -->
          <div style="background:#f1f5f9; padding:15px; text-align:center; font-size:12px; color:#666;">
            © ${new Date().getFullYear()} NMT Repair. All rights reserved.
          </div>

        </div>
      </div>
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
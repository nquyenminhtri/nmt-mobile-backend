import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (to, otp) => {
  try {
    const data = await resend.emails.send({
      from: "onboarding@resend.dev", // dùng tạm domain này
      to: to,
      subject: "Mã OTP xác nhận",
      html: `
        <h2>Xác nhận tra cứu sửa chữa</h2>
        <p>Mã OTP của bạn là:</p>
        <h1>${otp}</h1>
        <p>Mã có hiệu lực trong 60 giây.</p>
      `,
    });

    console.log("Email sent:", data);
  } catch (error) {
    console.error("Resend error:", error);
    throw error;
  }
};
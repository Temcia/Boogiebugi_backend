import axios from "axios";

export async function sendOTP(phone: string, otp: string) {
  const response = await axios.post(
    "https://www.fast2sms.com/dev/bulkV2",
    {
      route: "q",
      message: `Your BOOGIEBUGI verification code is ${otp}. Valid for 5 minutes.`,
      numbers: phone,
    },
    {
      headers: {
        authorization: process.env.FAST2SMS_API_KEY!,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.data.return) {
    throw new Error(response.data.message || "Failed to send OTP");
  }

  return response.data;
}

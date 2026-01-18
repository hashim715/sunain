import dotenv from "dotenv";
import nodemailer from "nodemailer";
dotenv.config();

export const email_transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GOOGLE_APP_EMAIL_FROM,
    pass: process.env.GOOGLE_APP_SMTP_GMAIL_PASSWORD,
  },
});

import dotenv from "dotenv";
import nodemailer from "nodemailer";
dotenv.config();

export const email_transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_FROM,
    pass: process.env.APP_PASSWORD,
  },
});

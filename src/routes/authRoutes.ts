import express from "express";
import { Router } from "express";
import {
  googleAuth,
  googleredirectauth,
  getUser,
  logOut,
  refreshToken,
  sendVerificationCodeToPhoneNumber,
  verifyPhoneNumberOnLogin,
  register,
  login,
  verifyEmail,
  resendCodeToEmail,
  changePassword,
  changePhoneNumber,
  verifyChangePhoneNumberCode,
  resendVerificationCodeToPhoneNumber,
} from "../controllers/authentication";
import { protect } from "../middleware/middleware";

export const authRouter: Router = express.Router();

authRouter.route("/google").get(googleAuth);
authRouter.route("/google/callback").post(googleredirectauth);
authRouter.route("/register").post(register);
authRouter.route("/login").post(login);
authRouter.route("/verifyEmail").post(verifyEmail);
authRouter.route("/resendCodeToEmail").post(resendCodeToEmail);
authRouter.route("/me").get(getUser);
authRouter.route("/logout").get(logOut);
authRouter.route("/refresh").post(refreshToken);
authRouter
  .route("/send-verification-code")
  .post(protect, sendVerificationCodeToPhoneNumber);
authRouter
  .route("/resend-verification-code")
  .post(protect, resendVerificationCodeToPhoneNumber);
authRouter
  .route("/verify-phone-number")
  .post(protect, verifyPhoneNumberOnLogin);
authRouter.route("/change-password").post(protect, changePassword);
authRouter.route("/change-phone-number").post(protect, changePhoneNumber);
authRouter
  .route("/verify-change-phone-number")
  .post(protect, verifyChangePhoneNumberCode);

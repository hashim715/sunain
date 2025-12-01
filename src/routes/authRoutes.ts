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
} from "../controllers/authentication";
import { protect } from "../middleware/middleware";

export const authRouter: Router = express.Router();

authRouter.route("/google").get(googleAuth);
authRouter.route("/google/callback").post(googleredirectauth);
authRouter.route("/me").get(getUser);
authRouter.route("/logout").get(logOut);
authRouter.route("/refresh").post(refreshToken);
authRouter
  .route("/send-verification-code")
  .post(protect, sendVerificationCodeToPhoneNumber);
authRouter
  .route("/verify-phone-number")
  .post(protect, verifyPhoneNumberOnLogin);

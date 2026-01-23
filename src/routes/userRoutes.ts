import express from "express";
import { Router } from "express";

import {
  addUserDetails,
  getUserDetails,
  getUserMeetingsMetaData,
  getUserEearnings,
  addPaypalEmail,
  getPaymentEmails,
  addRevolutEmail,
  addWiseEmail,
  changePaymentMethod,
  disconnectStripe,
} from "../controllers/user";

import multer from "multer";

import { protect } from "../middleware/middleware";

export const userRouter: Router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

userRouter
  .route("/addUserDetails")
  .post(protect, upload.single("audio_sample"), addUserDetails);

userRouter.route("/getUserDetails").post(protect, getUserDetails);

userRouter
  .route("/getUserMeetingMetaData")
  .get(protect, getUserMeetingsMetaData);

userRouter.route("/getUserEarnings").get(protect, getUserEearnings);

userRouter.route("/addPaypalEmail").post(protect, addPaypalEmail);

userRouter.route("/addRevolutEmail").post(protect, addRevolutEmail);

userRouter.route("/addWiseEmail").post(protect, addWiseEmail);

userRouter.route("/getPaymentEmails").get(protect, getPaymentEmails);

userRouter.route("/changePaymentMethod").post(protect, changePaymentMethod);

userRouter.route("/disconnectStripe").post(protect, disconnectStripe);

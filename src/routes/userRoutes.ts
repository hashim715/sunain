import express from "express";
import { Router } from "express";

import {
  refreshAccessTokenController,
  getAuthorizedUrl,
  addUserDetails,
  getUserDetails,
} from "../controllers/user";
import multer from "multer";

import { protect } from "../middleware/middleware";
import { refreshAccessToken } from "../middleware/refreshAccessToken";

export const userRouter: Router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

// userRouter
//   .route("/refreshAccessTokens")
//   .get(protect, refreshAccessToken, refreshAccessTokenController);
// userRouter
//   .route("/getAuthorizedUrl")
//   .get(protect, refreshAccessToken, getAuthorizedUrl);
userRouter
  .route("/addUserDetails")
  .post(protect, upload.single("audio_sample"), addUserDetails);

userRouter.route("/getUserDetails").post(protect, getUserDetails);

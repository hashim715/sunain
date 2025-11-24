import express from "express";
import { Router } from "express";

import {
  refreshAccessTokenController,
  getAuthorizedUrl,
  addUserDetails,
  getUserDetails,
  getAgoraToken,
} from "../controllers/user";

import { protect } from "../middleware/middleware";
import { agoraMiddleware } from "../middleware/agoraMiddleware";
import { refreshAccessToken } from "../middleware/refreshAccessToken";

export const userRouter: Router = express.Router();

// userRouter
//   .route("/refreshAccessTokens")
//   .get(protect, refreshAccessToken, refreshAccessTokenController);
// userRouter
//   .route("/getAuthorizedUrl")
//   .get(protect, refreshAccessToken, getAuthorizedUrl);
userRouter.route("/addUserDetails").post(protect, addUserDetails);
userRouter.route("/getUserDetails").post(protect, getUserDetails);
userRouter
  .route("/getAgoraToken/rtc/:channel/:role/:tokentype/:uid")
  .get(protect, agoraMiddleware, getAgoraToken);

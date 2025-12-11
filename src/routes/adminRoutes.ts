import express from "express";
import { Router } from "express";

import {
  getUsersWaitList,
  updateUserStatus,
  flaggedConversations,
  updateConversationFlaggedStatus,
  flaggedConversationsCount,
  getAllRoomsForUser,
  getPaymentRoomsForUser,
  getRoomDetails,
  getAllUsers,
  getAllLanguageStats,
  getLanguageStats,
  getDialectDistribution,
  getDialectPairs,
} from "../controllers/adminControllers";

export const adminRouter: Router = express.Router();

adminRouter.route("/getUserWaitList").get(getUsersWaitList);
adminRouter.route("/updateUserStatus").post(updateUserStatus);
adminRouter.route("/allflaggedConversations").get(flaggedConversations);
adminRouter.route("/unflagConversation").post(updateConversationFlaggedStatus);
adminRouter.route("/flagged-count/:userId").get(flaggedConversationsCount);
adminRouter.route("/getAllRoomsForUser/:userId").get(getAllRoomsForUser);
adminRouter
  .route("/getPaymentRoomsForUser/:userId")
  .get(getPaymentRoomsForUser);
adminRouter.route("/getRoomDetails/:roomId").get(getRoomDetails);
adminRouter.route("/getAllUsers").get(getAllUsers);
adminRouter.route("/getLanguageStats/:language").get(getLanguageStats);
adminRouter.route("/getAllLanguageStats").get(getAllLanguageStats);
adminRouter
  .route("/getDialectDistribution/:language")
  .get(getDialectDistribution);
adminRouter.route("/getDialectPairs/:language").get(getDialectPairs);

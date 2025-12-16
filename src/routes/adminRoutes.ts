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
  markRoomsAsPaid,
  undoPayroll,
  login,
} from "../controllers/adminControllers";
import { protectAdmin } from "../middleware/adminMiddleware";

export const adminRouter: Router = express.Router();

adminRouter.route("/getUserWaitList").get(protectAdmin, getUsersWaitList);
adminRouter.route("/updateUserStatus").post(protectAdmin, updateUserStatus);
adminRouter
  .route("/allflaggedConversations")
  .get(protectAdmin, flaggedConversations);
adminRouter
  .route("/unflagConversation")
  .post(protectAdmin, updateConversationFlaggedStatus);
adminRouter
  .route("/flagged-count/:userId")
  .get(protectAdmin, flaggedConversationsCount);
adminRouter
  .route("/getAllRoomsForUser/:userId")
  .get(protectAdmin, getAllRoomsForUser);
adminRouter
  .route("/getPaymentRoomsForUser/:userId")
  .get(protectAdmin, getPaymentRoomsForUser);
adminRouter.route("/getRoomDetails/:roomId").get(protectAdmin, getRoomDetails);
adminRouter.route("/getAllUsers").get(protectAdmin, getAllUsers);
adminRouter
  .route("/getLanguageStats/:language")
  .get(protectAdmin, getLanguageStats);
adminRouter
  .route("/getAllLanguageStats")
  .get(protectAdmin, getAllLanguageStats);
adminRouter
  .route("/getDialectDistribution/:language")
  .get(protectAdmin, getDialectDistribution);
adminRouter
  .route("/getDialectPairs/:language")
  .get(protectAdmin, getDialectPairs);
adminRouter.route("/markRoomsAsPaid").post(protectAdmin, markRoomsAsPaid);
adminRouter.route("/undoPayroll").post(protectAdmin, undoPayroll);
adminRouter.route("/login").post(login);

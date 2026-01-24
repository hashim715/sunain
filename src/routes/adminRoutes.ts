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
  getUsersWithoutPaymentMethod,
  sendPaymentMethodReminders,
  sendPaymentReminderToUser,
  createAnnotator,
  listAnnotators,
  updateAnnotatorFolders,
  deleteAnnotator,
  assignRecordingsToSpecificAnnotator,
  clearAnnotatorAssignments,
  getAssignmentStats,
  clearAllAssignments,
  getPayrollData,
  getAnnotatorById,
  updateAnnotator,
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

adminRouter
  .route("/users-without-payment")
  .get(protectAdmin, getUsersWithoutPaymentMethod);
adminRouter
  .route("/send-payment-reminder/:userId")
  .post(protectAdmin, sendPaymentReminderToUser);
adminRouter
  .route("/send-payment-reminders")
  .post(protectAdmin, sendPaymentMethodReminders);
adminRouter.route("/createAnnotator").post(protectAdmin, createAnnotator);
adminRouter.route("/annotators").get(protectAdmin, listAnnotators);
adminRouter
  .route("/annotators/:annotatorId")
  .post(protectAdmin, updateAnnotatorFolders);
adminRouter
  .route("/annotators/:annotatorId")
  .post(protectAdmin, deleteAnnotator);
adminRouter
  .route("/assign-recordings-to-annotator")
  .post(protectAdmin, assignRecordingsToSpecificAnnotator);
adminRouter
  .route("/annotators/:annotatorId/assignments")
  .post(protectAdmin, clearAnnotatorAssignments);
adminRouter
  .route("/clear-all-assignments")
  .post(protectAdmin, clearAllAssignments);
adminRouter.route("/assignment-stats").get(protectAdmin, getAssignmentStats);
adminRouter
  .route("/available-recordings-count")
  .get(protectAdmin, getAssignmentStats);
adminRouter.route("/getPayrollData").get(protectAdmin, getPayrollData);
adminRouter
  .route("/annotators/:annotatorId")
  .get(protectAdmin, getAnnotatorById)
  .put(protectAdmin, updateAnnotator)
  .delete(protectAdmin, deleteAnnotator);

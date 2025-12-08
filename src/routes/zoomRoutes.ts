import express from "express";
import {
  startRecordingSession,
  stopRecordingSession,
  handleParticipantLeft,
  createMeeting,
  checkHostStatus,
  joinMeeting,
  leaveMeeting,
} from "../controllers/zoomControllers";
import { protect } from "../middleware/middleware";

export const zoomRouter = express.Router();

zoomRouter.route("/recording/start").post(protect, startRecordingSession);
zoomRouter.route("/recording/stop").post(protect, stopRecordingSession);
zoomRouter
  .route("/recording/participant-left")
  .post(protect, handleParticipantLeft);
zoomRouter.route("/meeting/create").post(protect, createMeeting);
zoomRouter.route("/meeting/checkHostStatus").post(protect, checkHostStatus);
zoomRouter.route("/meeting/joinMeeting").post(protect, joinMeeting);
zoomRouter.route("/meeting/leaveMeeting").post(protect, leaveMeeting);

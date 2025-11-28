import express from "express";
import {
  startRecordingSession,
  stopRecordingSession,
  handleParticipantLeft,
} from "../controllers/zoomControllers";

export const zoomRouter = express.Router();

zoomRouter.post("/recording/start", startRecordingSession);
zoomRouter.post("/recording/stop", stopRecordingSession);
zoomRouter.post("/recording/participant-left", handleParticipantLeft);

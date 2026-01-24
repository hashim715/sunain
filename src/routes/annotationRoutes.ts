import express from "express";
import { Router } from "express";
import {
  listLanguages,
  listDateFolders,
  listTimeFolders,
  languageTimeFolderRecordingsAndNextUnannotated,
  getRecordingFilesPlusAnnotated,
  getNextAvailableRecording,
  uploadAnnotationFile,
  getPreviousAvailableRecording,
  getFirstRecordingForUser,
  login,
  removeRecordingFromAnnotator,
} from "../controllers/annotationControllers";

export const annotationRouter: Router = express.Router();

import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

annotationRouter.post(
  "/uploadAnnotationFile",
  upload.single("content"),
  uploadAnnotationFile
);

annotationRouter.route("/login").post(login);

annotationRouter.route("/listLanguages").get(listLanguages);

annotationRouter.route("/listDateFolders/:language").get(listDateFolders);

annotationRouter
  .route("/listTimeFolders/:language/:dateFolder")
  .get(listTimeFolders);

annotationRouter.get(
  "/recordings/:language/:dateFolder/:timeFolder",
  languageTimeFolderRecordingsAndNextUnannotated
);

annotationRouter
  .route(
    "/getRecordingFilesPlusAnnotated/:language/:dateFolder/:timeFolder/:recordingId"
  )
  .get(getRecordingFilesPlusAnnotated);

annotationRouter.get(
  "/nextRecording/:language/:currentDateFolder/:currentTimeFolder/:currentRecordingId",
  getNextAvailableRecording
);

annotationRouter.get(
  "/previousRecording/:language/:currentDateFolder/:currentTimeFolder/:currentRecordingId",
  getPreviousAvailableRecording
);

annotationRouter
  .route("/firstRecording/:language")
  .get(getFirstRecordingForUser);

annotationRouter.post(
  "/removeRecordingFromAnnotator",
  removeRecordingFromAnnotator
);

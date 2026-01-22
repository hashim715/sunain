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
} from "../controllers/annotationControllers";

export const annotationRouter: Router = express.Router();

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

annotationRouter
  .route(
    "/nextRecording/:language/:dateFolder/:currentTimeFolder/:currentRecordingId"
  )
  .get(getNextAvailableRecording);

annotationRouter.get(
  "/previousRecording/:language/:dateFolder/:currentTimeFolder/:currentRecordingId",
  getPreviousAvailableRecording
);

annotationRouter
  .route("/firstRecording/:language")
  .get(getFirstRecordingForUser);

annotationRouter.route("/uploadAnnotationFile").post(uploadAnnotationFile);

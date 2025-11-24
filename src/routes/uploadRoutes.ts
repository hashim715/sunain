import express from "express";
import { Router } from "express";
import {
  getSignedUrlFromS3,
  sendMessageToSQS,
} from "../controllers/uploadController";

export const uploadRouter: Router = express.Router();

import { protect } from "../middleware/middleware";

uploadRouter.route("/getSignedUrl").get(protect, getSignedUrlFromS3);
uploadRouter.route("/sendSQSMessage").post(protect, sendMessageToSQS);

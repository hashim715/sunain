import express from "express";
import { Router } from "express";
import { getSignedUrlFromS3 } from "../controllers/controller";

export const uploadRouter: Router = express.Router();

uploadRouter.route("/getSignedUrl").get(getSignedUrlFromS3);

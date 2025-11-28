import express from "express";
import { Router } from "express";
import {
  generateZoomSignature,
  handleZoomWebhook,
} from "../controllers/zoomSDKAuthEndpoint";

export const ZoomAuthEndpointRouter: Router = express.Router();

import { protect } from "../middleware/middleware";

ZoomAuthEndpointRouter.route("/signature").post(protect, generateZoomSignature);
ZoomAuthEndpointRouter.route("/webhook").post(handleZoomWebhook);

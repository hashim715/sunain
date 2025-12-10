import { protect } from "../middleware/middleware";
import express from "express";
import { Router } from "express";

import { getAllData } from "../controllers/conversationDataControllers";

export const conversationDataRouter: Router = express.Router();

conversationDataRouter.route("/getAllData").get(protect, getAllData);

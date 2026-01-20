import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
// import { localRecordingQueue } from "./chatController";
import { transcriptQueue } from "./zoomSDKAuthEndpoint";
import { prisma } from "../config/postgres";
import axios from "axios";
